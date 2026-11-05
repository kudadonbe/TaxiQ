import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { loadPlaces, metresBetween, searchPlaces, type Place, type PlaceType } from '../places'
import { MAP_CENTER, subscribePositions, type Positions } from '../positions'
import type { Taxi } from '../types'
import { createPlotLayer, loadPlots } from './plotLayer'

type Status = 'idle' | 'answered' | 'suspended'

interface Props {
  taxis: Taxi[]
  interested: ReadonlySet<string>
  // Pickup of the call being taken, if it was chosen from the place search.
  pickupAt: [number, number] | undefined
  // Public mode: tapping a car picks that taxi for hiring.
  onPickTaxi?: (id: string) => void
}

const typeIcon: Record<PlaceType, string> = { h: '🏠', r: '🛣️', l: '📍', p: '▫️' }

// Pin for a searched place. Static markup, no user data.
const PIN_SVG = `<svg viewBox="0 0 24 32" width="28" height="36" aria-hidden="true">
  <path d="M12 1C6 1 1.5 5.4 1.5 11.2 1.5 19 12 31 12 31s10.5-12 10.5-19.8C22.5 5.4 18 1 12 1z" fill="#e11d48" stroke="#fff" stroke-width="2"/>
  <circle cx="12" cy="11" r="4" fill="#fff"/>
</svg>`

