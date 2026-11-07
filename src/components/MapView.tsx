import { CarTaxiFront, Footprints, Hand, Info, LocateFixed, MapPin, Radar, X } from 'lucide-react'
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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { loadPlaces, loadPlacesAround, metresBetween, nearestPlace, regionAt, searchPlaces, type Place } from '../places'
import { route as findRoute, type RoadGraph, type TravelMode } from '../core/route'
import { driveTrip, endTrip, MAP_CENTER, ROAD_GRAPH, subscribePositions, TRIP_SPEED, tripProgress, type Positions } from '../positions'
import { graphFromLines } from '../core/osmRoads'
import { getArea, lastSpot, moveToLocation, offerRoads, useArea } from '../roadArea'
import type { Taxi } from '../types'
import type { Person } from '../usePresence'
import type { PublicVehicle, Rider } from '../vehicles'
import { useLiveBuses, type Bus, type BusRoute } from '../buses'
import { MOVING_ICONS, VEHICLE_ICONS } from './iconStyles'
import { bearing, coastGlide, glideAt, glideSpeed, glideState, nextGlide, turnAhead, turnToward, type Glide } from '../core/glide'
import { indicator, leanDegrees } from '../core/drive'
import { inLane, twoWayBetween } from '../core/lanes'
import { alongRoad, roadAhead, snapParked, snapToRoad, type Snapped } from '../core/snap'
import { filterReading, newTracker, shouldReappear, type Tracker } from '../core/gpsFilter'
import { forward, makeLine, nextStop, pointAt, project, stretch, type RouteLine } from '../core/routeLine'
import { createRoot, type Root } from 'react-dom/client'
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
  // Full screen: the map fills its parent and everything else floats over it as layers.
  fullscreen?: boolean
  // A panel floating over the full-screen map (e.g. hiring): a side panel on wide screens, a sheet
  // that pulls up from the bottom on phones.
  panel?: ReactNode
  panelTitle?: string
  panelOpen?: boolean
  onPanelOpenChange?: (open: boolean) => void
  // Close the panel completely (X). Without it the panel can only be folded.
  onPanelClose?: () => void
  // Pin a place on the map (hiring): a pin sits in the middle; the viewer moves the map under it and
  // confirms. The nearest known place gives its name.
  pinMode?: 'pickup' | 'destination' | null
  onPin?: (at: [number, number], name: string) => void
  onPinCancel?: () => void
  // A ride in progress (accepted): that taxi drives to the pickup, then the destination. The viewer
  // can move the map freely; Show my taxi brings it back into view.
  activeTrip?: { taxiId: string; pickup: [number, number]; destination: [number, number] }
  // Hire from where the viewer is (their location, named by the nearest house).
  onHireFrom?: (at: [number, number], name: string) => void
  // People who chose to show themselves on the map (and the viewer's own Show me control).
  people?: Person[]
  // Approved private vehicles whose owner has them available.
  vehicles?: PublicVehicle[]
  // MTCC RTL buses with live GPS (Greater Malé).
  buses?: Bus[]
  onHireVehicle?: (v: PublicVehicle) => void
  // Fly to and follow this vehicle (See it on the map); `n` changes each time it's asked.
  focusVehicle?: { id: string; n: number } | null
  // The viewer, so their own vehicle is ringed and isn't offered for hire to them.
  myUid?: string | null
  // The viewer is driving their own vehicle (Available): they can't hire, and the card says so.
  driving?: boolean
  // A booked private vehicle: shown on its real position, with a ride card and Show my vehicle.
  privateRide?: { vehicleId: string; pickup: [number, number]; destination: [number, number]; status: 'offering' | 'accepted' | 'onboard' }
  shareControl?: ReactNode
}

// A small round-cornered button in the map's tool row (opens one panel).
function ToolButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-bold shadow backdrop-blur-[3px] ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-white/60 bg-white/70 text-slate-800'}`}
    >
      {children}
      <span className="max-w-[9rem] truncate">{label}</span>
    </button>
  )
}
// One short status line over the map.
function Chip({ children }: { children: ReactNode }) {
  return <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/60 bg-white/70 px-3 py-1.5 text-sm shadow backdrop-blur-[3px]">{children}</div>
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

// A rider seen from above, sitting at (8, y): the owner's own choice (off by default). Helmet only;
// a man (broad shoulders); a woman (narrower shoulders, a scarf trailing behind); a young rider
// (smaller). Static markup, no user data.
function riderSvg(rider: Rider, y: number) {
  if (rider === 'man') return `<ellipse cx="8" cy="${y + 2.2}" rx="5.4" ry="2.6" fill="#334155"/><circle cx="8" cy="${y}" r="3.1" fill="#0f172a"/>`
  if (rider === 'woman')
    return `<ellipse cx="8" cy="${y + 2.2}" rx="4.3" ry="2.3" fill="#475569"/><path d="M5.6 ${y + 1} C6 ${y + 7} 7 ${y + 10} 8 ${y + 10.5} C9 ${y + 10} 10 ${y + 7} 10.4 ${y + 1} Z" fill="#be185d" opacity=".92"/><circle cx="8" cy="${y}" r="3" fill="#0f172a"/><path d="M5.2 ${y} A2.9 2.9 0 0 1 10.8 ${y}" fill="none" stroke="#be185d" stroke-width="1.4"/>`
  if (rider === 'young') return `<ellipse cx="8" cy="${y + 1.8}" rx="3.5" ry="1.9" fill="#334155"/><circle cx="8" cy="${y}" r="2.5" fill="#0f172a"/>`
  return `<circle cx="8" cy="${y}" r="3.6" fill="#0f172a" opacity=".85"/>`
}
// Top-down motorbike or e-bike, nose up, body in currentColor, with its rider.
function bikeSvg(type: 'motorbike' | 'ebike', rider: Rider) {
  if (type === 'ebike')
    return `<svg viewBox="0 0 16 32" width="16" height="32" aria-hidden="true">
  <rect x="6.5" y="1" width="3" height="6" rx="1.5" fill="#0f172a"/>
  <rect x="6.5" y="25" width="3" height="6" rx="1.5" fill="#0f172a"/>
  <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="#0f172a" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="5.5" y="7" width="5" height="19" rx="2.5" fill="currentColor" stroke="#0f172a" stroke-width="1.1"/>
  <rect x="6.5" y="19" width="3" height="5" rx=".8" fill="#22c55e"/>
  ${riderSvg(rider, 13.5)}
</svg>`
  return `<svg viewBox="0 0 16 34" width="16" height="34" aria-hidden="true">
  <rect x="6.5" y="1" width="3" height="7" rx="1.5" fill="#0f172a"/>
  <rect x="6.5" y="26" width="3" height="7" rx="1.5" fill="#0f172a"/>
  <line x1="2" y1="9" x2="14" y2="9" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round"/>
  <rect x="5" y="8" width="6" height="19" rx="3" fill="currentColor" stroke="#0f172a" stroke-width="1.2"/>
  ${riderSvg(rider, 15.5)}
  <circle cx="8" cy="2" r="1" fill="#fde68a"/>
</svg>`
}
const vehicleSvg = (type: PublicVehicle['type'], rider: Rider) => (type === 'motorbike' || type === 'ebike' ? bikeSvg(type, rider) : VEHICLE_SVGS[type])

// Top-down private vehicles, nose up so rotate() aims them along the road; body in currentColor.
// Static markup with no user data, so innerHTML is safe here.
const VEHICLE_SVGS: Record<'car' | 'van' | 'pickup' | 'motorbike' | 'ebike', string> = {
  car: CAR_SVG.replace('fill="currentColor"', 'fill="currentColor"').replace('<rect x="3" y="2.5" width="3" height="2" rx="1" fill="#fef9c3"/>', '<rect x="3" y="2.5" width="3" height="2" rx="1" fill="#fde68a"/>'),
  van: `<svg viewBox="0 0 22 40" width="22" height="40" aria-hidden="true">
  <rect x="1.5" y="1.5" width="19" height="37" rx="4" fill="currentColor" stroke="#0f172a" stroke-width="1.5"/>
  <path d="M4.5 8 Q11 5.5 17.5 8 L16.5 12.5 H5.5 Z" fill="#0f172a" opacity=".85"/>
  <rect x="5" y="15" width="12" height="20" rx="1.5" fill="#0f172a" opacity=".18"/>
  <rect x="3.5" y="2.5" width="3" height="2" rx="1" fill="#fde68a"/>
  <rect x="15.5" y="2.5" width="3" height="2" rx="1" fill="#fde68a"/>
</svg>`,
  pickup: `<svg viewBox="0 0 22 40" width="22" height="40" aria-hidden="true">
  <rect x="1.5" y="1.5" width="19" height="37" rx="5" fill="currentColor" stroke="#0f172a" stroke-width="1.5"/>
  <path d="M4.5 8.5 Q11 6 17.5 8.5 L16.5 13 H5.5 Z" fill="#0f172a" opacity=".85"/>
  <rect x="4" y="19" width="14" height="17" rx="1.5" fill="none" stroke="#0f172a" stroke-width="1.5" opacity=".7"/>
  <line x1="4" y1="18" x2="18" y2="18" stroke="#0f172a" stroke-width="1.5"/>
  <rect x="3.5" y="2.5" width="3" height="2" rx="1" fill="#fde68a"/>
  <rect x="15.5" y="2.5" width="3" height="2" rx="1" fill="#fde68a"/>
</svg>`,
  motorbike: bikeSvg('motorbike', 'none'),
  ebike: bikeSvg('ebike', 'none'),
}

// Vehicles at their real length for the zoom, like a game camera; a minimum on-screen size keeps
// them visible when zoomed out, and a maximum keeps them from filling the screen.
type SizedVehicle = 'car' | 'van' | 'pickup' | 'motorbike' | 'ebike' | 'bus'
const REAL_LENGTH_M: Record<SizedVehicle, number> = { car: 4.5, van: 5.2, pickup: 5.3, motorbike: 2.1, ebike: 1.8, bus: 12 }
const DRAWN_PX: Record<SizedVehicle, number> = { car: 36, van: 40, pickup: 40, motorbike: 34, ebike: 32, bus: 56 } // SVG height
const MIN_PX: Record<SizedVehicle, number> = { car: 16, van: 17, pickup: 17, motorbike: 13, ebike: 12, bus: 24 }
function realScale(m: MlMap, type: SizedVehicle) {
  const lat = m.getCenter().lat
  const metresPerPx = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** m.getZoom())
  const px = Math.max(MIN_PX[type] ?? 16, Math.min((REAL_LENGTH_M[type] ?? 4.5) / metresPerPx, 160))
  return px / (DRAWN_PX[type] ?? 36)
}

