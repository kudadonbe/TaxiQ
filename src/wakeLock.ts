import { useEffect, useState } from 'react'

// While someone is Available (a private vehicle or a mobile service), keep the screen on with the
// Screen Wake Lock API, so the phone doesn't dim and lock by itself and GPS keeps updating. A web page
// can't run while the phone is locked or the browser is in the background, so this is the best the
// browser allows. The browser drops the lock whenever the page is hidden; it is asked for again when
// the page is visible. It costs battery, so the hint suggests a charger.
//
// `wake`: 'on' (held), 'off' (not active), 'unsupported' or 'refused' (the person should keep the
// screen on themselves). `wasHidden`: the page went into the background while active and came back.

export type WakeState = 'off' | 'on' | 'unsupported' | 'refused'

interface Sentinel {
  release: () => Promise<void>
  addEventListener: (type: 'release', fn: () => void) => void
}
interface WakeLockApi {
  request: (type: 'screen') => Promise<Sentinel>
}

const api = (): WakeLockApi | null => {
  try {
    const nav = navigator as Navigator & { wakeLock?: WakeLockApi }
    return nav.wakeLock && typeof nav.wakeLock.request === 'function' ? nav.wakeLock : null
  } catch {
    return null
  }
}

export function useStayAwake(active: boolean) {
  const [wake, setWake] = useState<WakeState>('off')
  const [wasHidden, setWasHidden] = useState(false)

  useEffect(() => {
    const lockApi = api()
    if (!active) return
    let sentinel: Sentinel | null = null
    let stopped = false
    let hidden = document.visibilityState === 'hidden'
    const ask = () => {
      if (!lockApi || sentinel || document.visibilityState !== 'visible') return
      lockApi
        .request('screen')
        .then((s) => {
          if (stopped) {
            s.release().catch(() => {})
            return
          }
          sentinel = s
          setWake('on')
          s.addEventListener('release', () => {
            if (sentinel === s) sentinel = null
          })
        })
        .catch(() => {
          if (!stopped) setWake('refused')
        })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hidden = true
        return
      }
      if (hidden) setWasHidden(true)
      hidden = false
      ask()
    }
    ask()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (sentinel) sentinel.release().catch(() => {})
      sentinel = null
      setWake('off')
      setWasHidden(false)
    }
  }, [active])

  const state: WakeState = !active ? 'off' : api() ? wake : 'unsupported'
  return { wake: state, wasHidden: active && wasHidden, dismissHidden: () => setWasHidden(false) }
}
