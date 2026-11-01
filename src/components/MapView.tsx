import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { MAP_CENTER, subscribePositions } from '../positions'
import type { Taxi } from '../types'

type Status = 'idle' | 'answered' | 'assigned'

interface Props {
  taxis: Taxi[]
  interested: ReadonlySet<string>
  assignedId: string | undefined
}


// Car body colour per status (the car SVG paints its body with currentColor).
const statusClass: Record<Status, string> = {
  idle: 'text-yellow-300',
  answered: 'text-emerald-500',
  assigned: 'text-slate-900',
}
const labelClass: Record<Status, string> = {
  idle: 'bg-white text-slate-900 border-slate-900',
  answered: 'bg-emerald-500 text-slate-950 border-emerald-900',
  assigned: 'bg-slate-900 text-white border-white',
}

// Top-down taxi, nose pointing up (north) so rotate(heading) aims it along the road.
// Static markup with no user data, so innerHTML is safe here.
const CAR_SVG = `<svg viewBox="0 0 20 36" width="20" height="36" aria-hidden="true">
  <rect x="1.5" y="1.5" width="17" height="33" rx="6" fill="currentColor" stroke="#0f172a" stroke-width="1.5"/>
  <path d="M4.5 9.5 Q10 6.5 15.5 9.5 L14.5 14 H5.5 Z" fill="#0f172a" opacity=".85"/>
  <path d="M5.5 26 H14.5 L15.5 30 Q10 32 4.5 30 Z" fill="#0f172a" opacity=".7"/>
  <rect x="6.5" y="17" width="7" height="3.5" rx="1" fill="#0f172a"/>
  <rect x="3" y="2.5" width="3" height="2" rx="1" fill="#fef9c3"/>
  <rect x="14" y="2.5" width="3" height="2" rx="1" fill="#fef9c3"/>
</svg>`

interface MarkerParts {
  root: HTMLDivElement
  car: HTMLDivElement
  label: HTMLSpanElement
}

// Marker = rotating car + upright number label. Text goes in via textContent, never HTML.
function markerParts(): MarkerParts {
  const root = document.createElement('div')
  root.className = 'relative size-10'
  const car = document.createElement('div')
  car.className = 'absolute inset-0 grid place-items-center drop-shadow-md will-change-transform'
  car.innerHTML = CAR_SVG
  const label = document.createElement('span')
  label.className = 'absolute -top-4 left-1/2 -translate-x-1/2 rounded-full border px-1.5 text-[11px] leading-4 font-black tabular-nums shadow'
  root.append(car, label)
  return { root, car, label }
}

// Live map of taxis. Leaflet is driven imperatively so 60fps position updates don't re-render React.
export default function MapView({ taxis, interested, assignedId }: Props) {
  const { t, driverName } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef(new Map<string, { marker: L.Marker; parts: MarkerParts }>())

  // Create the map once.
  useEffect(() => {
    const m = L.map(box.current!, { zoomControl: true, attributionControl: true }).setView(MAP_CENTER, 16)
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
    for (const [id, { marker }] of markers.current) {
      if (!live.has(id)) {
        marker.remove()
        markers.current.delete(id)
      }
    }
    for (const taxi of taxis) {
      const status: Status = taxi.id === assignedId ? 'assigned' : interested.has(taxi.id) ? 'answered' : 'idle'
      let entry = markers.current.get(taxi.id)
      if (!entry) {
        const parts = markerParts()
        const icon = L.divIcon({ html: parts.root, className: '', iconSize: [40, 40], iconAnchor: [20, 20] })
        entry = { marker: L.marker(MAP_CENTER, { icon, keyboard: false }).addTo(m), parts }
        markers.current.set(taxi.id, entry)
      }
      const { marker, parts } = entry
      parts.car.className = `absolute inset-0 grid place-items-center drop-shadow-md will-change-transform ${statusClass[status]}`
      parts.label.className = `absolute -top-4 left-1/2 -translate-x-1/2 rounded-full border px-1.5 text-[11px] leading-4 font-black tabular-nums shadow ${labelClass[status]}`
      parts.label.textContent = taxi.taxiNo
      marker.setZIndexOffset(status === 'idle' ? 0 : 1000)
      const tip = document.createElement('span')
      tip.textContent = `${taxi.taxiNo} · ${driverName(taxi.driver)}`
      marker.unbindTooltip().bindTooltip(tip, { direction: 'top', offset: [0, -22] })
      // Touch screens have no hover: tap a car to show its driver.
      marker.off('click').on('click', () => marker.toggleTooltip())
    }
  }, [taxis, interested, assignedId, driverName])

  // Subscribe to positions (simulated for now) and move markers.
  useEffect(() => {
    return subscribePositions(ids.split(',').filter(Boolean), (positions) => {
      for (const [id, p] of positions) {
        const entry = markers.current.get(id)
        if (!entry) continue
        entry.marker.setLatLng([p.lat, p.lng])
        entry.parts.car.style.transform = `rotate(${p.heading}deg)`
      }
    })
  }, [ids])

  return (
    <section className="space-y-2 sm:space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs sm:text-sm">
        <span className="flex items-center gap-1.5">
          <i className="h-3.5 w-2 rounded-sm border border-slate-900 bg-yellow-300" /> {t.mapIdle}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-3.5 w-2 rounded-sm border border-slate-900 bg-emerald-500" /> {t.mapAnswered}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-3.5 w-2 rounded-sm border border-slate-900 bg-slate-900" /> {t.mapAssigned}
        </span>
      </div>
      <div
        ref={box}
        dir="ltr"
        className="h-[calc(100dvh-11rem)] min-h-80 overflow-hidden rounded-xl border border-slate-200 bg-slate-200"
        role="region"
        aria-label={t.map}
      />
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:text-sm">{t.mapPlaceholder}</p>
    </section>
  )
}
