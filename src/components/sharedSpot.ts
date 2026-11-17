import * as maplibregl from 'maplibre-gl'
import type { Map as MlMap } from 'maplibre-gl'
import { useEffect, useState, type RefObject } from 'react'
import { loadPlacesAround, nearestPlace } from '../places'
import type { SharedSpot } from '../core/shareLink'

// A shared place on the map (Share pickup links, src/core/shareLink.ts): fly there at zoom 18 and
// drop a pin named by the link's place name, or the nearest of our own houses. The pin is built with
// DOM text (textContent), never HTML from the link. Returns the name shown ('' if none is known).
export function useSharedSpot(map: RefObject<MlMap | null>, ready: boolean, spot: SharedSpot | null | undefined, opts: { showPin: boolean; lang: string; label: string; pinHtml: string }) {
  const key = spot ? JSON.stringify(spot) : ''
  const [found, setFound] = useState<{ key: string; name: string } | null>(null)

  // Fly there once the map is ready (and again if another place is shared).
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !key) return
    const { at } = JSON.parse(key) as SharedSpot
    m.flyTo({ center: [at[1], at[0]], zoom: 18, duration: 800 })
  }, [map, ready, key])

  // Without a name in the link, the nearest house or landmark from our places.
  useEffect(() => {
    if (!key) return
    const s = JSON.parse(key) as SharedSpot
    if (s.name) return
    let live = true
    void loadPlacesAround(s.at)
      .then((list) => {
        const p = nearestPlace(list, s.at, 120)
        if (live) setFound({ key: `${key}|${opts.lang}`, name: p ? (opts.lang === 'dv' && p.d ? p.d : p.e) : '' })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [key, opts.lang])
  const name = spot?.name ?? (found?.key === `${key}|${opts.lang}` ? found.name : '')

  // The pin, with its name above it.
  const { showPin, label, pinHtml } = opts
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !key || !showPin) return
    const { at } = JSON.parse(key) as SharedSpot
    const el = document.createElement('div')
    el.className = 'flex flex-col items-center'
    const tag = document.createElement('span')
    tag.className = 'mb-0.5 max-w-48 truncate rounded bg-emerald-700 px-1.5 text-xs font-bold text-white shadow'
    tag.textContent = name || label
    const pin = document.createElement('div')
    pin.innerHTML = pinHtml // a fixed SVG of ours
    el.append(tag, pin)
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([at[1], at[0]]).addTo(m)
    return () => {
      marker.remove()
    }
  }, [map, ready, key, showPin, name, label, pinHtml])

  return name
}
