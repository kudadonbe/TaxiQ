import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { subscribePositions } from '../positions'
import type { Taxi } from '../types'

type Status = 'idle' | 'answered' | 'assigned'

interface Props {
  taxis: Taxi[]
  interested: ReadonlySet<string>
  assignedId: string | undefined
}

const MALE: L.LatLngExpression = [4.1745, 73.5105]

const statusClass: Record<Status, string> = {
  idle: 'bg-yellow-300 text-slate-900 border-slate-900',
  answered: 'bg-emerald-500 text-slate-950 border-emerald-900',
  assigned: 'bg-slate-900 text-white border-white',
}

// Marker content is built with DOM APIs (textContent), never HTML strings.
function markerEl(taxi: Taxi, status: Status) {
  const el = document.createElement('div')
  el.className = `grid h-7 min-w-9 place-items-center rounded-full border-2 px-1.5 text-sm font-black shadow-md tabular-nums ${statusClass[status]}`
  el.textContent = taxi.taxiNo
  return el
}

// Live map of taxis. Leaflet is driven imperatively so 60fps position updates don't re-render React.
export default function MapView({ taxis, interested, assignedId }: Props) {
  const { t, driverName } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef(new Map<string, L.Marker>())

  // Create the map once.
  useEffect(() => {
    const m = L.map(box.current!, { zoomControl: true, attributionControl: true }).setView(MALE, 16)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    map.current = m
    const all = markers.current
    return () => {
      m.remove()
      map.current = null
      all.clear()
    }
  }, [])

  // Keep one marker per registered taxi, styled by its queue status.
  const ids = taxis.map((x) => x.id).join(',')
  useEffect(() => {
    const m = map.current
    if (!m) return
    const live = new Set(taxis.map((x) => x.id))
    for (const [id, marker] of markers.current) {
      if (!live.has(id)) {
        marker.remove()
        markers.current.delete(id)
      }
    }
    for (const taxi of taxis) {
      const status: Status = taxi.id === assignedId ? 'assigned' : interested.has(taxi.id) ? 'answered' : 'idle'
      const icon = L.divIcon({ html: markerEl(taxi, status), className: '', iconSize: undefined, iconAnchor: [18, 14] })
      const tip = document.createElement('span')
      tip.textContent = `${taxi.taxiNo} · ${driverName(taxi.driver)}`
      let marker = markers.current.get(taxi.id)
      if (!marker) {
        marker = L.marker(MALE, { icon, keyboard: false }).addTo(m)
        markers.current.set(taxi.id, marker)
      } else marker.setIcon(icon)
      marker.setZIndexOffset(status === 'idle' ? 0 : 1000)
      marker.unbindTooltip().bindTooltip(tip, { direction: 'top', offset: [0, -14] })
    }
  }, [taxis, interested, assignedId, driverName])

  // Subscribe to positions (simulated for now) and move markers.
  useEffect(() => {
    return subscribePositions(ids.split(',').filter(Boolean), (positions) => {
      for (const [id, p] of positions) markers.current.get(id)?.setLatLng([p.lat, p.lng])
    })
  }, [ids])

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="flex items-center gap-1.5">
          <i className="size-3 rounded-full border-2 border-slate-900 bg-yellow-300" /> {t.mapIdle}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-3 rounded-full border-2 border-emerald-900 bg-emerald-500" /> {t.mapAnswered}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-3 rounded-full bg-slate-900" /> {t.mapAssigned}
        </span>
      </div>
      <div
        ref={box}
        dir="ltr"
        className="h-[70dvh] min-h-80 overflow-hidden rounded-xl border border-slate-200 bg-slate-200"
        role="region"
        aria-label={t.map}
      />
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.mapPlaceholder}</p>
    </section>
  )
}