// Car body colour per status (the car SVG paints its body with currentColor).
const statusClass: Record<Status, string> = {
  idle: 'text-yellow-300',
  answered: 'text-emerald-500',
  suspended: 'text-rose-600',
}
const labelClass: Record<Status, string> = {
  idle: 'bg-white text-slate-900 border-slate-900',
  answered: 'bg-emerald-500 text-slate-950 border-emerald-900',
  suspended: 'bg-rose-600 text-white border-rose-900',
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
export default function MapView({ taxis, interested, pickupAt, onPickTaxi }: Props) {
  const { lang, t, driverName } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef(new Map<string, { marker: L.Marker; parts: MarkerParts }>())
  const positions = useRef<Positions>(new Map())
  const highlight = useRef<L.Layer | null>(null)
  const pickupPin = useRef<L.Marker | null>(null)
  const pickRef = useRef(onPickTaxi)
  useEffect(() => {
    pickRef.current = onPickTaxi
  }, [onPickTaxi])

  const [places, setPlaces] = useState<Place[] | null>(null)
  const [showPlots, setShowPlots] = useState(true)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const meLayer = useRef<L.LayerGroup | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Place | null>(null)
  const [nearest, setNearest] = useState<{ taxi: Taxi; metres: number }[]>([])
  const results = places && query && !selected ? searchPlaces(places, query) : []
  const placeName = (p: Place) => (lang === 'dv' && p.d ? p.d : p.e)

  // Create the map once.
  useEffect(() => {
    const m = L.map(box.current!, { zoomControl: true, attributionControl: true, maxZoom: 22, minZoom: 2, worldCopyJump: true }).setView(MAP_CENTER, 16)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    m.attributionControl.addAttribution(
      'Place names: <a href="https://kulhudhuffushicity.gov.mv/map">Kulhudhuffushi City Council</a> map, via <a href="https://mapkf.vercel.app">mapkf</a> by emjey',
    )
    map.current = m
    const all = markers.current
    return () => {
      m.remove()
      map.current = null
      all.clear()
    }
  }, [])

  // Council plot chart (house land areas) as a switchable layer under the cars and labels.
  useEffect(() => {
    const m = map.current
    if (!m || !showPlots) return
    let layer: L.LayerGroup | null = null
    let cancelled = false
    void loadPlots().then((plots) => {
      if (cancelled) return
      layer = createPlotLayer(plots, { lang, plotWord: t.plot }).addTo(m)
    })
    return () => {
      cancelled = true
      layer?.remove()
    }
  }, [showPlots, lang, t.plot])

  // Island and town names across the Maldives (OpenStreetMap), on the islands themselves:
  // towns from zoom 8, islands from 11, islets from 13; hidden once house names take over (17+).
  useEffect(() => {
    const m = map.current
    if (!m) return
    let cancelled = false
    let all: { e: string; d: string; r: number; p: [number, number] }[] = []
    const layer = L.layerGroup().addTo(m)
    const render = () => {
      layer.clearLayers()
      const z = m.getZoom()
      if (z < 8 || z >= 17) return
      const maxRank = z >= 13 ? 3 : z >= 11 ? 2 : 1
      const view = m.getBounds().pad(0.2)
      let shown = 0
      for (const it of all) {
        if (it.r > maxRank || !view.contains(it.p)) continue
        const el = document.createElement('span')
        el.className = `map-label island-label island-rank-${it.r}`
        el.textContent = lang === 'dv' ? it.d || it.e : it.e || it.d
        layer.addLayer(L.marker(it.p, { icon: L.divIcon({ html: el, className: '', iconSize: [0, 0] }), interactive: false, keyboard: false, zIndexOffset: -2000 }))
        if (++shown >= 250) break
      }
    }
    void import('../data/islands.json').then((mod) => {
      if (cancelled) return
      all = mod.default as typeof all
      render()
    })
    m.on('moveend', render)
    return () => {
      cancelled = true
      m.off('moveend', render)
      layer.remove()
    }
  }, [lang])

  // The viewer's own location (asked only when they press the button; nothing is stored or sent).
  const locate = () => {
    const m = map.current
    if (!m || !('geolocation' in navigator)) return setLocError(t.locationUnavailable)
    setLocating(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const at: L.LatLngExpression = [pos.coords.latitude, pos.coords.longitude]
        meLayer.current?.remove()
        meLayer.current = L.layerGroup([
          L.circle(at, { radius: pos.coords.accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.12, interactive: false }),
          L.circleMarker(at, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false }),
        ]).addTo(m)
        m.flyTo(at, Math.max(m.getZoom(), 17), { duration: 0.8 })
      },
      (err) => {
        setLocating(false)
        setLocError(err.code === err.PERMISSION_DENIED ? t.locationDenied : t.locationUnavailable)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    )
  }

  // House and landmark names drawn on the map, like the council chart. Only when zoomed in close
  // (zoom 18+), and only those in view, so the map stays fast with 3,000+ houses.
  useEffect(() => {
    const m = map.current
    if (!m) return
    let cancelled = false
    let all: Place[] = []
    const layer = L.layerGroup().addTo(m)
    const render = () => {
      layer.clearLayers()
      const zoom = m.getZoom()
      if (zoom < 18) return
      // Labels grow as you zoom in, so names stay readable inside the plots.
      m.getContainer().style.setProperty('--map-label-size', `${Math.round(10 * 1.45 ** (zoom - 18))}px`)
      const view = m.getBounds().pad(0.1)
      let shown = 0
      for (const p of all) {
        if (p.t !== 'h' && p.t !== 'l') continue
        const at = p.p[0]!
        if (!view.contains(at)) continue
        const el = document.createElement('span')
        el.className = `map-label ${p.t === 'l' ? 'map-label-landmark' : ''}`
        el.textContent = lang === 'dv' && p.d ? p.d : p.e
        const icon = L.divIcon({ html: el, className: '', iconSize: [0, 0] })
        layer.addLayer(L.marker(at, { icon, interactive: false, keyboard: false, zIndexOffset: -1000 }))
        if (++shown >= 400) break
      }
    }
    void loadPlaces().then((list) => {
      if (cancelled) return
      all = list
      setPlaces(list)
      render()
    })
    m.on('moveend', render)
    return () => {
      cancelled = true
      m.off('moveend', render)
      layer.remove()
    }
  }, [lang])

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
      const status: Status = taxi.suspended ? 'suspended' : interested.has(taxi.id) ? 'answered' : 'idle'
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
      marker.setZIndexOffset(status === 'answered' ? 1000 : 0)
      const tip = document.createElement('span')
      tip.textContent = `${taxi.taxiNo} · ${driverName(taxi.driver)}`
      marker.unbindTooltip().bindTooltip(tip, { direction: 'top', offset: [0, -22] })
      // Touch screens have no hover: tap a car to show its driver.
      marker.off('click').on('click', () => {
        marker.toggleTooltip()
        if (!taxi.suspended) pickRef.current?.(taxi.id)
      })
    }
  }, [taxis, interested, driverName])

  // Subscribe to positions (simulated for now) and move markers.
  useEffect(() => {
    return subscribePositions(ids.split(',').filter(Boolean), (latest) => {
      positions.current = latest
      for (const [id, p] of latest) {
        const entry = markers.current.get(id)
        if (!entry) continue
        entry.marker.setLatLng([p.lat, p.lng])
        entry.parts.car.style.transform = `rotate(${p.heading}deg)`
      }
    })
  }, [ids])

  // Show the selected place: a pin for a house/landmark, a line along a road.
  useEffect(() => {
    const m = map.current
    highlight.current?.remove()
    highlight.current = null
    if (!m || !selected) return
    if (selected.t === 'r' && selected.p.length > 1) {
      const line = L.polyline(selected.p, { color: '#e11d48', weight: 7, opacity: 0.6, lineCap: 'round' }).addTo(m)
      highlight.current = line
      m.flyToBounds(line.getBounds().pad(0.4), { duration: 0.8, maxZoom: 18 })
    } else {
      const icon = L.divIcon({ html: PIN_SVG, className: '', iconSize: [28, 36], iconAnchor: [14, 34] })
      highlight.current = L.marker(selected.p[0]!, { icon, keyboard: false, zIndexOffset: 2000 }).addTo(m)
      m.flyTo(selected.p[0]!, 18, { duration: 0.8 })
    }
  }, [selected])

  // The call's pickup gets its own pin, and is the nearest-taxi target when nothing is searched.
  useEffect(() => {
    const m = map.current
    pickupPin.current?.remove()
    pickupPin.current = null
    if (!m || !pickupAt) return
    const icon = L.divIcon({ html: PIN_SVG.replace('#e11d48', '#059669'), className: '', iconSize: [28, 36], iconAnchor: [14, 34] })
    const tip = document.createElement('span')
    tip.textContent = t.pickupPin
    pickupPin.current = L.marker(pickupAt, { icon, keyboard: false, zIndexOffset: 1900 })
      .bindTooltip(tip, { direction: 'top', offset: [0, -34], permanent: true })
      .addTo(m)
    m.flyTo(pickupAt, 18, { duration: 0.8 })
  }, [pickupAt, t.pickupPin])

  const target = selected?.p ?? (pickupAt ? [pickupAt] : null)
  const targetKey = target ? JSON.stringify(target) : ''

  // Nearest available taxis to the target, refreshed every second as they move.
  useEffect(() => {
    if (!targetKey) return
    const pts = JSON.parse(targetKey) as [number, number][]
    const update = () => {
      const list = taxis
        .filter((taxi) => !taxi.suspended)
        .map((taxi) => {
          const pos = positions.current.get(taxi.id)
          if (!pos) return null
          const metres = Math.min(...pts.map((pt) => metresBetween(pt, [pos.lat, pos.lng])))
          return { taxi, metres }
        })
        .filter((x) => x !== null)
        .sort((a, b) => a.metres - b.metres)
        .slice(0, 3)
      setNearest(list)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [targetKey, taxis])

  const choose = (p: Place) => {
    setNearest([])
    setSelected(p)
    setQuery(placeName(p))
  }
  const clearSearch = () => {
    setSelected(null)
    setQuery('')
  }
  const panTo = (id: string) => {
    const pos = positions.current.get(id)
    if (pos) map.current?.flyTo([pos.lat, pos.lng], 18, { duration: 0.6 })
  }

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
          <i className="h-3.5 w-2 rounded-sm border border-slate-900 bg-rose-600" /> {t.mapSuspended}
        </span>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="ms-auto flex min-h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          📍 {locating ? t.locating : t.myLocation}
        </button>
        {locError && <span className="font-semibold text-rose-700">{locError}</span>}
        <label className="flex min-h-8 cursor-pointer items-center gap-1.5 font-medium">
          <input type="checkbox" checked={showPlots} onChange={(e) => setShowPlots(e.target.checked)} className="size-4 accent-emerald-600" />
          {t.plotMap}
        </label>
      </div>
      <div className="relative">
        <div
          ref={box}
          dir="ltr"
          className="h-[calc(100dvh-11rem)] min-h-80 overflow-hidden rounded-xl border border-slate-200 bg-slate-200"
          role="region"
          aria-label={t.map}
        />

        {/* Place search, floating over the map. */}
        <div className="absolute inset-x-2 top-2 z-[1100] sm:inset-x-auto sm:start-14 sm:w-80">
          <div className="flex items-center rounded-xl border border-slate-300 bg-white shadow-lg">
            <input
              type="search"
              value={query}
              onFocus={() => void loadPlaces().then(setPlaces)}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelected(null)
              }}
              placeholder={t.searchPlaces}
              aria-label={t.searchPlaces}
              maxLength={60}
              autoComplete="off"
              className="min-h-11 w-full min-w-0 rounded-xl bg-transparent px-3 text-base outline-none"
            />
            {query && (
              <button type="button" onClick={clearSearch} aria-label={t.clear} className="min-h-11 px-3 text-slate-500">
                ✕
              </button>
            )}
          </div>

          {query && !selected && places && (
            <ul className="mt-1 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {results.length ? (
                results.map((p, i) => (
                  <li key={`${p.e}-${i}`}>
                    <button
                      type="button"
                      onClick={() => choose(p)}
                      className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-slate-50"
                    >
                      <span aria-hidden>{typeIcon[p.t]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{placeName(p)}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {t.placeTypes[p.t]}
                          {p.pl && p.t !== 'p' ? ` · ${t.plot} ${p.pl}` : ''}
                          {lang === 'dv' ? (p.d ? ` · ${p.e}` : '') : p.d ? ` · ${p.d}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-sm text-slate-500">{t.noPlace}</li>
              )}
            </ul>
          )}

          {(selected || (pickupAt && !query)) && (
            <div className="mt-1 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
              {selected ? (
                <p className="font-bold">
                  {typeIcon[selected.t]} {placeName(selected)}
                  {selected.pl && selected.t !== 'p' && (
                    <span className="ms-2 text-sm font-medium text-slate-500">
                      {t.plot} {selected.pl}
                    </span>
                  )}
                </p>
              ) : (
                <p className="font-bold text-emerald-700">📍 {t.pickupPin}</p>
              )}
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{t.nearestTaxis}</p>
              <ul className="mt-1 space-y-1">
                {nearest.map(({ taxi, metres }) => (
                  <li key={taxi.id}>
                    <button
                      type="button"
                      onClick={() => panTo(taxi.id)}
                      className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-start hover:bg-slate-50"
                    >
                      <span className="w-8 text-center font-black tabular-nums">{taxi.taxiNo}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{driverName(taxi.driver)}</span>
                      <span className="text-sm text-slate-500 tabular-nums" dir="ltr">
                        {metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:text-sm">{t.mapPlaceholder}</p>
    </section>
  )
}
