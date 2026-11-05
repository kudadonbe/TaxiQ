import { CarTaxiFront, Footprints, MapPin, X } from 'lucide-react'
import { PlaceTypeIcon } from './icons'
import { ic } from './iconStyles'
import type { Feature, LineString } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import type { Map as MlMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre runs data work (plots, GeoJSON) in a web worker. Bundle it with Vite and point MapLibre
// at it; otherwise it looks for a file next to its own module, which the build doesn't produce.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
maplibregl.setWorkerUrl(workerUrl)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { loadPlaces, metresBetween, searchPlaces, type Place } from '../places'
import { route as findRoute, type TravelMode } from '../core/route'
import { MAP_CENTER, ROAD_GRAPH, subscribePositions, type Positions } from '../positions'
import type { Taxi } from '../types'
import { loadPlots, plotPopup, plotsGeoJSON, type Plot } from './plotLayer'

type Status = 'idle' | 'answered' | 'suspended'

interface Props {
  taxis: Taxi[]
  interested: ReadonlySet<string>
  // Pickup of the call being taken, if it was chosen from the place search.
  pickupAt: [number, number] | undefined
  // Public mode: tapping a car picks that taxi for hiring.
  onPickTaxi?: (id: string) => void
  // A trip to draw (pickup -> destination), routed along the roads like a ride app.
  trip?: { from: [number, number]; to: [number, number] }
  // Where car positions come from: the demo simulation (default) or the game world. Keep it stable.
  positionSource?: (ids: readonly string[], onUpdate: (p: Positions) => void) => () => void
}


// Pin for a searched place. Static markup, no user data.
const pinSvg = (fill: string) => `<svg viewBox="0 0 24 32" width="28" height="36" aria-hidden="true">
  <path d="M12 1C6 1 1.5 5.4 1.5 11.2 1.5 19 12 31 12 31s10.5-12 10.5-19.8C22.5 5.4 18 1 12 1z" fill="${fill}" stroke="#fff" stroke-width="2"/>
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

// Top-down taxi, nose pointing up so rotate() aims it along the road.
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
  root.className = 'relative size-10 cursor-pointer'
  const car = document.createElement('div')
  car.className = 'absolute inset-0 grid place-items-center drop-shadow-md will-change-transform'
  car.innerHTML = CAR_SVG
  const label = document.createElement('span')
  label.className = 'absolute -top-4 left-1/2 -translate-x-1/2 rounded-full border px-1.5 text-[11px] leading-4 font-black tabular-nums shadow'
  root.append(car, label)
  return { root, car, label }
}

const ll = (p: [number, number]): [number, number] => [p[1], p[0]] // [lat, lng] -> MapLibre [lng, lat]

// A text label marker that stays upright while the map rotates and tilts.
function labelMarker(text: string, className: string, at: [number, number], m: MlMap): Marker {
  const el = document.createElement('span')
  el.className = className
  el.textContent = text
  return new maplibregl.Marker({ element: el, rotationAlignment: 'viewport', pitchAlignment: 'viewport' }).setLngLat(ll(at)).addTo(m)
}

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

// Live map of taxis, on MapLibre: rotate (two fingers / right-drag), tilt, pinch zoom, compass and
// "my location" like Google Maps. Markers are driven imperatively so 60fps position updates don't
// re-render React.
export default function MapView({ taxis, interested, pickupAt, onPickTaxi, trip, positionSource = subscribePositions }: Props) {
  const { lang, t, driverName } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const markers = useRef(new Map<string, { marker: Marker; parts: MarkerParts; onMap: boolean }>())
  const positions = useRef<Positions>(new Map())
  const pins = useRef<Marker[]>([])
  const pickupPin = useRef<Marker | null>(null)
  const popup = useRef<maplibregl.Popup | null>(null)
  const pickRef = useRef(onPickTaxi)
  useEffect(() => {
    pickRef.current = onPickTaxi
  }, [onPickTaxi])

  const [places, setPlaces] = useState<Place[] | null>(null)
  const [showPlots, setShowPlots] = useState(true)
  const [mode, setMode] = useState<TravelMode>('taxi')
  const tripPins = useRef<Marker[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Place | null>(null)
  const [nearest, setNearest] = useState<{ taxi: Taxi; metres: number }[]>([])
  const results = places && query && !selected ? searchPlaces(places, query) : []
  const placeName = (p: Place) => (lang === 'dv' && p.d ? p.d : p.e)

  // Create the map once.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current!,
      style: OSM_STYLE,
      center: ll(MAP_CENTER),
      zoom: 16,
      minZoom: 1,
      maxZoom: 22,
      maxPitch: 60,
      attributionControl: {
        compact: true,
        customAttribution:
          'Place names: <a href="https://kulhudhuffushicity.gov.mv/map">Kulhudhuffushi City Council</a> map, via <a href="https://mapkf.vercel.app">mapkf</a> by emjey',
      },
    })
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), 'top-right')
    // The viewer's own location: a blue dot with heading, asked only when they press the button.
    m.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'top-right')
    m.on('load', () => setReady(true))
    map.current = m
    const all = markers.current
    return () => {
      m.remove()
      map.current = null
      all.clear()
      setReady(false)
    }
  }, [])

  // Council plot chart (house land areas): a fill + outline layer under the cars and labels.
  const plotsRef = useRef<Plot[]>([])
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    let cancelled = false
    void loadPlots().then((plots) => {
      if (cancelled || m.getSource('plots')) return
      plotsRef.current = plots
      m.addSource('plots', { type: 'geojson', data: plotsGeoJSON(plots) })
      m.addLayer({ id: 'plots-fill', type: 'fill', source: 'plots', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 1 } })
      m.addLayer({
        id: 'plots-line',
        type: 'line',
        source: 'plots',
        paint: { 'line-color': '#1f2937', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.3, 18, 1, 22, 2] },
      })
    })
    return () => {
      cancelled = true
    }
  }, [ready])

  useEffect(() => {
    const m = map.current
    if (!m || !ready || !m.getLayer('plots-fill')) return
    const v = showPlots ? 'visible' : 'none'
    m.setLayoutProperty('plots-fill', 'visibility', v)
    m.setLayoutProperty('plots-line', 'visibility', v)
  }, [showPlots, ready])

  // Tap a plot: its houses and plot number.
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const i = e.features?.[0]?.properties?.i
      const plot = typeof i === 'number' ? plotsRef.current[i] : undefined
      const el = plot && plotPopup(plot, lang, t.plot)
      if (!el) return
      popup.current?.remove()
      popup.current = new maplibregl.Popup({ closeButton: true, maxWidth: '240px' }).setLngLat(e.lngLat).setDOMContent(el).addTo(m)
    }
    const enter = () => (m.getCanvas().style.cursor = 'pointer')
    const leave = () => (m.getCanvas().style.cursor = '')
    m.on('click', 'plots-fill', onClick)
    m.on('mouseenter', 'plots-fill', enter)
    m.on('mouseleave', 'plots-fill', leave)
    return () => {
      m.off('click', 'plots-fill', onClick)
      m.off('mouseenter', 'plots-fill', enter)
      m.off('mouseleave', 'plots-fill', leave)
    }
  }, [ready, lang, t.plot])

  // Island and town names across the Maldives (OpenStreetMap), on the islands themselves:
  // towns from zoom 8, islands from 11, islets from 13; hidden once house names take over (17+).
  useEffect(() => {
    const m = map.current
    if (!m) return
    let cancelled = false
    let all: { e: string; d: string; r: number; p: [number, number] }[] = []
    let shown: Marker[] = []
    const render = () => {
      shown.forEach((x) => x.remove())
      shown = []
      const z = m.getZoom()
      if (z < 8 || z >= 17) return
      const maxRank = z >= 13 ? 3 : z >= 11 ? 2 : 1
      const view = m.getBounds()
      for (const it of all) {
        if (it.r > maxRank || !view.contains(ll(it.p))) continue
        shown.push(labelMarker(lang === 'dv' ? it.d || it.e : it.e || it.d, `map-label island-label island-rank-${it.r}`, it.p, m))
        if (shown.length >= 250) break
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
      shown.forEach((x) => x.remove())
    }
  }, [lang])

  // House and landmark names drawn on the map, like the council chart. Only when zoomed in close
  // (zoom 18+), and only those in view, so the map stays fast with 3,000+ houses.
  useEffect(() => {
    const m = map.current
    if (!m) return
    let cancelled = false
    let all: Place[] = []
    let shown: Marker[] = []
    const render = () => {
      shown.forEach((x) => x.remove())
      shown = []
      const zoom = m.getZoom()
      if (zoom < 18) return
      // Labels grow as you zoom in, so names stay readable inside the plots.
      m.getContainer().style.setProperty('--map-label-size', `${Math.round(10 * 1.45 ** (zoom - 18))}px`)
      const view = m.getBounds()
      for (const p of all) {
        if (p.t !== 'h' && p.t !== 'l') continue
        const at = p.p[0]!
        if (!view.contains(ll(at))) continue
        shown.push(labelMarker(lang === 'dv' && p.d ? p.d : p.e, `map-label ${p.t === 'l' ? 'map-label-landmark' : ''}`, at, m))
        if (shown.length >= 400) break
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
      shown.forEach((x) => x.remove())
    }
  }, [lang])

  // Keep one marker per registered taxi, styled by its queue status.
  const ids = taxis.map((x) => x.id).join(',')
  useEffect(() => {
    const m = map.current
    if (!m) return
    const live = new Set(taxis.map((x) => x.id))
    for (const [id, entry] of markers.current) {
      if (!live.has(id)) {
        entry.marker.remove()
        markers.current.delete(id)
      }
    }
    for (const taxi of taxis) {
      const status: Status = taxi.suspended ? 'suspended' : interested.has(taxi.id) ? 'answered' : 'idle'
      let entry = markers.current.get(taxi.id)
      if (!entry) {
        const parts = markerParts()
        // Viewport-aligned so the number stays upright; the car is turned by hand (heading - bearing).
        const marker = new maplibregl.Marker({ element: parts.root, rotationAlignment: 'viewport', pitchAlignment: 'viewport' }).setLngLat(ll(MAP_CENTER))
        entry = { marker, parts, onMap: false }
        markers.current.set(taxi.id, entry)
      }
      const { marker, parts } = entry
      parts.car.className = `absolute inset-0 grid place-items-center drop-shadow-md will-change-transform ${statusClass[status]}`
      parts.label.className = `absolute -top-4 left-1/2 -translate-x-1/2 rounded-full border px-1.5 text-[11px] leading-4 font-black tabular-nums shadow ${labelClass[status]}`
      parts.label.textContent = taxi.taxiNo
      parts.root.style.zIndex = status === 'answered' ? '2' : '1'
      // Tap a car: show its driver, and (public mode) pick it for hiring.
      parts.root.onclick = (ev) => {
        ev.stopPropagation()
        const tip = document.createElement('span')
        tip.textContent = `${taxi.taxiNo} · ${driverName(taxi.driver)}`
        popup.current?.remove()
        popup.current = new maplibregl.Popup({ closeButton: false, offset: 22 }).setLngLat(marker.getLngLat()).setDOMContent(tip).addTo(m)
        if (!taxi.suspended) pickRef.current?.(taxi.id)
      }
    }
  }, [taxis, interested, driverName])

  // Subscribe to positions and move markers. The car is turned by its heading minus the map's
  // bearing, so it points the right way however the map is rotated.
  useEffect(() => {
    return positionSource(ids.split(',').filter(Boolean), (latest) => {
      positions.current = latest
      const m = map.current
      if (!m) return
      const bearing = m.getBearing()
      for (const [id, entry] of markers.current) {
        const p = latest.get(id)
        if (!p) {
          if (entry.onMap) {
            entry.marker.remove()
            entry.onMap = false
          }
          continue
        }
        entry.marker.setLngLat([p.lng, p.lat])
        entry.parts.car.style.transform = `rotate(${p.heading - bearing}deg)`
        if (!entry.onMap) {
          entry.marker.addTo(m)
          entry.onMap = true
        }
      }
    })
  }, [ids, positionSource])

  // Show the selected place: a pin for a house/landmark, a line along a road.
  useEffect(() => {
    const m = map.current
    pins.current.forEach((x) => x.remove())
    pins.current = []
    if (!m || !ready) return
    const src = m.getSource('highlight') as maplibregl.GeoJSONSource | undefined
    const line: Feature<LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: selected && selected.t === 'r' && selected.p.length > 1 ? selected.p.map(ll) : [] },
    }
    if (src) src.setData(line)
    else {
      m.addSource('highlight', { type: 'geojson', data: line })
      m.addLayer({ id: 'highlight', type: 'line', source: 'highlight', paint: { 'line-color': '#e11d48', 'line-width': 7, 'line-opacity': 0.6 }, layout: { 'line-cap': 'round' } })
    }
    if (!selected) return
    if (selected.t === 'r' && selected.p.length > 1) {
      const b = new maplibregl.LngLatBounds()
      selected.p.forEach((pt) => b.extend(ll(pt)))
      m.fitBounds(b, { padding: 60, maxZoom: 18, duration: 800 })
    } else {
      const el = document.createElement('div')
      el.innerHTML = pinSvg('#e11d48')
      pins.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(ll(selected.p[0]!)).addTo(m))
      m.flyTo({ center: ll(selected.p[0]!), zoom: 18, duration: 800 })
    }
  }, [selected, ready])

  // The call's pickup gets its own pin, and is the nearest-taxi target when nothing is searched.
  useEffect(() => {
    const m = map.current
    pickupPin.current?.remove()
    pickupPin.current = null
    if (!m || !pickupAt || trip) return
    const el = document.createElement('div')
    el.className = 'flex flex-col items-center'
    const tag = document.createElement('span')
    tag.className = 'mb-0.5 rounded bg-emerald-700 px-1.5 text-xs font-bold text-white shadow'
    tag.textContent = t.pickupPin
    const pin = document.createElement('div')
    pin.innerHTML = pinSvg('#059669')
    el.append(tag, pin)
    pickupPin.current = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(ll(pickupAt)).addTo(m)
    m.flyTo({ center: ll(pickupAt), zoom: 18, duration: 800 })
  }, [pickupAt, t.pickupPin, trip])

  // The trip: route along the roads (taxi follows one-way streets; walking doesn't), drawn with a
  // white casing like a ride app, start and end pins, distance and time. If a point is far from
  // any road (another island), a dashed straight line is drawn instead.
  const tripKey = trip ? JSON.stringify(trip) : ''
  const planned = useMemo(() => {
    if (!tripKey) return null
    const { from, to } = JSON.parse(tripKey) as { from: [number, number]; to: [number, number] }
    const near = (p: [number, number]) => ROAD_GRAPH.nodes.some((n) => Math.abs(n[0] - p[0]) < 0.005 && Math.abs(n[1] - p[1]) < 0.005)
    const r = near(from) && near(to) ? findRoute(ROAD_GRAPH, from, to, mode) : null
    const straight = metresBetween(from, to)
    return {
      from,
      to,
      path: r?.path ?? [from, to],
      info: { metres: r?.metres ?? straight, seconds: r?.seconds ?? straight / (mode === 'walk' ? 1.25 : 5.6), onRoad: !!r },
    }
  }, [tripKey, mode])
  const tripInfo = planned?.info ?? null

  useEffect(() => {
    const m = map.current
    tripPins.current.forEach((x) => x.remove())
    tripPins.current = []
    if (!m || !ready) return
    const empty: Feature<LineString> = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
    if (!m.getSource('trip')) {
      m.addSource('trip', { type: 'geojson', data: empty })
      m.addLayer({ id: 'trip-casing', type: 'line', source: 'trip', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 10 } })
      m.addLayer({ id: 'trip-line', type: 'line', source: 'trip', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 6 } })
    }
    const src = m.getSource('trip') as maplibregl.GeoJSONSource
    if (!planned) {
      src.setData(empty)
      return
    }
    const { from, to, path } = planned
    src.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.map(ll) } })
    m.setPaintProperty('trip-line', 'line-dasharray', mode === 'walk' || !planned.info.onRoad ? [0.6, 1.6] : [1, 0])
    m.setPaintProperty('trip-line', 'line-color', mode === 'walk' ? '#0f766e' : '#2563eb')
    for (const [at, colour, label] of [
      [from, '#059669', t.pickupPin],
      [to, '#e11d48', t.destination],
    ] as const) {
      const el = document.createElement('div')
      el.className = 'flex flex-col items-center'
      const tag = document.createElement('span')
      tag.className = 'mb-0.5 rounded px-1.5 text-xs font-bold text-white shadow'
      tag.style.background = colour
      tag.textContent = label
      const pin = document.createElement('div')
      pin.innerHTML = pinSvg(colour)
      el.append(tag, pin)
      tripPins.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(ll(at)).addTo(m))
    }
    const b = new maplibregl.LngLatBounds()
    path.forEach((p) => b.extend(ll(p)))
    m.fitBounds(b, { padding: { top: 90, bottom: 110, left: 50, right: 70 }, maxZoom: 18, duration: 800 })
  }, [planned, mode, ready, t.pickupPin, t.destination])

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
    if (pos) map.current?.flyTo({ center: [pos.lng, pos.lat], zoom: 18, duration: 600 })
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
        <label className="ms-auto flex min-h-8 cursor-pointer items-center gap-1.5 font-medium">
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

        {/* The trip: distance, time and travel mode, floating at the bottom like a ride app. */}
        {tripInfo && (
          <div className="absolute inset-x-2 bottom-8 z-[5] flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:inset-x-auto sm:start-2 sm:w-80">
            <div className="min-w-0 flex-1" dir="ltr">
              <p className="text-lg font-black tabular-nums">
                {Math.max(1, Math.round(tripInfo.seconds / 60))} {t.minutes}
              </p>
              <p className="text-sm text-slate-500 tabular-nums">
                {tripInfo.metres < 1000 ? `${Math.round(tripInfo.metres)} m` : `${(tripInfo.metres / 1000).toFixed(1)} km`}
                {!tripInfo.onRoad && ` · ${t.straightLine}`}
              </p>
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label={t.travelMode}>
              {(['taxi', 'walk'] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => setMode(x)}
                  aria-pressed={mode === x}
                  className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${mode === x ? 'bg-white shadow' : 'text-slate-600'}`}
                >
                  {x === 'taxi' ? <CarTaxiFront className={ic} aria-hidden="true" /> : <Footprints className={ic} aria-hidden="true" />} {x === 'taxi' ? t.modeTaxi : t.modeWalk}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Place search, floating over the map. */}
        <div className="absolute inset-x-2 top-2 z-[5] sm:inset-x-auto sm:start-2 sm:w-80 [@media(max-width:639px)]:end-14">
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
                <X className="size-4" aria-hidden="true" />
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
                      <PlaceTypeIcon type={p.t} />
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
                  <PlaceTypeIcon type={selected.t} className={`${ic} text-slate-500`} /> {placeName(selected)}
                  {selected.pl && selected.t !== 'p' && (
                    <span className="ms-2 text-sm font-medium text-slate-500">
                      {t.plot} {selected.pl}
                    </span>
                  )}
                </p>
              ) : (
                <p className="font-bold text-emerald-700"><MapPin className={ic} aria-hidden="true" /> {t.pickupPin}</p>
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
      {positionSource === subscribePositions && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:text-sm">{t.mapPlaceholder}</p>}
    </section>
  )
}