// Lost signal or a big GPS jump: the vehicle fades out where it was shown, then fades in at its new
// place, standing along the road (plans/vehicle-movement-rules.md §6). It never slides across the map.
const VANISH_MS = 500
function reappear(e: { marker: maplibregl.Marker; glide: Glide | null; roadHeading: number | null; shownHeading: number }, at: [number, number], heading: () => number) {
  const el = e.marker.getElement()
  el.classList.remove('reappear')
  el.classList.add('vanish')
  const stay = e.glide ? glideAt(e.glide, performance.now()) : at
  e.glide = { from: stay, to: stay, path: [stay], cum: [0], start: performance.now(), dur: 0, heading: e.shownHeading }
  setTimeout(() => {
    const h = heading()
    e.glide = { from: at, to: at, path: [at], cum: [0], start: performance.now(), dur: 0, heading: h }
    e.roadHeading = h
    e.shownHeading = h
    el.classList.remove('vanish')
    void el.offsetWidth // restart the animation
    el.classList.add('reappear')
  }, VANISH_MS)
}

// A bus route's own line: its stops in order, joined along the roads (built once per road map).
const routeLines = new WeakMap<RoadGraph, Map<string, RouteLine | null>>()
function routeLineFor(route: BusRoute, g: RoadGraph): RouteLine | null {
  if (!g.nodes.length || route.stops.length < 2) return null
  let cache = routeLines.get(g)
  if (!cache) routeLines.set(g, (cache = new Map()))
  if (cache.has(route.code)) return cache.get(route.code)!
  const pts: [number, number][] = []
  for (let i = 1; i < route.stops.length; i++) {
    const a = route.stops[i - 1]!.at
    const b = route.stops[i]!.at
    const r = findRoute(g, a, b, 'taxi')
    const leg = r && r.metres < metresBetween(a, b) * 3 + 200 ? r.path : [a, b]
    pts.push(...(pts.length ? leg.slice(1) : leg))
  }
  const line = pts.length >= 2 ? makeLine(pts, route.stops.map((x) => x.at)) : null
  cache.set(route.code, line)
  return line
}

// Top-down city bus (about 12 m), nose up, body in the route's colour.
const BUS_SVG = `<svg viewBox="0 0 22 56" width="22" height="56" aria-hidden="true">
  <rect x="1.5" y="1.5" width="19" height="53" rx="3" fill="currentColor" stroke="#0f172a" stroke-width="1.5"/>
  <rect x="4" y="3.5" width="14" height="5" rx="1.2" fill="#0f172a" opacity=".85"/>
  <rect x="5" y="13" width="12" height="36" rx="1.5" fill="#ffffff" opacity=".22"/>
  <rect x="8" y="20" width="6" height="4" rx=".8" fill="#0f172a" opacity=".35"/>
  <rect x="8" y="34" width="6" height="4" rx=".8" fill="#0f172a" opacity=".35"/>
  <rect x="3" y="2.5" width="3" height="1.6" rx=".8" fill="#fde68a"/>
  <rect x="16" y="2.5" width="3" height="1.6" rx=".8" fill="#fde68a"/>
</svg>`

// The vehicle's colour from what the owner typed (English or Dhivehi), else a dark grey.
const COLOURS: [RegExp, string][] = [
  [/red|ރަތް/i, '#dc2626'],
  [/blue|ނޫ/i, '#2563eb'],
  [/green|ފެހި/i, '#16a34a'],
  [/white|ހުދު/i, '#f8fafc'],
  [/black|ކަޅު/i, '#1e293b'],
  [/silver|grey|gray|ރިހި/i, '#94a3b8'],
  [/yellow|ރީނދޫ/i, '#facc15'],
  [/orange|ތެޔޮކުލަ/i, '#f97316'],
  [/brown|ދޮން/i, '#92400e'],
  [/purple|ވައިލެޓް/i, '#7c3aed'],
  [/pink|ފިޔާތޮށި/i, '#ec4899'],
]
const vehicleColour = (c: string) => COLOURS.find(([r]) => r.test(c))?.[1] ?? '#475569'

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
  car.innerHTML = withIndicators(CAR_SVG)
  const label = document.createElement('span')
  label.className = 'absolute -top-4 left-1/2 -translate-x-1/2 rounded-full border px-1.5 text-[11px] leading-4 font-black tabular-nums shadow'
  root.append(car, label)
  return { root, car, label }
}

const ll = (p: [number, number]): [number, number] => [p[1], p[0]] // [lat, lng] -> MapLibre [lng, lat]

// A vehicle drawing with two indicator lights at its front corners (they blink via .sig-left /
// .sig-right on a parent). Static markup only.
const withIndicators = (svg: string) => `<span class="sig-box">${svg}<i class="ind l"></i><i class="ind r"></i><i class="brk l"></i><i class="brk r"></i></span>`
const setSignal = (el: HTMLElement, side: 'left' | 'right' | null | undefined) => {
  el.classList.toggle('sig-left', side === 'left')
  el.classList.toggle('sig-right', side === 'right')
}

