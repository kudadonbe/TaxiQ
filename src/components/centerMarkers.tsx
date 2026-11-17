import { Building2 } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MlMap, Marker } from 'maplibre-gl'
import { useEffect, useRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { PublicCenter } from '../centerApps'
import { isLogo } from '../core/centerApps'

// Approved taxi centers on the full-screen maps (publicCenters): a round marker with the center's
// logo, or a building icon when it has none. The logo goes in as an <img> from a data URL checked
// again here (PNG or WebP base64 only); the name only as an aria-label, never as HTML. Tap opens the
// center's card (MapView's one open panel). Shown with the Taxi and All chips.
const ll = (p: [number, number]): [number, number] => [p[1], p[0]]

export function useCenterMarkers(map: RefObject<MlMap | null>, ready: boolean, centers: readonly PublicCenter[] | undefined, shown: boolean, lang: string, onOpen: (id: string) => void) {
  const markers = useRef(new Map<string, { marker: Marker; root: Root | null; logo: string | null }>())
  const open = useRef(onOpen)
  useEffect(() => {
    open.current = onOpen
  })
  const key = JSON.stringify(centers ?? [])
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const list = JSON.parse(key) as PublicCenter[]
    const seen = new Set<string>()
    for (const c of list) {
      seen.add(c.id)
      let entry = markers.current.get(c.id)
      if (!entry) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'center-marker'
        el.onclick = (ev) => {
          ev.stopPropagation()
          open.current(c.id)
        }
        entry = { marker: new maplibregl.Marker({ element: el }).setLngLat(ll(c.at)).addTo(m), root: null, logo: null }
        markers.current.set(c.id, entry)
      }
      entry.marker.setLngLat(ll(c.at))
      const el = entry.marker.getElement()
      el.setAttribute('aria-label', lang === 'dv' && c.nameDv ? c.nameDv : c.name)
      el.style.opacity = c.openNow ? '1' : '0.55'
      const logo = c.logo && isLogo(c.logo) ? c.logo : ''
      if (entry.logo !== logo) {
        entry.logo = logo
        const old = entry.root
        if (old) setTimeout(() => old.unmount())
        entry.root = null
        el.replaceChildren()
        const face = document.createElement('span')
        face.className = 'center-marker-face'
        el.append(face)
        if (logo) {
          const img = document.createElement('img')
          img.alt = ''
          img.decoding = 'async'
          img.src = logo
          face.append(img)
        } else {
          entry.root = createRoot(face)
          entry.root.render(<Building2 className="size-5" aria-hidden="true" />)
        }
      }
    }
    for (const [id, entry] of markers.current) {
      if (seen.has(id)) continue
      entry.marker.remove()
      const root = entry.root
      if (root) setTimeout(() => root.unmount())
      markers.current.delete(id)
    }
  }, [key, ready, lang, map])
  // The chips: shown with Taxi and All.
  useEffect(() => {
    for (const e of markers.current.values()) {
      const el = e.marker.getElement()
      const d = shown ? '' : 'none'
      if (el.style.display !== d) el.style.display = d
    }
  })
  // Gone with the map.
  useEffect(() => {
    const all = markers.current
    return () => {
      for (const e of all.values()) {
        e.marker.remove()
        const root = e.root
        if (root) setTimeout(() => root.unmount())
      }
      all.clear()
    }
  }, [])
}
