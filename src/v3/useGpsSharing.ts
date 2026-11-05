import { useEffect, useRef, useState } from 'react'
import { ApiFailure, useApi } from './api'

// Driver's phone: while online, watch GPS and send the position to the API (at most every
// SEND_MS). Keeps the screen awake where the browser allows, because phones pause GPS for web
// pages in the background. Stops as soon as the driver goes offline or leaves the screen.

const SEND_MS = 4000

export interface GpsStatus {
  accuracy: number | null // metres
  lastSent: number | null // ms
  error: 'denied' | 'unavailable' | 'unsupported' | string | null
}

export function useGpsSharing(online: boolean): GpsStatus {
  const call = useApi()
  const [status, setStatus] = useState<GpsStatus>({ accuracy: null, lastSent: null, error: null })
  const lastSend = useRef(0)

  useEffect(() => {
    if (!online) return
    if (!('geolocation' in navigator)) {
      queueMicrotask(() => setStatus((s) => ({ ...s, error: 'unsupported' })))
      return
    }
    let lock: { release: () => Promise<void> } | null = null
    const wake = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
    wake?.request('screen').then((l) => (lock = l)).catch(() => {})

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, heading, speed, accuracy } = pos.coords
        setStatus((s) => ({ ...s, accuracy, error: null }))
        const now = Date.now()
        if (now - lastSend.current < SEND_MS) return
        lastSend.current = now
        const body: Record<string, number> = { lat, lng, accuracy }
        if (heading !== null && Number.isFinite(heading) && heading >= 0 && heading < 360) body.heading = heading
        if (speed !== null && Number.isFinite(speed) && speed >= 0) body.speed = speed
        call('POST', '/v1/me/position', body)
          .then(() => setStatus((s) => ({ ...s, lastSent: Date.now() })))
          .catch((e) => setStatus((s) => ({ ...s, error: e instanceof ApiFailure ? e.code : 'network' })))
      },
      (err) => setStatus((s) => ({ ...s, error: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' })),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    )
    return () => {
      navigator.geolocation.clearWatch(id)
      void lock?.release().catch(() => {})
    }
  }, [online, call])

  return online ? status : { accuracy: null, lastSent: null, error: null }
}