// A text label marker that stays upright while the map rotates and tilts.
function labelMarker(text: string, className: string, at: [number, number], m: MlMap): Marker {
  const el = document.createElement('span')
  el.className = className
  el.textContent = text
  return new maplibregl.Marker({ element: el, rotationAlignment: 'viewport', pitchAlignment: 'viewport' }).setLngLat(ll(at)).addTo(m)
}

// OpenFreeMap vector tiles (OpenStreetMap data, OpenMapTiles schema): only their road lines are read,
// for demo taxis away from Kulhudhuffushi. Classes cars use; paths, tracks, rail and ferries are left out.
const ROADS_SOURCE = 'ofm-roads'
const ROADS_LAYER = 'ofm-roads-read'
const DRIVABLE_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'busway']

// The whole Maldives, while the map looks for the viewer the first time.
const MALDIVES: [number, number] = [3.2, 73.22]

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
export default function MapView({ taxis, interested, pickupAt, onPickTaxi, trip, positionSource = subscribePositions, fullscreen = false, panel, panelTitle, panelOpen = true, onPanelOpenChange, onPanelClose, pinMode = null, onPin, onPinCancel, activeTrip, onHireFrom, people = [], vehicles = [], buses: busesProp, onHireVehicle, focusVehicle = null, myUid = null, privateRide, shareControl, driving = false }: Props) {
  const { lang, t, driverName } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const [locationOff, setLocationOff] = useState(false) // the viewer blocked location
  // Headlights from dusk to dawn (18:00–06:00 by the viewer's own clock).
  const [night, setNight] = useState(() => {
    const h = new Date().getHours()
    return h >= 18 || h < 6
  })
  useEffect(() => {
    const timer = setInterval(() => {
      const h = new Date().getHours()
      setNight(h >= 18 || h < 6)
    }, 60_000)
    return () => clearInterval(timer)
  }, [])
  const markers = useRef(new Map<string, { marker: Marker; parts: MarkerParts; onMap: boolean }>())
  const positions = useRef<Positions>(new Map())
  const pins = useRef<Marker[]>([])
  const pickupPin = useRef<Marker | null>(null)
  const popup = useRef<maplibregl.Popup | null>(null)
  const pickRef = useRef(onPickTaxi)
  // The taxi being followed (kept in the middle of the map). The ref is read every frame; the state
  // shows Following ... Stop.
  const following = useRef<string | null>(null)
  const [followId, setFollowId] = useState<string | null>(null)
  const follow = (id: string | null) => {
    following.current = id
    setFollowId(id)
  }
  const followRefFn = useRef(follow)
  useEffect(() => {
    followRefFn.current = follow
  })
  const labels = useRef({ hire: '', follow: '', unfollow: '', suspended: '' })
  useEffect(() => {
    labels.current = { hire: t.menuHire, follow: t.menuFollow, unfollow: t.menuUnfollow, suspended: t.menuSuspended }
  }, [t])
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
  // The real app's map follows the viewer (src/roadArea.ts); the game map stays on its island.
  const followsViewer = positionSource === subscribePositions
  const area = useArea()
  const graph = followsViewer ? area.graph : ROAD_GRAPH
  const followRef = useRef(followsViewer) // fixed for the life of this map
  const graphRef = useRef(graph) // the roads, for keeping vehicles on them (read in the animation loop)
  useEffect(() => {
    graphRef.current = graph
  })
  // Places for search, labels and pin names: the viewer's area (e.g. Malé) on the real app's map;
  // the game map stays on Kulhudhuffushi.
  const placesKey = followsViewer ? (regionAt(area.center)?.id ?? 'home') : 'home'
  // Live RTL buses: only on the real app's map, in the Greater Malé area, while Buses is on.
  const [showBuses, setShowBuses] = useState(true)
  const liveBuses = useLiveBuses(followsViewer && placesKey === 'male' && showBuses)
  const placesHere = () => (followRef.current ? loadPlacesAround(getArea().center) : loadPlaces())

  // Create the map once.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current!,
      style: OSM_STYLE,
      // Real-app map: open where the viewer was last (or the whole Maldives) and look for them at
      // once; never assume Kulhudhuffushi. The game map stays on its island.
      center: ll(followRef.current ? (lastSpot() ?? MALDIVES) : MAP_CENTER),
      zoom: followRef.current ? (lastSpot() ? 15 : 5.5) : 16,
      minZoom: 1,
      maxZoom: 22,
      maxPitch: 60,
      attributionControl: {
        compact: true,
        customAttribution:
          'Place names: <a href="https://kulhudhuffushicity.gov.mv/map">Kulhudhuffushi City Council</a> map, via <a href="https://mapkf.vercel.app">mapkf</a> by emjey; Malé: Malé City Council; Hulhumalé: <a href="https://gis.hdc.mv/">HDC</a>; postcodes: <a href="https://maldivespost.com/post-code">Maldives Post</a>; bus positions: <a href="https://rtl.mv">RTL (MTCC)</a>',
      },
    })
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), 'top-right')
    // The viewer's own location: a blue dot that follows every GPS change (at least every 10 s), and
    // the map follows it until they drag it; the button re-centres and follows again.
    const geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }, trackUserLocation: true })
    m.addControl(geo, 'top-right')
    if (followRef.current) {
      geo.on('geolocate', (e) => {
        setLocationOff(false)
        moveToLocation([e.coords.latitude, e.coords.longitude])
      })
      geo.on('error', (e) => {
        if (e.code !== 1) return // a timeout or no fix: keep looking
        // Location blocked: show Kulhudhuffushi, where the demo data is, and say so.
        setLocationOff(true)
        m.flyTo({ center: ll(MAP_CENTER), zoom: 15 })
      })
    }
    m.on('load', () => {
      setReady(true)
      if (followRef.current) geo.trigger() // look for the viewer straight away
      // Start the credits folded (the i button opens them), so they don't cover the map on a phone.
      box.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    })
    m.on('dragstart', () => followRefFn.current(null))
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
    void placesHere().then((list) => {
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
    // placesHere depends on the area: re-run when it moves.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, placesKey])

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
      // Tap a car: a small menu on the car (it moves with it): the taxi and driver, then Hire this
      // taxi (when hiring is possible) and Follow. Built with DOM text only, never HTML strings.
      parts.root.onclick = (ev) => {
        ev.stopPropagation()
        popup.current?.remove()
        const menu = document.createElement('div')
        menu.className = 'taxi-menu-body'
        const title = document.createElement('p')
        title.className = 'taxi-menu-title'
        title.textContent = `${taxi.taxiNo} · ${driverName(taxi.driver)}`
        menu.append(title)
        const button = (text: string, kind: 'primary' | 'plain', onClick: () => void) => {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = `taxi-menu-button ${kind}`
          b.textContent = text
          b.onclick = (e) => {
            e.stopPropagation()
            onClick()
          }
          menu.append(b)
        }
        if (taxi.suspended) {
          const note = document.createElement('p')
          note.className = 'taxi-menu-note'
          note.textContent = labels.current.suspended
          menu.append(note)
        } else if (pickRef.current) {
          button(labels.current.hire, 'primary', () => {
            popup.current?.remove()
            pickRef.current?.(taxi.id)
          })
        }
        const isFollowed = following.current === taxi.id
        button(isFollowed ? labels.current.unfollow : labels.current.follow, 'plain', () => {
          followRefFn.current(isFollowed ? null : taxi.id)
          popup.current?.remove()
        })
        const p = new maplibregl.Popup({ closeButton: false, offset: 24, className: 'taxi-menu', maxWidth: '16rem' }).setDOMContent(menu)
        marker.setPopup(p)
        p.on('close', () => {
          if (popup.current === p) popup.current = null
        })
        if (!p.isOpen()) marker.togglePopup()
        popup.current = p
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
      // Following a taxi: keep it in the middle until the viewer moves the map.
      const follow = following.current && latest.get(following.current)
      if (follow) m.setCenter([follow.lng, follow.lat])
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
        entry.parts.car.style.transform = `rotate(${p.heading - bearing}deg) scale(${realScale(m, 'car')})`
        setSignal(entry.parts.car, p.signal)
        entry.parts.car.classList.toggle('braking', !!p.braking)
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

  // Roads for the demo taxis away from Kulhudhuffushi: read the road lines (with one-way streets) from
  // OpenFreeMap vector tiles, which MapLibre loads and decodes for an invisible layer. Every time the
  // map settles, the roads in view are offered; the Overpass backup in roadArea may replace them
  // with fuller data.
  const wantRoads = followsViewer && (area.kind === 'loading' || area.kind === 'none' || (area.kind === 'here' && area.source === 'tiles'))
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !wantRoads) return
    if (!m.getSource(ROADS_SOURCE)) {
      m.addSource(ROADS_SOURCE, { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a>' })
      m.addLayer({ id: ROADS_LAYER, type: 'line', source: ROADS_SOURCE, 'source-layer': 'transportation', minzoom: 12, filter: ['in', ['get', 'class'], ['literal', DRIVABLE_CLASSES]], paint: { 'line-opacity': 0 } })
    }
    const read = () => {
      const lines: { coords: number[][]; oneway?: number; kind?: string }[] = []
      for (const f of m.querySourceFeatures(ROADS_SOURCE, { sourceLayer: 'transportation' })) {
        if (!DRIVABLE_CLASSES.includes(String(f.properties?.class))) continue
        const oneway = Number(f.properties?.oneway) || 0
        const g = f.geometry
        const kind = String(f.properties?.class ?? '')
        if (g.type === 'LineString') lines.push({ coords: g.coordinates, oneway, kind })
        else if (g.type === 'MultiLineString') for (const c of g.coordinates) lines.push({ coords: c, oneway, kind })
      }
      const roads = graphFromLines(lines)
      if (roads) offerRoads(roads, 'tiles')
    }
    m.on('idle', read)
    return () => {
      m.off('idle', read)
    }
  }, [ready, wantRoads])

  // Pin mode: follow the middle of the map, and name the nearest known place when it stops moving.
  const [pin, setPin] = useState<{ at: [number, number]; name: string } | null>(null)
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !pinMode) return
    let all: Place[] = []
    const update = () => {
      const c = m.getCenter()
      const at: [number, number] = [c.lat, c.lng]
      const best = nearestPlace(all, at)
      setPin({ at, name: best ? `${lang === 'dv' && best.d ? best.d : best.e}${best.pc ? `, ${best.pc}` : ''}` : '' })
    }
    void placesHere().then((p) => {
      all = p
      update()
    })
    m.on('moveend', update)
    return () => {
      m.off('moveend', update)
    }
  }, [ready, pinMode, lang])

  // The ride in progress: route the taxi from where it is to the pickup, then to the destination,
  // and set it driving. Fit the map to it once; after that the viewer moves the map as they like.
  const activeKey = activeTrip && followsViewer ? JSON.stringify(activeTrip) : ''
  const [ride, setRide] = useState<{ phase: 'coming' | 'riding' | 'arrived'; minutes: number } | null>(null)
  useEffect(() => {
    if (!activeKey || !ready) return
    const { taxiId, pickup, destination } = JSON.parse(activeKey) as NonNullable<Props['activeTrip']>
    let started = false
    const leg = (a: [number, number], b: [number, number]) => findRoute(graph, a, b, 'taxi')?.path ?? [a, b]
    const start = () => {
      const at = positions.current.get(taxiId)
      if (!at || started) return
      started = true
      const toPickup = leg([at.lat, at.lng], pickup)
      const ride = leg(pickup, destination)
      let pickupAt = 0
      for (let i = 1; i < toPickup.length; i++) pickupAt += metresBetween(toPickup[i - 1]!, toPickup[i]!)
      driveTrip(taxiId, [...toPickup, ...ride.slice(1)], pickupAt)
      showTaxi(taxiId)
    }
    const timer = setInterval(() => {
      start()
      const p = tripProgress(taxiId)
      if (!p) return
      const phase = p.done < p.pickupAt ? 'coming' : p.done < p.total ? 'riding' : 'arrived'
      const left = phase === 'coming' ? p.pickupAt - p.done : p.total - p.done
      setRide({ phase, minutes: Math.max(1, Math.ceil(left / TRIP_SPEED / 60)) })
    }, 1000)
    return () => {
      clearInterval(timer)
      endTrip(taxiId)
      setRide(null)
    }
    // graph and showTaxi are read when the ride starts; a new area doesn't restart the ride.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, ready])
  // Show my taxi: fit the taxi and the rest of its trip on screen, and follow it until the map is dragged.
  function showTaxi(taxiId: string) {
    const m = map.current
    const at = positions.current.get(taxiId)
    if (!m || !at) return
    const pts: [number, number][] = [[at.lat, at.lng], ...(tripProgress(taxiId)?.rest ?? [])]
    const lats = pts.map((p) => p[0])
    const lngs = pts.map((p) => p[1])
    m.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 140, bottom: 160, left: 40, right: 60 }, maxZoom: 17, duration: 700 },
    )
    follow(taxiId)
  }

  // Where the viewer is: the nearest house or place to their location (when they shared it).
  const [near, setNear] = useState<{ at: [number, number]; name: string } | null>(null)
  const nearKey = followsViewer && area.located ? area.center.join(',') : ''
  useEffect(() => {
    if (!nearKey) return
    let live = true
    const at = nearKey.split(',').map(Number) as [number, number]
    void loadPlacesAround(at).then((list) => {
      const p = nearestPlace(list, at, 120)
      if (live) setNear({ at, name: p ? (lang === 'dv' && p.d ? p.d : p.e) : '' })
    })
    return () => {
      live = false
    }
  }, [nearKey, lang])

  // People sharing their position: a round icon for how they move; staff also see the name.
  // Built with DOM text; the icon is rendered by React into the marker.
  const peopleMarkers = useRef(new Map<string, { marker: Marker; root: Root; label: HTMLSpanElement; mode: string; glide: Glide | null; lastReport: number | null; atKey: string }>())
  const peopleKey = JSON.stringify(people)
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const list = JSON.parse(peopleKey) as Person[]
    const seen = new Set<string>()
    for (const p of list) {
      seen.add(p.id)
      let entry = peopleMarkers.current.get(p.id)
      if (!entry) {
        const el = document.createElement('div')
        el.className = 'person-marker'
        const icon = document.createElement('span')
        icon.className = 'person-marker-icon'
        const label = document.createElement('span')
        label.className = 'person-marker-label'
        el.append(icon, label)
        const root = createRoot(icon)
        entry = { marker: new maplibregl.Marker({ element: el }).setLngLat(ll(p.at)).addTo(m), root, label, mode: '', glide: null, lastReport: null, atKey: '' }
        peopleMarkers.current.set(p.id, entry)
      }
      const pKey = p.at.join(',')
      if (pKey !== entry.atKey) {
        const now = performance.now()
        entry.glide = nextGlide(entry.glide, p.at, now, entry.lastReport)
        entry.lastReport = now
        entry.atKey = pKey
      }
      entry.label.textContent = p.name ?? ''
      const pel = entry.marker.getElement()
      pel.style.opacity = p.level && p.level !== 'active' ? '0.6' : '1'
      pel.title = p.level && p.level !== 'active' ? vLabels.current.level(p.level) : ''
      entry.label.style.display = p.name ? '' : 'none'
      if (entry.mode !== p.mode) {
        entry.mode = p.mode
        const Icon = MOVING_ICONS[p.mode]
        entry.root.render(<Icon className="size-4" aria-hidden="true" />)
      }
    }
    for (const [id, entry] of peopleMarkers.current) {
      if (seen.has(id)) continue
      entry.marker.remove()
      const root = entry.root
      setTimeout(() => root.unmount())
      peopleMarkers.current.delete(id)
    }
  }, [peopleKey, ready])

  // Private vehicles for hire: a top-down vehicle (car, van, pickup, motorbike, e-bike) in its own
  // colour, with an upright price label. Between the owner's reports it glides at a steady speed and
  // turns to face its way (src/core/glide.ts), so it drives rather than jumps. Tap for its type,
  // owner's first name and price. Text goes in with textContent only.
  const vehicleMarkers = useRef(
    new Map<string, { marker: Marker; shape: HTMLDivElement; price: HTMLSpanElement; type: string; glide: Glide | null; lastReport: number | null; atKey: string; shownHeading: number; onRoad: boolean; roadHeading: number | null; lean: number; tracker: Tracker; s: number | null; speed: number; coasted: number; snap: Snapped | null }>(),
  )
  const vehiclesKey = JSON.stringify(vehicles)
  const vLabels = useRef({ type: (x: string) => x, price: (b: number, k: number) => `${b} ${k}`, hire: '', follow: '', unfollow: '', level: (l: string) => l })
  const hireVehicleRef = useRef(onHireVehicle)
  const myUidRef = useRef(myUid)
  useEffect(() => {
    vLabels.current = { type: (x) => t.vehTypes[x as keyof typeof t.vehTypes] ?? x, price: t.vehPrice, hire: t.privHire, follow: t.menuFollow, unfollow: t.menuUnfollow, level: (l) => t.beatLevels[l as keyof typeof t.beatLevels] ?? l }
    hireVehicleRef.current = onHireVehicle
    myUidRef.current = myUid
  })
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const list = JSON.parse(vehiclesKey) as PublicVehicle[]
    const seen = new Set<string>()
    for (const v of list) {
      seen.add(v.id)
      let entry = vehicleMarkers.current.get(v.id)
      if (!entry) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'vehicle-marker'
        const shape = document.createElement('div')
        shape.className = 'vehicle-shape'
        const price = document.createElement('span')
        price.className = 'vehicle-marker-price'
        el.append(shape, price)
        const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'viewport', pitchAlignment: 'viewport' }).setLngLat(ll(v.at)).addTo(m)
        entry = { marker, shape, price, type: '', glide: null, lastReport: null, atKey: '', shownHeading: v.heading || 0, onRoad: false, roadHeading: null, lean: 0, tracker: newTracker(), s: null, speed: 0, coasted: 0, snap: null }
        vehicleMarkers.current.set(v.id, entry)
      }
      const e = entry
      // A new report: glide on to it from where it is shown now.
      const atKey = v.at.join(',')
      const verdict = atKey !== e.atKey ? filterReading(e.tracker, { at: v.at, t: performance.now() }, 60 / 3.6) : 'still'
      if (atKey !== e.atKey) e.atKey = atKey
      // Odd readings are held until confirmed, parked wobbles ignored (§6); never a step back.
      const g0 = graphRef.current
      // Parked (it has stopped moving): prefer a parking aisle nearby.
      const snap0 = verdict === 'move' ? (v.level !== 'active' ? snapParked(g0, v.at) : snapToRoad(g0, v.at)) : null
      const behind =
        verdict === 'move' && e.glide && snap0
          ? Math.abs(((bearing(glideAt(e.glide, performance.now()), snap0.at) - e.shownHeading + 540) % 360) - 180) > 120 &&
            metresBetween(glideAt(e.glide, performance.now()), snap0.at) < 40
          : false
      if (verdict === 'move' && !behind) {
        const now = performance.now()
        // Keep it on the road: snap the fix to the nearest road (or parking aisle), and drive there
        // along the roads, unless that is far longer than a straight hop (a GPS jump).
        const g = g0
        const snapped = snap0
        const target = snapped ? snapped.at : v.at
        const dt = e.lastReport === null ? 0 : (now - e.lastReport) / 1000
        if (dt > 0 && e.glide) e.speed = Math.min(60 / 3.6, metresBetween(glideAt(e.glide, now), target) / dt)
        e.snap = snapped
        let roadPath: [number, number][] | undefined
        let roadM: number | null = null
        if (e.glide && snapped) {
          const from = glideAt(e.glide, now)
          const r = findRoute(g, from, target, 'taxi')
          roadM = r ? r.metres : Infinity
          if (r && r.metres <= metresBetween(from, target) * 2.5 + 60) roadPath = r.path
        }
        const hop = e.glide ? metresBetween(glideAt(e.glide, now), target) : 0
        if (e.glide && shouldReappear(hop, dt, roadM)) {
          // Lost signal or a big jump: fade out here, fade in there (never slide across the map).
          reappear(e, target, () => (snapped ? alongRoad(g, snapped, e.shownHeading) : v.heading || e.shownHeading))
          e.speed = 0
        } else {
          e.glide = nextGlide(e.glide, target, now, e.lastReport, snapped ? null : v.heading, roadPath)
          e.roadHeading = snapped ? alongRoad(g, snapped, e.glide.path.length >= 2 ? e.glide.heading : e.shownHeading) : null
        }
        e.onRoad = !!snapped
        e.lastReport = now
      }
      e.shape.style.color = vehicleColour(v.colour)
      e.price.textContent = vLabels.current.price(v.priceBase, v.pricePerKm)
      const vel = e.marker.getElement()
      vel.classList.toggle('mine', !!myUidRef.current && v.ownerUid === myUidRef.current)
      vel.style.opacity = v.level !== 'active' ? '0.7' : '1'
      vel.title = v.level !== 'active' ? vLabels.current.level(v.level) : ''
      const look = `${v.type}:${v.rider}`
      if (e.type !== look) {
        e.type = look
        e.shape.innerHTML = withIndicators(vehicleSvg(v.type, v.rider)) // static markup, no user data
        e.shape.dataset.type = v.type
      }
      e.marker.getElement().onclick = (ev) => {
        ev.stopPropagation()
        popup.current?.remove()
        const box = document.createElement('div')
        box.className = 'taxi-menu-body'
        const title = document.createElement('p')
        title.className = 'taxi-menu-title'
        title.textContent = `${vLabels.current.type(v.type)}${v.firstName ? ` · ${v.firstName}` : ''}`
        const price = document.createElement('p')
        price.className = 'taxi-menu-note'
        price.style.color = '#065f46'
        price.textContent = `${v.colour ? `${v.colour} · ` : ''}${vLabels.current.price(v.priceBase, v.pricePerKm)}`
        box.append(title, price)
        const button = (text: string, kind: 'primary' | 'plain', onClick: () => void) => {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = `taxi-menu-button ${kind}`
          b.textContent = text
          b.onclick = (x) => {
            x.stopPropagation()
            popup.current?.remove()
            onClick()
          }
          box.append(b)
        }
        if (hireVehicleRef.current && v.ownerUid !== myUidRef.current) button(vLabels.current.hire, 'primary', () => hireVehicleRef.current?.(v))
        const fid = `v:${v.id}`
        const isFollowed = following.current === fid
        button(isFollowed ? vLabels.current.unfollow : vLabels.current.follow, 'plain', () => followRefFn.current(isFollowed ? null : fid))
        const p = new maplibregl.Popup({ closeButton: false, offset: 20, className: 'taxi-menu', maxWidth: '16rem' }).setDOMContent(box)
        e.marker.setPopup(p)
        if (!p.isOpen()) e.marker.togglePopup()
        popup.current = p
      }
    }
    for (const [id, entry] of vehicleMarkers.current) {
      if (seen.has(id) || id.startsWith('b:')) continue
      entry.marker.remove()
      vehicleMarkers.current.delete(id)
    }
  }, [vehiclesKey, ready])

  // MTCC RTL buses (live GPS, src/buses.ts): a top-down bus in its route's colour with the route
  // number, gliding and kept on the road like private vehicles. Tap for the route and plate.
  const buses = busesProp ?? liveBuses
  const busesKey = JSON.stringify(buses)
  const bussesRef = useRef(new Map<string, BusRoute>())
  useEffect(() => {
    bussesRef.current = new Map(buses.map((b) => [b.id, b.route]))
  })
  const bLabels = useRef({ follow: '', unfollow: '', lang: 'en' as string })
  useEffect(() => {
    bLabels.current = { follow: t.menuFollow, unfollow: t.menuUnfollow, lang }
  })
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const list = JSON.parse(busesKey) as Bus[]
    const seen = new Set<string>()
    for (const b of list) {
      const key = `b:${b.id}`
      seen.add(key)
      let e = vehicleMarkers.current.get(key)
      if (!e) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'vehicle-marker bus-marker'
        const shape = document.createElement('div')
        shape.className = 'vehicle-shape'
        shape.innerHTML = withIndicators(BUS_SVG) // static markup, no user data
        const price = document.createElement('span')
        price.className = 'vehicle-marker-price bus-route'
        el.append(shape, price)
        const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'viewport', pitchAlignment: 'viewport' }).setLngLat(ll(b.at)).addTo(m)
        e = { marker, shape, price, type: 'bus', glide: null, lastReport: null, atKey: '', shownHeading: 0, onRoad: false, roadHeading: null, lean: 0, tracker: newTracker(), s: null, speed: 0, coasted: 0, snap: null }
        vehicleMarkers.current.set(key, e)
      }
      const entry = e
      const atKey = b.at.join(',')
      if (atKey !== entry.atKey) {
        entry.atKey = atKey
        const now = performance.now()
        const g = graphRef.current
        // Odd readings are held until confirmed; parked wobbles are ignored (§6).
        const verdict = filterReading(entry.tracker, { at: b.at, t: now }, 35 / 3.6)
        const line = routeLineFor(b.route, g)
        const proj = line && verdict === 'move' ? project(line, b.at) : null
        if (verdict === 'move' && line && proj && proj.dist < 60) {
          // On its own route: only forward along it (§6), the stretch between as the path.
          const shownS = entry.glide ? project(line, glideAt(entry.glide, now)).s : proj.s
          const ahead = forward(line, shownS, proj.s)
          const gap = entry.lastReport === null ? 0 : (now - entry.lastReport) / 1000
          if (entry.glide && (ahead < -60 || shouldReappear(Math.abs(ahead), gap))) {
            // Lost signal or a big jump: fade out and reappear at its new place on the route.
            const at = pointAt(line, proj.s)
            entry.s = proj.s
            entry.speed = 0
            entry.onRoad = true
            reappear(entry, at, () => {
              const sn = snapToRoad(g, at)
              return sn ? alongRoad(g, sn, bearing(at, pointAt(line, Math.min(line.length, proj.s + 10)))) : entry.shownHeading
            })
            entry.lastReport = now
          } else if (entry.glide && ahead < 0 && ahead > -60) {
            // Behind where it's shown (a slow bus after a little prediction): wait, never go back.
          } else {
            const dt = entry.lastReport === null ? 0 : (now - entry.lastReport) / 1000
            if (dt > 0) entry.speed = Math.max(0, Math.min(35 / 3.6, ahead / dt))
            const path = entry.glide ? stretch(line, shownS, proj.s) : undefined
            entry.glide = nextGlide(entry.glide, pointAt(line, proj.s), now, entry.lastReport, null, path)
            entry.s = proj.s
            entry.onRoad = true
            const sn = snapToRoad(g, pointAt(line, proj.s))
            entry.roadHeading = sn ? alongRoad(g, sn, entry.glide.heading) : entry.glide.heading
            entry.lastReport = now
          }
        } else if (verdict === 'move') {
          // Off its route line (a diversion, or no line yet): keep it on the nearest road.
          const snapped = snapToRoad(g, b.at)
          const target = snapped ? snapped.at : b.at
          let roadPath: [number, number][] | undefined
          let roadM: number | null = null
          if (entry.glide && snapped) {
            const from = glideAt(entry.glide, now)
            const r = findRoute(g, from, target, 'taxi')
            roadM = r ? r.metres : Infinity
            if (r && r.metres <= metresBetween(from, target) * 2.5 + 60) roadPath = r.path
          }
          const gap = entry.lastReport === null ? 0 : (now - entry.lastReport) / 1000
          if (entry.glide && shouldReappear(metresBetween(glideAt(entry.glide, now), target), gap, roadM)) {
            reappear(entry, target, () => (snapped ? alongRoad(g, snapped, entry.shownHeading) : entry.shownHeading))
          } else {
            entry.glide = nextGlide(entry.glide, target, now, entry.lastReport, null, roadPath)
            entry.roadHeading = snapped ? alongRoad(g, snapped, entry.glide.path.length >= 2 ? entry.glide.heading : entry.shownHeading) : null
          }
          entry.onRoad = !!snapped
          entry.s = null
          entry.lastReport = now
        }
      }
      entry.shape.style.color = b.route.colour
      entry.price.textContent = b.route.number || 'Bus'
      entry.price.style.background = b.route.colour
      entry.marker.getElement().onclick = (ev) => {
        ev.stopPropagation()
        popup.current?.remove()
        const box = document.createElement('div')
        box.className = 'taxi-menu-body'
        const title = document.createElement('p')
        title.className = 'taxi-menu-title'
        title.textContent = `${b.route.number} · ${bLabels.current.lang === 'dv' && b.route.nameDv ? b.route.nameDv : b.route.name}`
        const plate = document.createElement('p')
        plate.className = 'taxi-menu-note'
        plate.style.color = '#475569'
        plate.textContent = `RTL · ${b.plate}`
        box.append(title, plate)
        const isFollowed = following.current === key
        const f = document.createElement('button')
        f.type = 'button'
        f.className = 'taxi-menu-button plain'
        f.textContent = isFollowed ? bLabels.current.unfollow : bLabels.current.follow
        f.onclick = (x) => {
          x.stopPropagation()
          popup.current?.remove()
          followRefFn.current(isFollowed ? null : key)
        }
        box.append(f)
        const p = new maplibregl.Popup({ closeButton: false, offset: 24, className: 'taxi-menu', maxWidth: '16rem' }).setDOMContent(box)
        entry.marker.setPopup(p)
        if (!p.isOpen()) entry.marker.togglePopup()
        popup.current = p
      }
    }
    for (const [id, entry] of vehicleMarkers.current) {
      if (!id.startsWith('b:') || seen.has(id)) continue
      entry.marker.remove()
      vehicleMarkers.current.delete(id)
    }
  }, [busesKey, ready])

  // Every frame: move each private vehicle (and each person sharing) along its glide, turn it toward
  // its heading (relative to the map's rotation), and keep a followed vehicle in the middle.
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(100, now - last)
      last = now
      const bearingNow = m.getBearing()
      for (const [id, e] of vehicleMarkers.current) {
        if (!e.glide) continue
        // Between readings (§7): when its glide is done and no new reading has come, keep going at
        // about 80% of its recent speed for up to 12 s, easing to a stop. A bus follows its own route
        // toward the next stop; a private vehicle the road it's on.
        if (now >= e.glide.start + e.glide.dur && e.lastReport !== null && e.coasted !== e.lastReport && now - e.lastReport < 15_000 && e.speed > 1.5) {
          e.coasted = e.lastReport
          const v = e.speed * 0.8
          const g = graphRef.current
          if (id.startsWith('b:') && e.s !== null) {
            const route = bussesRef.current.get(id.slice(2))
            const line = route ? routeLineFor(route, g) : null
            if (line) {
              const stop = nextStop(line, e.s)
              let reach = v * 12
              if (stop !== null) reach = Math.min(reach, Math.max(0, forward(line, e.s, stop)))
              const end = line.loop ? (e.s + reach) % line.length : Math.min(line.length, e.s + reach)
              if (reach > 3) {
                e.glide = coastGlide(e.glide, stretch(line, e.s, end), v, now)
                e.s = end
              }
            }
          } else if (e.snap) {
            const ahead = roadAhead(g, snapToRoad(g, glideAt(e.glide, now)) ?? e.snap, e.glide.heading, v * 12)
            if (ahead.length >= 2) e.glide = coastGlide(e.glide, ahead, v, now)
          }
        }
        // Along its glide, facing the stretch it's on, and in the left lane of two-way roads.
        const st = glideState(e.glide, now)
        // Moving: face along the stretch it's driving. Stopped: line up with its road (never across it).
        const moving = e.glide.path.length >= 2 && now < e.glide.start + e.glide.dur
        const heading = moving || e.roadHeading === null ? st.heading : e.roadHeading
        const at = e.onRoad ? inLane(st.at[0], st.at[1], heading, moving ? twoWayBetween(graphRef.current, st.a, st.b) : true) : st.at
        e.marker.setLngLat(ll(at))
        const before = e.shownHeading
        e.shownHeading = turnToward(e.shownHeading, heading, dt)
        const kind = e.type.split(':')[0] as SizedVehicle
        const speed = moving ? glideSpeed(e.glide) : 0
        // Indicators a moment before a turn; bikes lean into it (a slight sideways squeeze).
        const ahead = moving ? turnAhead(e.glide, now) : { angle: 0, dist: Infinity }
        setSignal(e.shape, indicator(ahead.angle, ahead.dist, speed))
        // Brake lights while easing to a stop or standing still.
        e.shape.classList.toggle('braking', !moving || (now - e.glide.start) / e.glide.dur > 0.85)
        let squeeze = ''
        if (kind === 'motorbike' || kind === 'ebike') {
          const rate = dt > 0 ? (((e.shownHeading - before + 540) % 360) - 180) / (dt / 1000) : 0
          e.lean += (leanDegrees(rate, speed) - e.lean) * Math.min(1, dt / 200)
          squeeze = ` scaleX(${(1 - Math.abs(e.lean) / 90).toFixed(3)})`
        }
        e.shape.style.transform = `rotate(${e.shownHeading - bearingNow}deg) scale(${realScale(m, kind)})${squeeze}`
        if (following.current === (id.startsWith('b:') ? id : `v:${id}`)) m.setCenter(ll(at))
      }
      for (const e of peopleMarkers.current.values()) {
        if (e.glide) e.marker.setLngLat(ll(glideAt(e.glide, now)))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [ready])

  // The booked private vehicle's card: minutes to the pickup (or to the destination once on board)
  // at town speed, from its live position.
  const bookedVehicle = privateRide && privateRide.status !== 'offering' ? vehicles.find((v) => v.id === privateRide.vehicleId) : undefined
  const privateCard = (() => {
    if (!privateRide || !bookedVehicle) return null
    const target = privateRide.status === 'onboard' ? privateRide.destination : privateRide.pickup
    const minutes = Math.max(1, Math.ceil(metresBetween(bookedVehicle.at, target) / (20 / 3.6) / 60))
    const show = () => {
      const m = map.current
      if (!m) return
      const pts = [bookedVehicle.at, target]
      m.fitBounds(
        [
          [Math.min(pts[0]![1], pts[1]![1]), Math.min(pts[0]![0], pts[1]![0])],
          [Math.max(pts[0]![1], pts[1]![1]), Math.max(pts[0]![0], pts[1]![0])],
        ],
        { padding: { top: 140, bottom: 160, left: 40, right: 60 }, maxZoom: 17, duration: 700 },
      )
      follow(`v:${bookedVehicle.id}`)
    }
    return { text: privateRide.status === 'onboard' ? t.privRiding(minutes) : t.privComing(minutes), Icon: VEHICLE_ICONS[bookedVehicle.type], show }
  })()

  // See it on the map: once that vehicle is in the list, fly to it and follow it.
  const focusKey = focusVehicle ? `${focusVehicle.id}:${focusVehicle.n}` : ''
  const focusDone = useRef('')
  useEffect(() => {
    const m = map.current
    if (!m || !ready || !focusKey || focusDone.current === focusKey) return
    const id = focusKey.split(':')[0]!
    const v = (JSON.parse(vehiclesKey) as PublicVehicle[]).find((x) => x.id === id)
    if (!v) return // not on the map yet: try again when the list updates
    focusDone.current = focusKey
    m.flyTo({ center: ll(v.at), zoom: 17, duration: 800 })
    follow(`v:${id}`)
    // follow is stable for this map.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, vehiclesKey, ready])


  // The trip: route along the roads (taxi follows one-way streets; walking doesn't), drawn with a
  // white casing like a ride app, start and end pins, distance and time. If a point is far from
  // any road (another island), a dashed straight line is drawn instead.
  const tripKey = trip ? JSON.stringify(trip) : ''
  const planned = useMemo(() => {
    if (!tripKey) return null
    const { from, to } = JSON.parse(tripKey) as { from: [number, number]; to: [number, number] }
    const near = (p: [number, number]) => graph.nodes.some((n) => Math.abs(n[0] - p[0]) < 0.005 && Math.abs(n[1] - p[1]) < 0.005)
    const r = near(from) && near(to) ? findRoute(graph, from, to, mode) : null
    const straight = metresBetween(from, to)
    return {
      from,
      to,
      path: r?.path ?? [from, to],
      info: { metres: r?.metres ?? straight, seconds: r?.seconds ?? straight / (mode === 'walk' ? 1.25 : 5.6), onRoad: !!r },
    }
  }, [tripKey, mode, graph])
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

  const note = followsViewer ? (area.kind === 'here' ? t.mapDemoHere : area.kind === 'loading' ? t.mapDemoLoading : area.kind === 'none' ? t.mapDemoNone : t.mapPlaceholder) : null
  // At most one panel open at a time: the map key, Show me, or the hire form (App controls that one).
  const [openPanel, setOpenPanel] = useState<'key' | 'share' | null>(null)
  const active: 'key' | 'share' | 'hire' | null = pinMode ? null : panel && panelOpen ? 'hire' : openPanel
  const toggle = (which: 'key' | 'share' | 'hire') => {
    if (active === which) return closeActive()
    if (which === 'hire') {
      setOpenPanel(null)
      onPanelOpenChange?.(true)
    } else {
      setOpenPanel(which)
      if (panelOpen) onPanelOpenChange?.(false)
    }
  }
  const closeActive = () => {
    // Closing folds the hire form away (its details are kept); the Hire button opens it again.
    if (active === 'hire') onPanelOpenChange?.(false)
    else setOpenPanel(null)
  }
  const legend = (
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${fullscreen ? '' : 'px-1 sm:text-sm'}`}>
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
        {followsViewer && placesKey === 'male' && (
          <label className="flex min-h-8 cursor-pointer items-center gap-1.5 font-medium">
            <input type="checkbox" checked={showBuses} onChange={(e) => setShowBuses(e.target.checked)} className="size-4 accent-emerald-600" />
            {t.busesToggle}
          </label>
        )}
      </div>
  )

  return (
    <section className={`${fullscreen ? 'relative h-full w-full' : 'space-y-2 sm:space-y-3'} ${night ? 'map-night' : ''}`}>
      {!fullscreen && legend}
      <div className={fullscreen ? 'absolute inset-0' : 'relative'}>
        <div
          ref={box}
          dir="ltr"
          // MapLibre's own CSS makes this element position: relative (unlayered CSS beats Tailwind's
          // utilities), so size it with h-full/w-full, never absolute + inset.
          className={fullscreen ? 'h-full w-full bg-slate-200' : 'h-[calc(100dvh-11rem)] min-h-80 overflow-hidden rounded-xl border border-slate-200 bg-slate-200'}
          role="region"
          aria-label={t.map}
        />

        {/* Full screen: one column at the top-left, under the search: a row of small buttons (Map key,
            Show me, Hire) and status chips, then at most ONE open panel, each with its own close.
            It never covers the map controls on the right or the status card at the bottom. */}
        {fullscreen && !pinMode && (
          <div className="pointer-events-none absolute inset-x-2 top-16 bottom-28 z-[6] flex flex-col gap-2 sm:inset-x-auto sm:start-2 sm:w-96 [@media(max-width:639px)]:end-14">
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
              <ToolButton active={active === 'key'} onClick={() => toggle('key')} label={t.mapKey}>
                <Info className="size-4" aria-hidden="true" />
              </ToolButton>
              {shareControl && (
                <ToolButton active={active === 'share'} onClick={() => toggle('share')} label={t.shareMe}>
                  <Radar className="size-4 text-sky-600" aria-hidden="true" />
                </ToolButton>
              )}
              {panel && (
                <ToolButton active={active === 'hire'} onClick={() => toggle('hire')} label={panelTitle ?? ''}>
                  <Hand className="size-4 text-emerald-700" aria-hidden="true" />
                </ToolButton>
              )}
            </div>
            {/* Status chips: one short line each. */}
            {followId && (
              <Chip>
                <LocateFixed className="size-4 shrink-0 text-sky-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {followId.startsWith('v:') ? t.followingVehicle(t.vehTypes[vehicles.find((x) => `v:${x.id}` === followId)?.type ?? 'car']) : followId.startsWith('b:') ? t.followingVehicle('bus') : t.followingTaxi(taxis.find((x) => x.id === followId)?.taxiNo ?? '')}
                </span>
                <button type="button" onClick={() => follow(null)} className="shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white">
                  {t.stopFollowing}
                </button>
              </Chip>
            )}
            {near && !driving && (
              <Chip>
                <MapPin className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{near.name ? t.youAreNear(near.name) : t.youAreHere}</span>
                {onHireFrom && !activeTrip && (
                  <button type="button" onClick={() => onHireFrom(near.at, near.name)} className="shrink-0 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white">
                    {t.hireFromHere}
                  </button>
                )}
              </Chip>
            )}
            {driving && (
              <Chip>
                <CarTaxiFront className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-semibold text-emerald-800" title={t.drivingNote}>
                  {t.drivingShort}
                </span>
              </Chip>
            )}
            {locationOff && (
              <Chip>
                <span className="min-w-0 flex-1 text-xs font-semibold text-amber-800">{t.locationOff}</span>
              </Chip>
            )}
            {/* The one open panel. */}
            {active && (
              <div className="map-glass pointer-events-auto flex min-h-0 flex-col rounded-2xl border border-white/60 bg-white/70 shadow-xl backdrop-blur-[3px] backdrop-saturate-150">
                <div className="flex shrink-0 items-center gap-2 ps-4">
                  <p className="min-w-0 flex-1 truncate py-2.5 font-bold">{active === 'key' ? t.mapKey : active === 'share' ? t.shareMe : panelTitle}</p>
                  {active === 'hire' && onPanelClose && (
                    <button type="button" onClick={onPanelClose} className="min-h-9 rounded-lg px-2 text-xs font-bold text-red-700 hover:bg-red-50">
                      {t.cancel}
                    </button>
                  )}
                  <button type="button" onClick={closeActive} aria-label={t.close} title={t.close} className="grid min-h-11 min-w-11 place-items-center text-slate-500 hover:text-slate-900">
                    <X className="size-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                  {active === 'key' && (
                    <div className="space-y-2">
                      {legend}
                      {note && <p className="text-xs leading-snug text-amber-800">{note}</p>}
                    </div>
                  )}
                  {active === 'share' && shareControl}
                  {active === 'hire' && panel}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pin mode: a pin in the middle of the map, and a bar to confirm the place. */}
        {pinMode && (
          <>
            <div className="pointer-events-none absolute start-1/2 top-1/2 z-[8] -translate-x-1/2 -translate-y-full rtl:translate-x-1/2" aria-hidden="true">
              <MapPin className={`size-10 drop-shadow-lg ${pinMode === 'pickup' ? 'fill-emerald-500 text-emerald-900' : 'fill-rose-500 text-rose-900'}`} strokeWidth={1.5} />
            </div>
            <div className="absolute inset-x-2 bottom-4 z-[8] space-y-2 rounded-2xl border border-white/60 bg-white/80 p-3 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:start-1/2 sm:w-96 sm:-translate-x-1/2 sm:rtl:translate-x-1/2" role="dialog" aria-label={pinMode === 'pickup' ? t.pinSetPickup : t.pinSetDestination}>
              <p className="text-xs text-slate-600">{t.pinHint}</p>
              <p className="truncate font-bold">{pin ? pin.name || t.pinnedPlace : '…'}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!pin}
                  onClick={() => pin && onPin?.(pin.at, pin.name)}
                  className={`min-h-11 flex-1 rounded-xl font-bold text-white disabled:opacity-40 ${pinMode === 'pickup' ? 'bg-emerald-600' : 'bg-rose-600'}`}
                >
                  {pinMode === 'pickup' ? t.pinSetPickup : t.pinSetDestination}
                </button>
                <button type="button" onClick={onPinCancel} className="min-h-11 rounded-xl border border-slate-300 bg-white/70 px-4 font-semibold">
                  {t.cancel}
                </button>
              </div>
            </div>
          </>
        )}

        {/* A booked private vehicle: where it is, on its real position, and Show my vehicle. */}
        {privateCard && (
          <div
            className={`absolute z-[5] flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-xl backdrop-blur-[3px] inset-x-2 bottom-8 sm:inset-x-auto sm:start-2 sm:w-96 [@media(max-width:639px)]:end-12`}
            role="status"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-yellow-300">
              <privateCard.Icon className="size-4" aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 font-black">{privateCard.text}</p>
            <button type="button" onClick={privateCard.show} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white">
              <LocateFixed className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">{t.showMyVehicle}</span>
            </button>
          </div>
        )}

        {/* The ride in progress: where the taxi is in the trip, and Show my taxi. */}
        {ride && activeTrip && (
          <div
            className={`absolute z-[5] flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-xl backdrop-blur-[3px] inset-x-2 bottom-8 sm:inset-x-auto sm:start-2 sm:w-96 [@media(max-width:639px)]:end-12`}
            role="status"
          >
            <CarTaxiFront className="size-6 shrink-0 text-emerald-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-black">{ride.phase === 'coming' ? t.rideComing : ride.phase === 'riding' ? t.rideRiding : t.rideArrived}</p>
              {ride.phase !== 'arrived' && <p className="text-sm text-slate-600 tabular-nums">{ride.minutes} {t.minutes}</p>}
            </div>
            <button type="button" onClick={() => showTaxi(activeTrip.taxiId)} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white">
              <LocateFixed className="size-4" aria-hidden="true" /> {t.showMyTaxi}
            </button>
          </div>
        )}

        {/* The trip: distance, time and travel mode, floating at the bottom like a ride app. */}
        {tripInfo && !ride && (
          <div
            className={`absolute z-[5] flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-xl backdrop-blur-[3px] inset-x-2 bottom-8 sm:inset-x-auto sm:start-2 sm:w-96 [@media(max-width:639px)]:end-12`}
          >
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
        <div className={`absolute inset-x-2 top-2 z-[7] sm:inset-x-auto sm:start-2 ${fullscreen ? 'sm:w-96' : 'sm:w-80'} [@media(max-width:639px)]:end-14`}>
          <div className="flex items-center rounded-xl border border-slate-300 bg-white shadow-lg">
            <input
              type="search"
              value={query}
              onFocus={() => void placesHere().then(setPlaces)}
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
                          {p.pc ? ` · ${t.postcode} ${p.pc}` : ''}
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
                  {selected.pc && (
                    <span className="ms-2 text-sm font-medium text-slate-500" dir="ltr">
                      {t.postcode} {selected.pc}
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
      {!fullscreen && note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:text-sm">{note}</p>}
    </section>
  )
}
