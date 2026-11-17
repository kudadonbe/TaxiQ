import { Box as BoxIcon, Bus as BusIcon, CarTaxiFront, Footprints, Hand, Info, LifeBuoy, LocateFixed, MapPin, Maximize2, Menu, Phone, Radar, Route as RouteIcon, Square, X, type LucideIcon } from 'lucide-react'
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
import { loadPlaces, loadPlacesAround, loadPlacesForSearch, metresBetween, nearestPlace, nearestRoad, regionAt, searchPlaces, type Place } from '../places'
import { route as findRoute, type RoadGraph, type TravelMode } from '../core/route'
import { driveTrip, endTrip, MAP_CENTER, ROAD_GRAPH, subscribePositions, TRIP_SPEED, tripProgress, type Positions } from '../positions'
import { graphFromLines } from '../core/osmRoads'
import { getArea, lastSpot, moveToLocation, offerRoads, useArea } from '../roadArea'
import { seatsOf, type Taxi } from '../types'
import type { Person } from '../usePresence'
import { guessMoving } from '../core/presence'
import { loadMyLook, onMyLook } from '../myLook'
import { LookPreview } from './LookPreview'
import type { PublicVehicle } from '../vehicles'
import { useLiveBuses, type Bus, type BusRoute } from '../buses'
import { MOVING_ICONS, RESOURCE_ICONS, SERVICE_ICONS, VEHICLE_ICONS } from './iconStyles'
import type { PublicService } from '../services'
import type { PublicCenter } from '../centerApps'
import { useCenterMarkers } from './centerMarkers'
import { CenterCard } from './CenterCard'
import { nearestHelp, SERVICE_KINDS, todayHours, type ServiceKind } from '../core/services'
import { bearing, coastGlide, driveGlide, glideAt, glideBraking, glideSpeed, glideState, MAX_GLIDE_MS, MIN_GLIDE_MS, nextGlide, OVERRUN, standGlide, turnAhead, type Glide } from '../core/glide'
import { CATCH_UP_GIVE_UP_S, catchUpSpeed, driveProfile, indicator, leanDegrees, needsCatchUp, roadLimitKmh, type DriveType } from '../core/drive'
import { DEFAULT_DIMS, dimsFor, modelById, modelLabel } from '../core/vehicleModels'
import { SHAPE_PX, shapeSvg } from './vehicleShapes'
import { axleCentre, axleHeading, followFront, placeAxles, WHEELBASE_M, type Axles } from '../core/kinematics'
import { isTwoWay, LANE_OFFSET_M, toTheLeft, twoWayBetween } from '../core/lanes'
import { alongRoad, roadAhead, snapParked, snapToRoad, type Snapped } from '../core/snap'
import { filterReading, newTracker, personJumped, type Tracker } from '../core/gpsFilter'
import { forward, makeLine, nextStop, pointAt, project, stretch, type RouteLine } from '../core/routeLine'
import { createRoot, type Root } from 'react-dom/client'
import { loadPlots, plotPopup, plotsGeoJSON, type Plot } from './plotLayer'
import { MapChips } from './MapChips'
import { useSharedSpot } from './sharedSpot'
import type { SharedSpot } from '../core/shareLink'
import { chipShows, loadChip, saveChip, type MapChipId, type MarkerKind } from '../mapChips'
import { useSwipe } from './useSwipe'
import { addWorld, bridgeHeightAt, loadWorld, setWorld3d, setWorldNight, showWorld, worldAreaAt, worldResources, type Resource, type WorldBundle } from '../worldStyle'
import { FIG3D_MIN_ZOOM, FigureRegistry, lookColours, riderForLook, workLookFor, type Figure } from '../core/figures'
import type { VehicleShape } from '../core/vehicleModels'
import type { Rider } from '../vehicles'
import type { FiguresLayer } from '../figures3d/layer'

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
  // The trip's road distance by taxi (metres), or null: for the trip's total price.
  onTripMetres?: (metres: number | null) => void
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
  // Services for drivers (mechanics, tyres, towing...): approved fixed places and mobile helpers
  // who are Available. Given (even empty), the map shows the Services layer and Help near me.
  services?: PublicService[]
  // Approved taxi centers (logo markers, src/components/centerMarkers.tsx); Hire from this center.
  centers?: PublicCenter[]
  onHireCenter?: (id: string) => void
  // Full map: every menu slides away (App's header too) and only the map, its vehicles and services
  // show, with a small handle to bring the menus back. App keeps it for the session.
  mapOnly?: boolean
  onMapOnly?: (on: boolean) => void
  // A shared place (Share pickup link, src/core/shareLink.ts): the map opens on it with a pin, its
  // name and Route from the viewer. App leaves it out while a ride is in progress.
  sharedSpot?: SharedSpot | null
  onSharedClose?: () => void
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

const NO_SERVICES: PublicService[] = []

// A service's card on the map: its kinds, open now (with today's hours) or available now, the price
// note, Call and Route.
function ServiceCard({ s, metres, distance, onRoute }: { s: PublicService; metres: number | null; distance: (m: number) => string; onRoute?: () => void }) {
  const { t } = useI18n()
  const [now] = useState(() => new Date())
  const today = s.mode === 'fixed' ? todayHours(s.hours, now) : null
  const phone = s.phone.replace(/\D/g, '')
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1">
        {s.kinds.map((k) => {
          const Icon = SERVICE_ICONS[k]
          return (
            <li key={k} className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-xs font-semibold">
              <Icon className="size-3.5" aria-hidden="true" /> {t.svcKinds[k]}
            </li>
          )
        })}
      </ul>
      <p className="text-sm">
        <span className={`font-bold ${s.openNow ? 'text-emerald-700' : 'text-rose-700'}`}>{s.mode === 'mobile' ? t.svcAvailableNow : s.openNow ? t.svcOpenNow : t.svcClosedNow}</span>
        {s.mode === 'fixed' && (
          <span className="text-slate-600">
            {' · '}
            {today ? t.svcToday(today.open, today.close) : t.svcClosedToday}
          </span>
        )}
        {metres !== null && <span className="text-slate-600 tabular-nums"> · {distance(metres)}</span>}
      </p>
      {s.priceNote && <p className="text-sm text-slate-700">{s.priceNote}</p>}
      <div className="flex gap-2">
        {phone && (
          <a href={`tel:${phone}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white">
            <Phone className="size-4" aria-hidden="true" /> {t.svcCall} <span dir="ltr">{phone}</span>
          </a>
        )}
        {onRoute && (
          <button type="button" onClick={onRoute} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white">
            <RouteIcon className="size-4" aria-hidden="true" /> {t.svcRoute}
          </button>
        )}
      </div>
      {!onRoute && <p className="text-xs text-slate-500">{t.svcNeedSpot}</p>}
    </div>
  )
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
// The same colours for the 3D taxis (src/figures3d/): yellow-300, emerald-500, rose-600.
const TAXI_COLOURS: Record<Status, string> = { idle: '#fde047', answered: '#10b981', suspended: '#e11d48' }
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

// Private vehicles are drawn from the model library (src/core/vehicleModels.ts) with the shapes in
// ./vehicleShapes (static markup, nose up, body in currentColor, the owner's rider choice; no user
// data), at the model's real length and wheelbase.
// Vehicles at their real length for the zoom, like a game camera, never smaller than BADGE_PX on
// screen and with a maximum so they don't fill it. Zoomed out (an island or more in view: where the
// real-size shape would be under BADGE_SWITCH_PX, about zoom 17.5 for a car), a round badge (BADGE_PX
// across) with the type's icon and a direction arrow is drawn instead, so a motorbike or a bus stays
// easy to see. At street level the top-down shape takes over at the badge's own size (no jump) and
// grows to its true size as the map zooms in.
const TAXI_LENGTH_M = 4.5
const TAXI_DRAWN_PX = 36 // CAR_SVG height
const BUS_LENGTH_M = 12
const BUS_DRAWN_PX = 56 // BUS_SVG height
const BADGE_PX = 24
const BADGE_SWITCH_PX = 6
function realPx(m: MlMap, lengthM: number) {
  const lat = m.getCenter().lat
  const metresPerPx = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** m.getZoom())
  return lengthM / metresPerPx
}
// On a raised bridge deck (TaxiQ's own map), a marker's drawing and label are lifted on screen by
// the deck's height as seen at the map's tilt, so they sit on the deck (with the 3D figures riding
// on it), not on the sea under it. Only touches the marker when the lift changes.
function liftOnDeck(m: MlMap, marker: Marker, at: readonly [number, number]) {
  const h = bridgeHeightAt(at[0], at[1])
  const px = h ? realPx(m, h) * Math.sin((m.getPitch() * Math.PI) / 180) : 0
  const now = marker.getOffset().y
  if (Math.abs(now + px) > 0.5) marker.setOffset([0, -px])
}
const realScale = (px: number, drawnPx: number) => Math.max(BADGE_PX, Math.min(px, 160)) / drawnPx

// The zoomed-out badge: a round disc in the vehicle's colour with its type's icon (rendered by
// React into the marker) and a small arrow on its rim that points the way it is going.
interface Badge {
  el: HTMLSpanElement
  dir: HTMLSpanElement
  root: Root
  icon: string
}
function makeBadge(): Badge {
  const el = document.createElement('span')
  el.className = 'veh-badge'
  const dir = document.createElement('span')
  dir.className = 'veh-badge-dir'
  const icon = document.createElement('span')
  icon.className = 'veh-badge-icon'
  el.append(dir, icon)
  return { el, dir, root: createRoot(icon), icon: '' }
}
function setBadgeIcon(b: Badge, key: string, Icon: LucideIcon) {
  if (b.icon === key) return
  b.icon = key
  b.root.render(<Icon className="size-3.5" aria-hidden="true" strokeWidth={2.5} />)
}
// Dark or white icon, whichever reads on the badge's colour.
function inkFor(hex: string) {
  const n = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? '#0f172a' : '#ffffff'
}
// Draw a vehicle at this zoom: the badge (arrow turned by `rel` degrees) or the real-size shape.
function drawVehicle(root: HTMLElement, shape: HTMLElement, badge: Badge, px: number, drawnPx: number, rel: number, extra = '') {
  const asBadge = px < BADGE_SWITCH_PX
  if (root.classList.contains('as-badge') !== asBadge) {
    root.classList.toggle('as-badge', asBadge)
    shape.style.display = asBadge ? 'none' : ''
  }
  if (asBadge) badge.dir.style.transform = `rotate(${rel}deg)`
  else shape.style.transform = `rotate(${rel}deg) scale(${realScale(px, drawnPx)})${extra}`
}

// No road route at all (another island, roads not loaded), or too far to watch it drive there: a
// gentle, short cross-fade into place. A copy of the marker fades out where it was shown while the
// marker fades in at its new place (cloneNode copies the DOM as it is; no HTML is parsed). It never
// slides across the sea or through buildings.
const FADE_MS = 700
function crossFade(m: MlMap, marker: Marker, from: [number, number]) {
  const el = marker.getElement()
  const ghost = el.cloneNode(true) as HTMLElement
  ghost.classList.remove('xfade-in')
  ghost.classList.add('xfade-out')
  ghost.style.pointerEvents = 'none'
  const copy = new maplibregl.Marker({ element: ghost, rotationAlignment: 'viewport', pitchAlignment: 'viewport' }).setLngLat(ll(from)).addTo(m)
  setTimeout(() => copy.remove(), FADE_MS)
  el.classList.remove('xfade-in')
  void el.offsetWidth // restart the animation
  el.classList.add('xfade-in')
}

// A private vehicle or a bus on the map, moved by its GPS reports.
interface VehicleEntry {
  marker: Marker
  shape: HTMLDivElement
  badge: Badge
  price: HTMLSpanElement
  type: string
  glide: Glide | null
  lastReport: number | null
  atKey: string
  shownHeading: number
  onRoad: boolean
  lean: number
  tracker: Tracker
  s: number | null
  speed: number
  coasted: number
  snap: Snapped | null
  axles: Axles | null // real-car turning (src/core/kinematics.ts)
  len: number // real length (m), wheelbase (m) and the shape's drawn height (px)
  wb: number
  drawnPx: number
  lane: number // metres left of the road's middle now (eased between two-way and one-way roads)
  // For the 3D figures layer: the shape, rider, body colour and real width.
  fig: { shape: VehicleShape; rider: Rider; colour: string; width: number; taxi?: boolean }
  // Private vehicles: the owner's colour, and the center taxi it is linked to (its number), if any.
  // A linked vehicle is drawn in taxi colours except under the Private chip (paintVehicle).
  own?: string
  taxiNo?: string | null
  painted?: string
}

// A private vehicle's colours: its own, or (linked to a center taxi, outside the Private chip) the
// taxi colours, so taxis always look like taxis. Only touches the elements when it changes.
function paintVehicle(e: VehicleEntry, asTaxi: boolean) {
  const colour = asTaxi ? TAXI_COLOURS.idle : (e.own ?? '#475569')
  const key = `${colour}|${asTaxi}`
  if (e.painted === key) return
  e.painted = key
  e.fig.colour = colour
  e.fig.taxi = asTaxi
  e.shape.style.color = colour
  e.badge.el.style.color = colour
  e.badge.el.style.setProperty('--badge-ink', asTaxi ? '#0f172a' : inkFor(colour))
}

// The speed limit (km/h) of the road a vehicle is snapped to.
function snappedLimit(g: RoadGraph, s: Snapped | null, at: readonly [number, number]) {
  const k = s ? (g.next[s.i] ?? []).indexOf(s.j) : -1
  const l = s && k >= 0 ? g.limit?.[s.i]?.[k] : undefined
  return l ?? roadLimitKmh(undefined, at)
}

// A new accepted report: drive the vehicle to `target` (plans/vehicle-movement-rules.md §6). Always
// along the road route (`path`, or the roads from where it is shown, following one-way streets),
// never across a block: at its normal steady glide when that's within the road's speed, otherwise
// catching up a bit faster (at most 1.5x the limit, about 10 s) with the driving rules (gentle
// acceleration, slowing for corners, stopping at the end). With no road route at all, a short hop
// glides straight and anything longer cross-fades; so does a catch-up that would take over 30 s.
function moveVehicle(m: MlMap, e: VehicleEntry, g: RoadGraph, now: number, mv: { target: [number, number]; snapped: Snapped | null; path?: [number, number][] | null; type: DriveType; phoneHeading?: number | null; standHeading: () => number }) {
  if (!e.glide) {
    e.glide = standGlide(mv.target, mv.standHeading(), now)
    e.axles = null
    return
  }
  const from = glideAt(e.glide, now)
  const hop = metresBetween(from, mv.target)
  let path = mv.path ?? null
  if (!path && mv.snapped && hop >= 3) path = findRoute(g, from, mv.target, 'taxi')?.path ?? null
  if (path && path.length >= 2) {
    let roadM = 0
    for (let i = 1; i < path.length; i++) roadM += metresBetween(path[i - 1]!, path[i]!)
    const gap = e.lastReport === null ? MIN_GLIDE_MS : now - e.lastReport
    const normalMs = Math.min(MAX_GLIDE_MS, Math.max(MIN_GLIDE_MS, gap * OVERRUN))
    const limit = snappedLimit(g, mv.snapped, mv.target)
    if (!needsCatchUp(roadM, normalMs, limit)) {
      e.glide = nextGlide(e.glide, mv.target, now, e.lastReport, mv.phoneHeading, path)
      return
    }
    const moving = now < e.glide.start + e.glide.dur
    const prof = driveProfile([from, ...path.slice(1)], mv.type, moving ? glideSpeed(e.glide, now) : 0, catchUpSpeed(roadM, limit))
    if ((prof.d.length - 1) * prof.dt <= CATCH_UP_GIVE_UP_S) {
      e.glide = driveGlide(e.glide, path, now, prof)
      return
    }
  } else if (hop <= (mv.snapped ? 30 : 80)) {
    e.glide = nextGlide(e.glide, mv.target, now, e.lastReport, mv.phoneHeading)
    return
  }
  crossFade(m, e.marker, e.axles ? axleCentre(e.axles) : from)
  e.glide = standGlide(mv.target, mv.standHeading(), now)
  e.axles = null
  e.speed = 0
}

// A bus route's own line: its stops in order, joined along the roads (built once per road map).
const routeLines = new WeakMap<RoadGraph, Map<string, RouteLine | null>>()
function routeLineFor(route: BusRoute, g: RoadGraph): RouteLine | null {
  if (!g.nodes.length || route.stops.length < 2) return null
  let cache = routeLines.get(g)
  if (!cache) routeLines.set(g, (cache = new Map()))
  if (cache.has(route.code)) return cache.get(route.code)!
  // Only on a road map that covers the route (e.g. not Kulhudhuffushi's roads while looking at
  // Malé): otherwise no route line, and the bus is shown where its GPS says.
  const first = route.stops[0]!.at
  const last = route.stops[route.stops.length - 1]!.at
  if (!snapToRoad(g, first, 300) || !snapToRoad(g, last, 300)) {
    cache.set(route.code, null)
    return null
  }
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
  badge: Badge
}

// Marker = rotating car + upright number label. Text goes in via textContent, never HTML.
function markerParts(): MarkerParts {
  const root = document.createElement('div')
  root.className = 'relative size-10 cursor-pointer'
  const car = document.createElement('div')
  car.className = 'taxi-car absolute inset-0 grid place-items-center drop-shadow-md will-change-transform'
  car.innerHTML = withIndicators(CAR_SVG)
  const label = document.createElement('span')
  label.className = 'absolute -top-4 left-1/2 -translate-x-1/2 rounded-full border px-1.5 text-[11px] leading-4 font-black tabular-nums shadow'
  const badge = makeBadge()
  setBadgeIcon(badge, 'taxi', CarTaxiFront)
  root.append(car, badge.el, label)
  return { root, car, label, badge }
}

const ll = (p: [number, number]): [number, number] => [p[1], p[0]] // [lat, lng] -> MapLibre [lng, lat]

// A person sharing their position, for the 3D figures layer: standing or walking in their chosen
// look; on a bicycle, e-bike or motorbike as that vehicle with them riding it; in a taxi, nothing
// (the taxi is drawn).
const RIDDEN: Partial<Record<string, { shape: VehicleShape; length: number; width: number }>> = {
  bike: { shape: 'bicycle', length: 1.75, width: 0.6 },
  ebike: { shape: 'ebike', length: 1.75, width: 0.65 },
  motorbike: { shape: 'scooter', length: 1.85, width: 0.7 },
}
// A person drawn on the map (someone sharing, or the viewer's own avatar).
interface PersonEntry {
  marker: Marker
  root: Root
  label: HTMLSpanElement
  dir: HTMLSpanElement
  mode: string
  glide: Glide | null
  lastReport: number | null
  atKey: string
  look: Person['look']
  lookColour: number
  faded: boolean
}
// The viewer's own avatar's key among the people (never a uid).
const ME = '~me'
// A faint accuracy ring around the viewer only when the fix is worse than this (m).
const ACCURACY_RING_M = 25

// A new position for a person: glide on to it, or (a jump) fade across.
function movePerson(m: MlMap, entry: PersonEntry, at: [number, number]) {
  const now = performance.now()
  const shown = entry.glide ? glideAt(entry.glide, now) : at
  const gapS = entry.lastReport === null ? 0 : (now - entry.lastReport) / 1000
  if (entry.glide && personJumped(metresBetween(shown, at), gapS)) {
    crossFade(m, entry.marker, shown)
    entry.glide = standGlide(at, entry.glide.heading, now)
  } else entry.glide = nextGlide(entry.glide, at, now, entry.lastReport)
  entry.lastReport = now
  entry.atKey = at.join(',')
}

// A person's flat marker: a disc with an icon (React-rendered), a direction arrow and a name label.
function personElement(className: string) {
  const el = document.createElement('div')
  el.className = className
  const disc = document.createElement('span')
  disc.className = 'person-marker-disc'
  const icon = document.createElement('span')
  icon.className = 'person-marker-icon'
  const dir = document.createElement('span')
  dir.className = 'person-marker-dir'
  disc.append(icon, dir)
  const label = document.createElement('span')
  label.className = 'person-marker-label'
  el.append(disc, label)
  return { el, icon, dir, label }
}

function personFigure(id: string, mode: string, look: Person['look'], colour: number, at: [number, number], heading: number, moving: boolean, speed: number, faded: boolean): Figure | null {
  if (mode === 'taxi') return null
  const ride = RIDDEN[mode]
  const base = { id, cat: 'person' as const, at, heading, moving, speed, braking: false, signal: null, lean: 0, faded }
  if (ride) return { ...base, model: { kind: 'vehicle', shape: ride.shape, rider: riderForLook(look) }, colour: lookColours(colour)[0], length: ride.length, width: ride.width }
  return { ...base, model: { kind: 'person', look, colour }, colour: '', length: look === 'young' ? 1.45 : look === 'child' ? 1.2 : 1.7, width: 0.45 }
}

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

const OWN_MAP_KEY = 'taxiq.ownMap'
const VIEW_KEY = 'taxiq.mapView' // '2d' or '3d'

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
export default function MapView({ taxis, interested, pickupAt, onPickTaxi, trip, positionSource = subscribePositions, fullscreen = false, panel, panelTitle, panelOpen = true, onPanelOpenChange, onPanelClose, pinMode = null, onPin, onPinCancel, activeTrip, onHireFrom, people = [], vehicles = [], buses: busesProp, onHireVehicle, focusVehicle = null, myUid = null, privateRide, shareControl, driving = false, onTripMetres, services: servicesProp, mapOnly = false, onMapOnly, centers, onHireCenter, sharedSpot = null, onSharedClose }: Props) {
  const { lang, t, driverName } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const [locationOff, setLocationOff] = useState(false) // the viewer blocked location
  // Where the viewer is (the map's own location fixes), rounded to about 10 m: for Help near me and
  // routes to a service. Null until located (and on the game map).
  const [mySpot, setMySpot] = useState<[number, number] | null>(null)
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
  const markers = useRef(new Map<string, { marker: Marker; parts: MarkerParts; onMap: boolean; status: Status }>())
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
  const labels = useRef({ hire: '', follow: '', unfollow: '', suspended: '', seats: (n: number) => `${n}` })
  useEffect(() => {
    labels.current = { hire: t.menuHire, follow: t.menuFollow, unfollow: t.menuUnfollow, suspended: t.menuSuspended, seats: t.vehSeats }
  }, [t])
  useEffect(() => {
    pickRef.current = onPickTaxi
  }, [onPickTaxi])

  const [places, setPlaces] = useState<Place[] | null>(null)
  const [showPlots, setShowPlots] = useState(true)
  // TaxiQ's own map (src/worldStyle.ts) where we have it, instead of OpenStreetMap's tiles.
  // On by default, remembered on the device.
  const [ownMap, setOwnMapState] = useState(() => {
    try {
      return localStorage.getItem(OWN_MAP_KEY) !== '0'
    } catch {
      return true
    }
  })
  const setOwnMap = (on: boolean) => {
    setOwnMapState(on)
    try {
      localStorage.setItem(OWN_MAP_KEY, on ? '1' : '0')
    } catch {
      // private window: kept for this visit only
    }
  }
  const [worldArea, setWorldArea] = useState<string | null>(null)
  const worldOn = ownMap && worldArea !== null
  // 2D or 3D view (the 2D / 3D switch), remembered on the device; 3D by default. 2D keeps the map flat
  // and top-down (no tilt, flat buildings, today's flat drawings); 3D tilts on TaxiQ's own map, raises
  // the buildings and, zoomed in, draws vehicles and people as 3D models (src/figures3d/).
  const [view3d, setView3dState] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) !== '2d'
    } catch {
      return true
    }
  })
  const setView3d = (on: boolean) => {
    setView3dState(on)
    try {
      localStorage.setItem(VIEW_KEY, on ? '3d' : '2d')
    } catch {
      // private window: kept for this visit only
    }
  }
  const view3dRef = useRef(view3d)
  useEffect(() => {
    view3dRef.current = view3d
  })
  const [figZoom, setFigZoom] = useState(false) // zoomed in far enough for 3D figures
  // What the 3D figures layer draws: filled where the DOM markers are moved (never a second copy of
  // the movement logic). The layer itself (three.js) loads only when 3D figures show.
  const figures = useRef(new FigureRegistry())
  const figLayer = useRef<FiguresLayer | null>(null)
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
  // Opened from a shared place: start there, and don't let the location lock pull the map away.
  const sharedAtStart = useRef(followsViewer ? sharedSpot : null)
  const onFix = useRef<(c: GeolocationCoordinates) => void>(() => {})
  const graphRef = useRef(graph) // the roads, for keeping vehicles on them (read in the animation loop)
  useEffect(() => {
    graphRef.current = graph
  })
  // Places for search, labels and pin names: the viewer's area (e.g. Malé) on the real app's map;
  // the game map stays on Kulhudhuffushi.
  const placesKey = followsViewer ? (regionAt(area.center)?.id ?? 'home') : 'home'
  // Category chips (full screen only): one at a time, remembered on the device. The Bus chip only
  // where buses can show (the real app's map), Services only where the map has them.
  const [chipState, setChipState] = useState<MapChipId>(loadChip)
  const chipIds: MapChipId[] = ['all', 'taxi', ...(followsViewer || busesProp ? (['bus'] as const) : []), 'private', ...(servicesProp ? (['services'] as const) : [])]
  const chip: MapChipId = fullscreen && chipIds.includes(chipState) ? chipState : 'all'
  const shows = (k: MarkerKind) => chipShows(chip, k)
  // RTL buses: wherever the map is looking in Greater Malé (or the viewer is there).
  const [viewRegion, setViewRegion] = useState<string | null>(null)
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const look = () => {
      const c = m.getCenter()
      setViewRegion(regionAt([c.lat, c.lng])?.id ?? null)
      setWorldArea(worldAreaAt([c.lat, c.lng], m.getZoom()))
    }
    look()
    m.on('moveend', look)
    return () => {
      m.off('moveend', look)
    }
  }, [ready])
  // Live RTL buses: only on the real app's map, in the Greater Malé area, and only while the chip
  // shows buses (All or Bus); otherwise the feed isn't asked at all.
  const busArea = followsViewer && (placesKey === 'male' || viewRegion === 'male')
  const liveBuses = useLiveBuses(busArea && shows('bus'))
  const placesHere = () => (followRef.current ? loadPlacesAround(getArea().center) : loadPlaces())

  // Create the map once.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current!,
      style: OSM_STYLE,
      // Real-app map: open where the viewer was last (or the whole Maldives) and look for them at
      // once; never assume Kulhudhuffushi. The game map stays on its island.
      center: ll(sharedAtStart.current?.at ?? (followRef.current ? (lastSpot() ?? MALDIVES) : MAP_CENTER)),
      zoom: sharedAtStart.current ? 18 : followRef.current ? (lastSpot() ? 15 : 5.5) : 16,
      minZoom: 1,
      maxZoom: 22,
      maxPitch: 60,
      attributionControl: {
        compact: true,
        customAttribution:
          'Place names: <a href="https://kulhudhuffushicity.gov.mv/map">Kulhudhuffushi City Council</a> map, via mapkf by emjey; Malé: Malé City Council; Hulhumalé: <a href="https://gis.hdc.mv/">HDC</a>; postcodes: <a href="https://maldivespost.com/post-code">Maldives Post</a>; bus positions: <a href="https://rtl.mv">RTL (MTCC)</a>',
      },
    })
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), 'top-right')
    // The viewer's own location: every GPS change (at least every 10 s) moves their avatar (drawn by
    // us, meFix below; MapLibre's blue dot is off), and the map follows it until they drag it; the
    // button re-centres and follows again.
    const geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }, trackUserLocation: true, showUserLocation: false })
    m.addControl(geo, 'top-right')
    geo.on('geolocate', (e) => meFix.current(e.coords))
    if (followRef.current) {
      onFix.current = (c) => {
        setLocationOff(false)
        moveToLocation([c.latitude, c.longitude])
        const at: [number, number] = [Math.round(c.latitude * 1e4) / 1e4, Math.round(c.longitude * 1e4) / 1e4]
        setMySpot((x) => (x && x[0] === at[0] && x[1] === at[1] ? x : at))
      }
      geo.on('geolocate', (e) => onFix.current(e.coords))
      geo.on('error', (e) => {
        if (e.code !== 1) return // a timeout or no fix: keep looking
        // Location blocked: show Kulhudhuffushi, where the demo data is, and say so.
        setLocationOff(true)
        m.flyTo({ center: ll(MAP_CENTER), zoom: 15 })
      })
    }
    m.on('load', () => {
      setReady(true)
      // Look for the viewer straight away; opened on a shared place, find them once without moving
      // the map (the location button still follows them).
      if (followRef.current && !sharedAtStart.current) geo.trigger()
      else if (followRef.current)
        navigator.geolocation?.getCurrentPosition(
          (p) => {
            meFix.current(p.coords)
            onFix.current(p.coords)
          },
          (e) => e.code === 1 && setLocationOff(true),
          { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
        )
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
  const [plotsAdded, setPlotsAdded] = useState(false)
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
      setPlotsAdded(true)
    })
    return () => {
      cancelled = true
    }
  }, [ready])

  useEffect(() => {
    const m = map.current
    if (!m || !ready || !plotsAdded || !m.getLayer('plots-fill')) return
    // On TaxiQ's own map the houses are buildings, so the plot chart isn't needed there. Also run
    // once the chart has loaded: on Kulhudhuffushi (the game map) our map can show before it does.
    const v = showPlots && !worldOn ? 'visible' : 'none'
    m.setLayoutProperty('plots-fill', 'visibility', v)
    m.setLayoutProperty('plots-line', 'visibility', v)
  }, [showPlots, ready, worldOn, plotsAdded])

  // TaxiQ's own map: our island, sea, reef, roads and 3D buildings, in place of the OpenStreetMap
  // tiles (none are asked for while it shows). Loaded the first time the map looks at the area;
  // tilted like a game camera on the way in (tilt back for top-down). Vehicles and pins are DOM
  // markers, so they stay on top of the buildings.
  const shownWorld = useRef<string | null>(null)
  const [worldData, setWorldData] = useState<WorldBundle | null>(null)
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    let live = true
    const hide = () => {
      if (shownWorld.current) showWorld(m, shownWorld.current, false)
      shownWorld.current = null
      if (m.getLayer('osm')) m.setLayoutProperty('osm', 'visibility', 'visible')
      setWorldData(null)
    }
    if (!worldOn || !worldArea) {
      hide()
      return
    }
    void loadWorld(worldArea)
      .then((w) => {
        if (!live) return
        const layers = m.getStyle().layers
        const before = layers[layers.findIndex((l) => l.id === 'osm') + 1]?.id
        addWorld(m, worldArea, w, before, night)
        setWorldNight(m, worldArea, night)
        setWorld3d(m, worldArea, view3dRef.current)
        if (shownWorld.current !== worldArea && view3dRef.current) {
          if (shownWorld.current) showWorld(m, shownWorld.current, false)
          // Coming in: tilt to the game view once the map has settled (a fly to the viewer would
          // cancel it); geolocateSource keeps "follow me" on.
          let tries = 3
          const tilt = () => {
            if (!live || !view3dRef.current || shownWorld.current !== worldArea || m.getPitch() >= 20 || tries-- <= 0) m.off('moveend', later)
            else if (!m.isMoving()) m.easeTo({ pitch: 55, duration: 900 }, { geolocateSource: true })
          }
          const later = () => setTimeout(tilt, 50)
          m.on('moveend', later)
          setTimeout(tilt, 300)
        }
        showWorld(m, worldArea, true)
        m.setLayoutProperty('osm', 'visibility', 'none')
        shownWorld.current = worldArea
        setWorldData(w)
      })
      .catch(hide)
    return () => {
      live = false
    }
  }, [ready, worldOn, worldArea, night])

  // The 2D / 3D switch, at once: 2D lays the map flat (pitch 0, no tilting) with flat buildings;
  // 3D allows tilting again and tilts to the game view on TaxiQ's own map. Following, chips and
  // markers carry on (only the camera's pitch changes).
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    if (shownWorld.current) setWorld3d(m, shownWorld.current, view3d)
    if (!view3d) {
      if (m.getPitch() > 0) m.jumpTo({ pitch: 0 })
      m.setMaxPitch(0)
    } else {
      m.setMaxPitch(60)
      if (shownWorld.current && m.getPitch() < 20) m.easeTo({ pitch: 55, duration: 500 }, { geolocateSource: true })
    }
  }, [view3d, ready, worldData])

  // Zoomed in far enough for 3D figures (only crossing the line changes state).
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const z = () => setFigZoom(m.getZoom() >= FIG3D_MIN_ZOOM)
    z()
    m.on('zoom', z)
    return () => {
      m.off('zoom', z)
    }
  }, [ready])

  // 3D figures: on TaxiQ's own map, in 3D view, zoomed in. three.js is downloaded the first time
  // (its own chunk); the layer stays on the map and is switched on and off. While it's on, the
  // map's container has .fig3d, which hides the flat vehicle and person drawings (their labels,
  // taps and menus stay).
  const fig3d = view3d && figZoom && !!worldData
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    m.getContainer().classList.toggle('fig3d', fig3d && !!figLayer.current)
    if (!fig3d) {
      figLayer.current?.setEnabled(false)
      return
    }
    let live = true
    const on = (layer: FiguresLayer) => {
      layer.setNight(night)
      layer.setEnabled(true)
      m.getContainer().classList.add('fig3d')
    }
    if (figLayer.current) on(figLayer.current)
    else
      void import('../figures3d/layer').then(({ createFiguresLayer }) => {
        if (!live || figLayer.current || !map.current) return
        const layer = createFiguresLayer(figures.current)
        figLayer.current = layer
        m.addLayer(layer)
        on(layer)
      })
    return () => {
      live = false
    }
  }, [fig3d, ready, night])

  // Places people go on TaxiQ's own map (mosques, schools, health, harbours, shops...): a round
  // icon each, from zoom 16 (shops from 17.5), only those in view. Tap for the name.
  const resources = useMemo<Resource[]>(() => (worldData ? worldResources(worldData) : []), [worldData])
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const shown = new Map<number, { marker: Marker; root: Root }>()
    const render = () => {
      const z = m.getZoom()
      const view = m.getBounds()
      const want = new Set<number>()
      if (z >= 16) {
        for (let i = 0; i < resources.length && want.size < 150; i++) {
          const r = resources[i]!
          if ((r.kind === 'shop' && z < 17.5) || !view.contains(ll(r.at))) continue
          want.add(i)
        }
      }
      for (const [i, e] of shown) {
        if (want.has(i)) continue
        e.marker.remove()
        const root = e.root
        setTimeout(() => root.unmount())
        shown.delete(i)
      }
      for (const i of want) {
        if (shown.has(i)) continue
        const r = resources[i]!
        const name = (lang === 'dv' ? r.dv || r.en : r.en || r.dv) || t.worldKinds[r.kind]
        const el = document.createElement('button')
        el.type = 'button'
        el.className = `world-res world-res-${r.kind}`
        el.setAttribute('aria-label', name)
        el.title = name
        el.onclick = (ev) => {
          ev.stopPropagation()
          const card = document.createElement('div')
          card.dir = lang === 'dv' ? 'rtl' : 'ltr'
          const title = document.createElement('div')
          title.style.fontWeight = '700'
          title.textContent = name
          const sub = document.createElement('div')
          sub.style.cssText = 'font-size:11px;color:#64748b'
          sub.textContent = t.worldKinds[r.kind]
          card.append(title)
          if (name !== sub.textContent) card.append(sub)
          popup.current?.remove()
          popup.current = new maplibregl.Popup({ closeButton: true, maxWidth: '240px', offset: 14 }).setLngLat(ll(r.at)).setDOMContent(card).addTo(m)
        }
        const root = createRoot(el)
        const Icon = RESOURCE_ICONS[r.kind]
        root.render(<Icon className="size-3.5" aria-hidden="true" />)
        shown.set(i, { marker: new maplibregl.Marker({ element: el }).setLngLat(ll(r.at)).addTo(m), root })
      }
    }
    render()
    m.on('moveend', render)
    return () => {
      m.off('moveend', render)
      for (const e of shown.values()) {
        e.marker.remove()
        const root = e.root
        setTimeout(() => root.unmount())
      }
    }
  }, [ready, resources, lang, t])

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
    // Places load in small tiles: as the map moves (zoomed in), load the tiles in view too.
    const more = () => {
      if (m.getZoom() < 18) return
      const c = m.getCenter()
      void loadPlacesAround([c.lat, c.lng]).then((list) => {
        if (cancelled || list.length === all.length) return
        all = list
        render()
      })
    }
    m.on('moveend', render)
    m.on('moveend', more)
    return () => {
      cancelled = true
      m.off('moveend', render)
      m.off('moveend', more)
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
        figures.current.delete(`t:${id}`)
        const root = entry.parts.badge.root
        setTimeout(() => root.unmount())
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
        entry = { marker, parts, onMap: false, status }
        markers.current.set(taxi.id, entry)
      }
      const { marker, parts } = entry
      parts.car.className = `taxi-car absolute inset-0 grid place-items-center drop-shadow-md will-change-transform ${statusClass[status]}`
      entry.status = status
      parts.badge.el.className = `veh-badge ${statusClass[status]}`
      parts.badge.el.style.setProperty('--badge-ink', status === 'suspended' ? '#ffffff' : '#0f172a')
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
        // Seats, and the plate only where this viewer already has it (staff: the taxi records;
        // the public projection has no plate).
        const about = document.createElement('p')
        about.className = 'taxi-menu-note'
        about.style.color = '#334155'
        about.textContent = `${labels.current.seats(seatsOf(taxi))}${taxi.taxiReg ? ` · ${taxi.taxiReg}` : ''}`
        menu.append(about)
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
      const px = realPx(m, TAXI_LENGTH_M)
      for (const [id, entry] of markers.current) {
        const p = latest.get(id)
        if (!p) {
          if (entry.onMap) {
            entry.marker.remove()
            entry.onMap = false
          }
          figures.current.delete(`t:${id}`)
          continue
        }
        entry.marker.setLngLat([p.lng, p.lat])
        liftOnDeck(m, entry.marker, [p.lat, p.lng])
        drawVehicle(entry.parts.root, entry.parts.car, entry.parts.badge, px, TAXI_DRAWN_PX, p.heading - bearing)
        setSignal(entry.parts.car, p.signal)
        entry.parts.car.classList.toggle('braking', !!p.braking)
        figures.current.set({
          id: `t:${id}`,
          cat: 'taxi',
          model: { kind: 'vehicle', shape: 'sedan', taxi: true },
          colour: TAXI_COLOURS[entry.status],
          at: [p.lat, p.lng],
          heading: p.heading,
          length: TAXI_LENGTH_M,
          width: 1.75,
          moving: true,
          speed: 0,
          braking: !!p.braking,
          signal: p.signal ?? null,
          lean: 0,
          faded: false,
        })
        if (!entry.onMap) {
          entry.marker.addTo(m)
          entry.onMap = true
        }
      }
      figLayer.current?.kick()
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
    // The pin is usable at once (named or not); the name follows when the places around THE PIN
    // (not the viewer) are loaded: the nearest house or landmark, else the nearest road.
    let turn = 0
    let live = true
    const name = (p: Place) => `${lang === 'dv' && p.d ? p.d : p.e}${p.pc ? `, ${p.pc}` : ''}`
    const update = () => {
      const c = m.getCenter()
      const at: [number, number] = [c.lat, c.lng]
      const mine = ++turn
      setPin((old) => (old && old.at[0] === at[0] && old.at[1] === at[1] ? old : { at, name: '' }))
      void loadPlacesAround(at)
        .then((list) => {
          if (!live || mine !== turn) return
          const best = nearestPlace(list, at)
          const road = best ? null : nearestRoad(list, at)
          setPin({ at, name: best ? name(best) : road ? t.pinNearRoad(name(road)) : '' })
        })
        .catch(() => undefined)
    }
    update()
    m.on('moveend', update)
    return () => {
      live = false
      m.off('moveend', update)
    }
  }, [ready, pinMode, lang, t])

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

  // People sharing their position: a round icon for how they move, the same size at every zoom (so
  // they stay visible zoomed out); people on a bike, e-bike or motorbike get a bigger, bolder disc,
  // and anyone moving a small arrow the way they're going. Staff also see the name. Built with DOM
  // text; the icon is rendered by React into the marker. Never moved onto roads: a long jump
  // cross-fades into place.
  const peopleMarkers = useRef(new Map<string, PersonEntry>())
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
        const { el, icon, dir, label } = personElement('person-marker')
        const root = createRoot(icon)
        entry = { marker: new maplibregl.Marker({ element: el }).setLngLat(ll(p.at)).addTo(m), root, label, dir, mode: '', glide: null, lastReport: null, atKey: '', look: 'plain', lookColour: 0, faded: false }
        peopleMarkers.current.set(p.id, entry)
      }
      if (p.at.join(',') !== entry.atKey) movePerson(m, entry, p.at)
      entry.label.textContent = p.name ?? ''
      entry.look = p.look
      entry.lookColour = p.lookColour
      entry.faded = !!p.level && p.level !== 'active'
      const pel = entry.marker.getElement()
      pel.style.opacity = p.level && p.level !== 'active' ? '0.6' : '1'
      pel.title = p.level && p.level !== 'active' ? vLabels.current.level(p.level) : ''
      entry.label.style.display = p.name ? '' : 'none'
      if (entry.mode !== p.mode) {
        entry.mode = p.mode
        pel.classList.toggle('fast', p.mode === 'bike' || p.mode === 'ebike' || p.mode === 'motorbike')
        pel.classList.toggle('in-taxi', p.mode === 'taxi') // not drawn in 3D (they're in the taxi)
        const Icon = MOVING_ICONS[p.mode]
        entry.root.render(<Icon className="size-4" aria-hidden="true" />)
      }
    }
    for (const [id, entry] of peopleMarkers.current) {
      if (seen.has(id) || id === ME) continue
      figures.current.delete(`p:${id}`)
      entry.marker.remove()
      const root = entry.root
      setTimeout(() => root.unmount())
      peopleMarkers.current.delete(id)
    }
  }, [peopleKey, ready])

  // The viewer's own avatar, where MapLibre's blue dot was (the GeolocateControl still finds them,
  // follows and re-centres; its dot is off): their chosen look (Show me on the map, kept on this
  // device; Simple until chosen), a flat disc with a heading arrow, or a 3D figure that walks when
  // they move (the people's glide and figures, under the key ME). A faint ring when the fix is
  // rough. Only this viewer sees it; nothing is sent anywhere.
  const meHidden = driving || (!!myUid && vehicles.some((v) => v.ownerUid === myUid))
  const meFix = useRef<(c: GeolocationCoordinates) => void>(() => {})
  const inRideRef = useRef(false)
  useEffect(() => {
    inRideRef.current = !!activeTrip || (!!privateRide && privateRide.status === 'onboard')
  })
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    let look = loadMyLook()
    let entry: PersonEntry | null = null
    const people = peopleMarkers.current
    const figs = figures.current
    const ring = document.createElement('span')
    ring.className = 'me-accuracy'
    let accuracy = 0
    const speeds: number[] = []
    let last: { at: [number, number]; t: number } | null = null
    const sizeRing = () => {
      const show = accuracy > ACCURACY_RING_M
      ring.style.display = show ? '' : 'none'
      if (show) ring.style.width = ring.style.height = `${Math.min(1200, realPx(m, accuracy * 2)).toFixed(0)}px`
    }
    const paint = () => entry?.root.render(<LookPreview look={look.look} colour={look.colour} size={24} />)
    meFix.current = (c) => {
      const at: [number, number] = [c.latitude, c.longitude]
      const t = Date.now()
      if (!entry) {
        const { el, icon, dir, label } = personElement('person-marker me')
        el.append(ring)
        label.style.display = 'none'
        entry = { marker: new maplibregl.Marker({ element: el }).setLngLat(ll(at)).addTo(m), root: createRoot(icon), label, dir, mode: 'walk', glide: null, lastReport: null, atKey: '', look: look.look, lookColour: look.colour, faded: false }
        people.set(ME, entry)
        paint()
      }
      // How they move (walking, cycling, in a taxi...) from their speed, like Show me on the map.
      const v = c.speed !== null && Number.isFinite(c.speed) ? c.speed : last && t > last.t ? metresBetween(last.at, at) / ((t - last.t) / 1000) : 0
      speeds.push(v)
      if (speeds.length > 5) speeds.shift()
      last = { at, t }
      const mode = guessMoving(speeds, inRideRef.current)
      if (mode !== entry.mode) {
        entry.mode = mode
        const el = entry.marker.getElement()
        el.classList.toggle('in-taxi', mode === 'taxi')
      }
      if (at.join(',') !== entry.atKey) movePerson(m, entry, at)
      accuracy = c.accuracy
      sizeRing()
    }
    const off = onMyLook((l) => {
      look = l
      if (entry) {
        entry.look = l.look
        entry.lookColour = l.colour
      }
      paint()
    })
    m.on('zoom', sizeRing)
    return () => {
      off()
      m.off('zoom', sizeRing)
      meFix.current = () => {}
      if (entry) {
        entry.marker.remove()
        const root = entry.root
        setTimeout(() => root.unmount())
      }
      figs.delete(`p:${ME}`)
      people.delete(ME)
    }
  }, [ready])

  // Private vehicles for hire: a top-down vehicle (car, van, pickup, motorbike, e-bike) in its own
  // colour, with an upright price label. Between the owner's reports it glides at a steady speed and
  // turns to face its way (src/core/glide.ts), so it drives rather than jumps. Tap for its type,
  // owner's first name and price. Text goes in with textContent only.
  const vehicleMarkers = useRef(new Map<string, VehicleEntry>())
  const vehiclesKey = JSON.stringify(vehicles)
  const vLabels = useRef({ type: (x: string) => x, price: (b: number, k: number) => `${b} ${k}`, hire: '', follow: '', unfollow: '', level: (l: string) => l, seats: (n: number) => `${n}`, linked: (n: string) => n })
  const hireVehicleRef = useRef(onHireVehicle)
  const myUidRef = useRef(myUid)
  useEffect(() => {
    vLabels.current = { type: (x) => t.vehTypes[x as keyof typeof t.vehTypes] ?? x, price: t.vehPrice, hire: t.privHire, follow: t.menuFollow, unfollow: t.menuUnfollow, level: (l) => t.beatLevels[l as keyof typeof t.beatLevels] ?? l, seats: t.vehSeats, linked: t.menuLinkedTaxi }
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
        const badge = makeBadge()
        const price = document.createElement('span')
        price.className = 'vehicle-marker-price'
        el.append(shape, badge.el, price)
        const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'viewport', pitchAlignment: 'viewport' }).setLngLat(ll(v.at)).addTo(m)
        entry = { marker, shape, badge, price, type: '', glide: null, lastReport: null, atKey: '', shownHeading: v.heading || 0, onRoad: false, lean: 0, tracker: newTracker(), s: null, speed: 0, coasted: 0, snap: null, axles: null, lane: 0, len: DEFAULT_DIMS.car.length, wb: DEFAULT_DIMS.car.wheelbase, drawnPx: SHAPE_PX.hatchback.h, fig: { shape: 'hatchback', rider: 'none', colour: '#475569', width: DEFAULT_DIMS.car.width }, own: '#475569', taxiNo: null }
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
        // along the roads (one-way streets followed), catching up after lost signal or a jump.
        const g = g0
        const snapped = snap0
        const target = snapped ? snapped.at : v.at
        const dt = e.lastReport === null ? 0 : (now - e.lastReport) / 1000
        if (dt > 0 && e.glide) e.speed = Math.min(60 / 3.6, metresBetween(glideAt(e.glide, now), target) / dt)
        e.snap = snapped
        e.onRoad = !!snapped
        moveVehicle(m, e, g, now, {
          target,
          snapped,
          type: v.type,
          phoneHeading: snapped ? null : v.heading,
          standHeading: () => (snapped ? alongRoad(g, snapped, e.shownHeading || v.heading) : v.heading || e.shownHeading),
        })
        e.lastReport = now
      }
      // Its colours are painted by the chip effect below (paintVehicle): its own, or taxi colours.
      const colour = vehicleColour(v.colour)
      if (e.own !== colour) e.painted = ''
      e.own = colour
      setBadgeIcon(e.badge, v.type, VEHICLE_ICONS[v.type])
      e.price.textContent = vLabels.current.price(v.priceBase, v.pricePerKm)
      const vel = e.marker.getElement()
      vel.classList.toggle('mine', !!myUidRef.current && v.ownerUid === myUidRef.current)
      vel.style.opacity = v.level !== 'active' ? '0.7' : '1'
      vel.title = v.level !== 'active' ? vLabels.current.level(v.level) : ''
      const look = `${v.type}:${v.rider}:${v.modelId ?? ''}`
      if (e.type !== look) {
        e.type = look
        const dims = dimsFor(v.type, v.modelId)
        e.fig = { shape: dims.shape, rider: v.rider, colour, width: dims.width }
        e.painted = ''
        e.len = dims.length
        e.wb = dims.wheelbase
        e.drawnPx = SHAPE_PX[dims.shape].h
        e.shape.innerHTML = withIndicators(shapeSvg(dims.shape, 'currentColor', v.rider)) // our own markup, no user data
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
        box.append(title)
        // What it is: the model (when the owner picked one), colour and seats, and the center taxi
        // it also runs as. No plate: the public projection has none (the owner's choice, later).
        const line = (text: string, colour?: string) => {
          if (!text) return
          const p = document.createElement('p')
          p.className = 'taxi-menu-note'
          p.style.color = colour ?? '#334155'
          p.textContent = text
          box.append(p)
        }
        const model = modelById(v.modelId)
        line(model ? modelLabel(model) : '')
        line([v.colour, v.seats > 0 ? vLabels.current.seats(v.seats) : ''].filter(Boolean).join(' · '))
        if (e.taxiNo) line(vLabels.current.linked(e.taxiNo))
        line(vLabels.current.price(v.priceBase, v.pricePerKm), '#065f46')
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
      figures.current.delete(`v:${id}`)
      entry.marker.remove()
      const root = entry.badge.root
      setTimeout(() => root.unmount())
      vehicleMarkers.current.delete(id)
    }
  }, [vehiclesKey, ready])

  // Services for drivers: a round marker with an icon for its first kind; a fixed place that is
  // closed now is faded, a resting mobile helper a little. Tap for its card (one panel, below).
  // The icon is rendered by React into the marker; the name goes in as an attribute, never HTML.
  const services = servicesProp ?? NO_SERVICES
  const serviceMarkers = useRef(new Map<string, { marker: Marker; root: Root; kind: string }>())
  const openServiceRef = useRef<(id: string) => void>(() => {})
  const servicesKey = JSON.stringify(services)
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const list = JSON.parse(servicesKey) as PublicService[]
    const seen = new Set<string>()
    for (const sv of list) {
      seen.add(sv.id)
      let entry = serviceMarkers.current.get(sv.id)
      if (!entry) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'service-marker'
        const icon = document.createElement('span')
        icon.className = 'service-marker-icon'
        el.append(icon)
        el.onclick = (ev) => {
          ev.stopPropagation()
          openServiceRef.current(sv.id)
        }
        entry = { marker: new maplibregl.Marker({ element: el }).setLngLat(ll(sv.at)).addTo(m), root: createRoot(icon), kind: '' }
        serviceMarkers.current.set(sv.id, entry)
      }
      entry.marker.setLngLat(ll(sv.at))
      const el = entry.marker.getElement()
      el.setAttribute('aria-label', lang === 'dv' && sv.nameDv ? sv.nameDv : sv.name)
      el.style.opacity = !sv.openNow ? '0.45' : sv.mode === 'mobile' && sv.level !== 'active' ? '0.75' : '1'
      el.classList.toggle('mobile', sv.mode === 'mobile')
      // A mobile helper is drawn in 3D as a person in their work outfit (overalls, or a delivery
      // rider's jacket for parts and fuel); a fixed place stays a marker only.
      if (sv.mode === 'mobile') figures.current.set({ id: `s:${sv.id}`, cat: 'service', model: { kind: 'person', look: workLookFor(sv.kinds), colour: 0 }, colour: '', at: sv.at, heading: 180, length: 1.7, width: 0.45, moving: false, speed: 0, braking: false, signal: null, lean: 0, faded: sv.level !== 'active' })
      else figures.current.delete(`s:${sv.id}`)
      const kind = sv.kinds[0] ?? 'mechanic'
      if (entry.kind !== kind) {
        entry.kind = kind
        const Icon = SERVICE_ICONS[kind]
        entry.root.render(<Icon className="size-4" aria-hidden="true" />)
      }
    }
    for (const [id, entry] of serviceMarkers.current) {
      if (seen.has(id)) continue
      figures.current.delete(`s:${id}`)
      entry.marker.remove()
      const root = entry.root
      setTimeout(() => root.unmount())
      serviceMarkers.current.delete(id)
    }
  }, [servicesKey, ready, lang])
  // A route from the viewer to a service (Route on its card), drawn with the trip machinery below.
  const [svcTrip, setSvcTrip] = useState<{ from: [number, number]; to: [number, number]; name: string } | null>(null)
  // A shared place: its pin (hidden while a route is drawn: the route has its own end pin).
  const sharedName = useSharedSpot(map, ready, sharedSpot, { showPin: !svcTrip && !trip, lang, label: t.sharePlace, pinHtml: pinSvg('#059669') })

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
        const badge = makeBadge()
        setBadgeIcon(badge, 'bus', BusIcon)
        const price = document.createElement('span')
        price.className = 'vehicle-marker-price bus-route'
        el.append(shape, badge.el, price)
        const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'viewport', pitchAlignment: 'viewport' }).setLngLat(ll(b.at)).addTo(m)
        e = { marker, shape, badge, price, type: 'bus', glide: null, lastReport: null, atKey: '', shownHeading: 0, onRoad: false, lean: 0, tracker: newTracker(), s: null, speed: 0, coasted: 0, snap: null, axles: null, lane: 0, len: BUS_LENGTH_M, wb: WHEELBASE_M.bus, drawnPx: BUS_DRAWN_PX, fig: { shape: 'bus', rider: 'none', colour: '#475569', width: DEFAULT_DIMS.bus.width } }
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
          // On its own route: only forward along it (§6), the stretch between as the path; far ahead
          // (lost signal), it catches up along that same route line.
          const shownS = entry.glide ? project(line, glideAt(entry.glide, now)).s : proj.s
          const ahead = forward(line, shownS, proj.s)
          const at = pointAt(line, proj.s)
          const sn = snapToRoad(g, at)
          const standHeading = () => (sn ? alongRoad(g, sn, bearing(at, pointAt(line, Math.min(line.length, proj.s + 10)))) : entry.shownHeading)
          if (entry.glide && ahead < 0 && ahead > -60) {
            // Behind where it's shown (a slow bus after a little prediction): wait, never go back.
          } else {
            const dt = entry.lastReport === null ? 0 : (now - entry.lastReport) / 1000
            if (dt > 0) entry.speed = Math.max(0, Math.min(35 / 3.6, Math.abs(ahead) / dt))
            // Far behind (a new trip, or the line was matched wrongly): along the roads instead.
            const path = entry.glide && ahead >= 0 ? stretch(line, shownS, proj.s) : null
            entry.onRoad = true
            entry.snap = sn
            moveVehicle(m, entry, g, now, { target: at, snapped: sn, path, type: 'bus', standHeading })
            entry.s = proj.s
            entry.lastReport = now
          }
        } else if (verdict === 'move') {
          // Off its route line (a diversion, or no line yet): keep it on the nearest road.
          const snapped = snapToRoad(g, b.at)
          const target = snapped ? snapped.at : b.at
          entry.onRoad = !!snapped
          entry.snap = snapped
          moveVehicle(m, entry, g, now, { target, snapped, type: 'bus', standHeading: () => (snapped ? alongRoad(g, snapped, entry.shownHeading) : entry.shownHeading) })
          entry.s = null
          entry.lastReport = now
        }
      }
      entry.shape.style.color = b.route.colour
      entry.fig.colour = b.route.colour
      entry.badge.el.style.color = b.route.colour
      entry.badge.el.style.setProperty('--badge-ink', inkFor(b.route.colour))
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
      figures.current.delete(id)
      entry.marker.remove()
      const root = entry.badge.root
      setTimeout(() => root.unmount())
      vehicleMarkers.current.delete(id)
    }
  }, [busesKey, ready])

  // Category chips: hide the markers the chip leaves out by their element's display (never removed,
  // so they keep moving). The viewer's own ride (taxi or private vehicle) always stays. Runs after
  // the marker effects above on every render, and only touches an element when it changes.
  const rideTaxi = activeTrip?.taxiId
  const rideVehicle = privateRide?.vehicleId
  // Private vehicles linked as center taxis (taxis.vehicleId, public in publicTaxis): vehicle id ->
  // the taxi's center number.
  const linkedKey = taxis.map((x) => (x.vehicleId ? `${x.vehicleId}=${x.taxiNo}` : '')).filter(Boolean).join(',')
  const linkedTaxis = useMemo(() => new Map(linkedKey ? linkedKey.split(',').map((x) => x.split('=') as [string, string]) : []), [linkedKey])
  const shownKey = useRef('')
  useEffect(() => {
    const vis = (el: HTMLElement, on: boolean) => {
      const d = on ? '' : 'none'
      if (el.style.display !== d) el.style.display = d
    }
    for (const [id, e] of markers.current) vis(e.parts.root, chipShows(chip, 'taxi') || id === rideTaxi)
    for (const [id, e] of vehicleMarkers.current) {
      if (id.startsWith('b:')) {
        vis(e.marker.getElement(), chipShows(chip, 'bus'))
        continue
      }
      // A private vehicle linked as a center taxi is a taxi too: it shows under Taxi, in taxi
      // colours, and in its own colour under Private.
      e.taxiNo = linkedTaxis.get(id) ?? null
      paintVehicle(e, !!e.taxiNo && chip !== 'private')
      vis(e.marker.getElement(), chipShows(chip, 'private') || (!!e.taxiNo && chipShows(chip, 'taxi')) || id === rideVehicle)
    }
    // The viewer's own avatar shows under every chip, except while they're on the map as their
    // own vehicle (then the vehicle is them).
    for (const [id, e] of peopleMarkers.current) vis(e.marker.getElement(), id === ME ? !meHidden : chipShows(chip, 'person'))
    for (const e of serviceMarkers.current.values()) vis(e.marker.getElement(), chipShows(chip, 'service'))
    // The same for the 3D figures (the viewer's own ride always shows).
    const key = `${chip}|${rideTaxi}|${rideVehicle}|${meHidden}`
    if (shownKey.current !== key) {
      shownKey.current = key
      // (A linked vehicle's figure takes the taxi category outside the Private chip.)
      figures.current.shows = (f) => (f.id === `p:${ME}` ? !meHidden : chipShows(chip, f.cat) || f.id === `t:${rideTaxi}` || f.id === `v:${rideVehicle}`)
      figures.current.touch()
      figLayer.current?.kick()
    }
  })
  // A new chip: close a vehicle's menu, and stop following one the chip hides.
  useEffect(() => {
    popup.current?.remove()
    const f = following.current
    if (!f) return
    const kind: MarkerKind = f.startsWith('b:') ? 'bus' : f.startsWith('v:') && !linkedTaxis.has(f.slice(2)) ? 'private' : 'taxi'
    if (!chipShows(chip, kind) && f !== rideTaxi && f !== `v:${rideVehicle}`) followRefFn.current(null)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [chip])
  // Bus chip: how many buses are in view (for "No buses in this area"). Until the feed has had time
  // to answer (one sweep of the routes), an empty list isn't taken as none.
  const [busesHere, setBusesHere] = useState(0)
  const [busWaited, setBusWaited] = useState(false)
  useEffect(() => {
    if (chip !== 'bus') return
    setBusWaited(false)
    const timer = setTimeout(() => setBusWaited(true), 20_000)
    return () => clearTimeout(timer)
  }, [chip])
  useEffect(() => {
    const m = map.current
    if (!m || !ready || chip !== 'bus') return
    const list = JSON.parse(busesKey) as Bus[]
    const count = () => {
      const b = m.getBounds()
      setBusesHere(list.filter((x) => b.contains(ll(x.at))).length)
    }
    count()
    m.on('moveend', count)
    return () => {
      m.off('moveend', count)
    }
  }, [busesKey, chip, ready])
  const noBuses = chip === 'bus' && (!busArea || ((busWaited || buses.length > 0) && busesHere === 0))

  // Every frame: move each private vehicle and bus (and each person sharing) along its glide, turn it
  // like a real vehicle (relative to the map's rotation), and keep a followed vehicle in the middle.
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
        // Real-car turning (src/core/kinematics.ts): the glide moves the FRONT axle along the road
        // (in the left lane of two-way roads, the middle of one-way roads); the rear axle trails a
        // wheelbase behind and the vehicle is drawn between them, facing rear -> front. Stopped, it
        // stays exactly as it is (never turning on the spot); placed afresh, it stands along its road.
        const st = glideState(e.glide, now)
        const moving = e.glide.path.length >= 2 && now < e.glide.start + e.glide.dur
        const kind = e.type.split(':')[0]
        const wb = e.wb
        const g = graphRef.current
        if (moving || !e.axles) {
          const twoWay = moving ? twoWayBetween(g, st.a, st.b) : e.snap ? isTwoWay(g, e.snap.i, e.snap.j) : true
          const want = e.onRoad && twoWay ? LANE_OFFSET_M : 0
          // Change lanes gently (a two-way road into a one-way one), not with a sideways hop.
          e.lane = e.axles ? e.lane + (want - e.lane) * Math.min(1, dt / 700) : want
          // The lane is measured from the body's own (smooth) heading, so the front doesn't hop
          // sideways at each little bend of a rounded corner.
          const front = e.lane > 0.01 ? toTheLeft(st.at[0], st.at[1], e.axles ? axleHeading(e.axles) : st.heading, e.lane) : st.at
          e.axles = e.axles ? followFront(e.axles, front, wb) : placeAxles(front, e.glide.heading, wb)
        }
        const at = axleCentre(e.axles)
        e.marker.setLngLat(ll(at))
        liftOnDeck(m, e.marker, at)
        const before = e.shownHeading
        e.shownHeading = axleHeading(e.axles)
        const speed = moving ? glideSpeed(e.glide, now) : 0
        // Indicators a moment before a turn; bikes lean into it (a slight sideways squeeze).
        const ahead = moving ? turnAhead(e.glide, now) : { angle: 0, dist: Infinity }
        const signal = indicator(ahead.angle, ahead.dist, speed) ?? null
        setSignal(e.shape, signal)
        // Brake lights while slowing down or standing still.
        const braking = glideBraking(e.glide, now)
        e.shape.classList.toggle('braking', braking)
        let squeeze = ''
        if (kind === 'motorbike' || kind === 'ebike' || kind === 'bicycle') {
          const rate = dt > 0 ? (((e.shownHeading - before + 540) % 360) - 180) / (dt / 1000) : 0
          e.lean += (leanDegrees(rate, speed) - e.lean) * Math.min(1, dt / 200)
          squeeze = ` scaleX(${(1 - Math.abs(e.lean) / 90).toFixed(3)})`
        }
        drawVehicle(e.marker.getElement(), e.shape, e.badge, realPx(m, e.len), e.drawnPx, e.shownHeading - bearingNow, squeeze)
        const bus = id.startsWith('b:')
        figures.current.set({
          id: bus ? id : `v:${id}`,
          cat: bus ? 'bus' : e.fig.taxi ? 'taxi' : 'private',
          model: { kind: 'vehicle', shape: e.fig.shape, rider: e.fig.rider, taxi: e.fig.taxi },
          colour: e.fig.colour,
          at,
          heading: e.shownHeading,
          length: e.len,
          width: e.fig.width,
          moving,
          speed,
          braking,
          signal,
          lean: e.lean,
          faded: e.marker.getElement().style.opacity !== '' && e.marker.getElement().style.opacity !== '1',
        })
        if (following.current === (bus ? id : `v:${id}`)) m.setCenter(ll(at))
      }
      // People: along their glide; the arrow shows the way while they're moving.
      for (const [id, e] of peopleMarkers.current) {
        if (!e.glide) continue
        const at = glideAt(e.glide, now)
        e.marker.setLngLat(ll(at))
        liftOnDeck(m, e.marker, at)
        const moving = e.glide.path.length >= 2 && now < e.glide.start + e.glide.dur
        const el = e.marker.getElement()
        if (el.classList.contains('moving') !== moving) el.classList.toggle('moving', moving)
        const heading = moving ? glideState(e.glide, now).heading : e.glide.heading
        if (moving || id === ME) e.dir.style.transform = `rotate(${heading - bearingNow}deg)`
        if (moving && id === ME && !el.classList.contains('has-dir')) el.classList.add('has-dir')
        const fig = personFigure(`p:${id}`, e.mode, e.look, e.lookColour, at, heading, moving, moving ? glideSpeed(e.glide, now) : 0, e.faded)
        if (fig) figures.current.set(fig)
        else figures.current.delete(`p:${id}`)
      }
      figLayer.current?.kick()
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
  const shownTrip = trip ? { from: trip.from, to: trip.to, name: '' } : svcTrip
  const tripKey = shownTrip ? JSON.stringify(shownTrip) : ''
  const planned = useMemo(() => {
    if (!tripKey) return null
    const { from, to, name } = JSON.parse(tripKey) as { from: [number, number]; to: [number, number]; name: string }
    // Both ends need a road within 300 m (else another island: a dashed straight line). If one-way
    // streets leave no way for a vehicle, still show the way along the roads, never over buildings.
    const near = (p: [number, number]) => !!snapToRoad(graph, p, 300)
    const r = near(from) && near(to) ? (findRoute(graph, from, to, mode) ?? (mode === 'taxi' ? findRoute(graph, from, to, 'walk') : null)) : null
    const straight = metresBetween(from, to)
    return {
      from,
      to,
      name,
      path: r?.path ?? [from, to],
      info: { metres: r?.metres ?? straight, seconds: r?.seconds ?? straight / (mode === 'walk' ? 1.25 : 5.6), onRoad: !!r },
    }
  }, [tripKey, mode, graph])
  const tripInfo = planned?.info ?? null
  // Report the road distance by taxi (the price is worked out from it), on the roads only.
  // Only the hire or call trip has a price; a route to a service doesn't.
  const hirePlanned = trip ? planned : null
  const taxiMetres = hirePlanned && mode === 'taxi' && hirePlanned.info.onRoad ? Math.round(hirePlanned.info.metres) : hirePlanned ? undefined : null
  useEffect(() => {
    if (taxiMetres !== undefined) onTripMetres?.(taxiMetres)
  }, [taxiMetres, onTripMetres])

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
    const { from, to, path, name } = planned
    src.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.map(ll) } })
    m.setPaintProperty('trip-line', 'line-dasharray', mode === 'walk' || !planned.info.onRoad ? [0.6, 1.6] : [1, 0])
    m.setPaintProperty('trip-line', 'line-color', mode === 'walk' ? '#0f766e' : '#2563eb')
    // A route to a service: from you to the service (its name, as text).
    for (const [at, colour, label] of [
      [from, '#059669', name ? t.youAreHere : t.pickupPin],
      [to, name ? '#d97706' : '#e11d48', name || t.destination],
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
  }, [planned, mode, ready, t.pickupPin, t.destination, t.youAreHere])

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
  const [openPanel, setOpenPanel] = useState<'key' | 'share' | 'help' | 'service' | 'center' | null>(null)
  const [svcId, setSvcId] = useState<string | null>(null)
  const [helpKind, setHelpKind] = useState<ServiceKind | null>(null)
  const svc = svcId ? services.find((x) => x.id === svcId) : undefined
  const [ctrId, setCtrId] = useState<string | null>(null)
  const ctr = ctrId ? centers?.find((x) => x.id === ctrId) : undefined
  const shown = (openPanel === 'service' && !svc) || (openPanel === 'center' && !ctr) ? null : openPanel // it went off the map
  const active: 'key' | 'share' | 'help' | 'service' | 'center' | 'hire' | null = pinMode ? null : panel && panelOpen ? 'hire' : shown
  // Open a service's card (from its marker or Help near me), folding the hire form away.
  const openService = (id: string) => {
    setSvcId(id)
    setOpenPanel('service')
    if (panel && panelOpen) onPanelOpenChange?.(false)
  }
  useEffect(() => {
    openServiceRef.current = openService
  })
  useCenterMarkers(map, ready, centers, chipShows(chip, 'center'), lang, (id) => {
    setCtrId(id)
    setOpenPanel('center')
    if (panel && panelOpen) onPanelOpenChange?.(false)
  })
  const svcName = (x: Pick<PublicService, 'name' | 'nameDv'>) => (lang === 'dv' && x.nameDv ? x.nameDv : x.name)
  const distance = (metres: number) => (metres < 1000 ? t.svcMetres(String(Math.round(metres))) : t.svcKm((metres / 1000).toFixed(1)))
  const help = mySpot && active === 'help' ? nearestHelp(services, mySpot, helpKind, 5, graph) : [] // top 5 by road where on the roads
  const routeTo = (x: Pick<PublicService, 'at' | 'name' | 'nameDv'>) => {
    if (!mySpot) return
    setMode('taxi')
    setSvcTrip({ from: mySpot, to: x.at, name: svcName(x) })
    setOpenPanel(null) // the card would cover the route; the route card has its own close
  }
  const toggle = (which: 'key' | 'share' | 'help' | 'hire') => {
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
  // A chip: Services opens Help near me as its panel (folding the hire form away).
  const chooseChip = (id: MapChipId) => {
    setChipState(id)
    saveChip(id)
    if (id === 'services') {
      setOpenPanel('help')
      if (panel && panelOpen) onPanelOpenChange?.(false)
    } else if (openPanel === 'help') setOpenPanel(null)
  }

  // Full map: every menu slides away; only the map, its markers and MapLibre's own controls stay.
  const hidden = fullscreen && mapOnly && !pinMode
  useEffect(() => {
    if (!hidden) return
    // Fold whatever is open (the hire form keeps its details) and close a vehicle's menu.
    setOpenPanel(null)
    if (panelOpen) onPanelOpenChange?.(false)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden])
  const enterFull = () => onMapOnly?.(true)
  // Swipe the column toward the left edge, or a bottom card down, to slide the menus away.
  const swipeColumn = useSwipe((dir) => dir === 'left' && enterFull())
  const swipeCard = useSwipe((dir) => dir === 'down' && enterFull())
  // Bring the menus back: a swipe in from the left edge or up from the bottom edge (starting within
  // 20 px of it), or a long press (600 ms, moving under 10 px) on an empty part of the map.
  const exitRef = useRef(onMapOnly)
  useEffect(() => {
    exitRef.current = onMapOnly
  })
  useEffect(() => {
    if (!hidden) return
    const exit = () => exitRef.current?.(false)
    let edge: { x: number; y: number; from: 'left' | 'bottom' } | null = null
    const touchStart = (e: TouchEvent) => {
      const p = e.touches[0]
      edge = null
      if (e.touches.length !== 1 || !p) return
      if (p.clientX <= 20) edge = { x: p.clientX, y: p.clientY, from: 'left' }
      else if (p.clientY >= window.innerHeight - 20) edge = { x: p.clientX, y: p.clientY, from: 'bottom' }
    }
    const touchEnd = (e: TouchEvent) => {
      const p = e.changedTouches[0]
      const s = edge
      edge = null
      if (!s || !p) return
      const dx = p.clientX - s.x
      const dy = p.clientY - s.y
      if ((s.from === 'left' && dx > 60 && dx > Math.abs(dy)) || (s.from === 'bottom' && -dy > 60 && -dy > Math.abs(dx))) exit()
    }
    // Long press on the map itself (its canvas), not on a marker or a control.
    const canvas = map.current?.getCanvas()
    let press: { id: number; x: number; y: number; timer: number } | null = null
    let pointers = 0
    const cancel = () => {
      if (press) clearTimeout(press.timer)
      press = null
    }
    const down = (e: PointerEvent) => {
      pointers++
      cancel()
      if (pointers !== 1 || e.target !== canvas) return
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: window.setTimeout(() => {
        press = null
        exit()
      }, 600) }
    }
    const move = (e: PointerEvent) => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancel()
    }
    const up = () => {
      pointers = Math.max(0, pointers - 1)
      cancel()
    }
    window.addEventListener('touchstart', touchStart, { passive: true })
    window.addEventListener('touchend', touchEnd, { passive: true })
    canvas?.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      cancel()
      window.removeEventListener('touchstart', touchStart)
      window.removeEventListener('touchend', touchEnd)
      canvas?.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [hidden])
  // What slides away in full map: transform only (the map never resizes), no motion if asked.
  const slide = 'transition-transform duration-200 ease-out motion-reduce:transition-none'
  const followText = followId ? (followId.startsWith('v:') ? t.followingVehicle(t.vehTypes[vehicles.find((x) => `v:${x.id}` === followId)?.type ?? 'car']) : followId.startsWith('b:') ? t.followingVehicle('bus') : t.followingTaxi(taxis.find((x) => x.id === followId)?.taxiNo ?? '')) : ''

  // The bottom status cards (ride, booked vehicle, trip): on the right in a phone's landscape.
  const cardClass = `absolute z-[5] flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-xl backdrop-blur-[3px] left-2 right-12 bottom-8 sm:right-auto sm:w-96 ${fullscreen ? `land:left-auto! land:right-14! land:w-64! ${slide}` : ''} ${hidden ? 'translate-y-[calc(100%+3rem)]' : ''}`
  // In full map, a ride in progress or a followed vehicle still shows, as a slim pill.
  const pillText = ride && activeTrip ? `${ride.phase === 'coming' ? t.rideComing : ride.phase === 'riding' ? t.rideRiding : t.rideArrived}${ride.phase !== 'arrived' ? ` · ${ride.minutes} ${t.minutes}` : ''}` : privateCard ? privateCard.text : followText

  // The 2D / 3D switch (the tool row on the full-screen map; the key row otherwise).
  const viewSwitch = (
    <button
      type="button"
      onClick={() => setView3d(!view3d)}
      aria-pressed={view3d}
      aria-label={t.figView}
      title={t.figView}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-bold shadow backdrop-blur-[3px] ${view3d ? 'border-sky-700 bg-sky-700 text-white' : 'border-white/60 bg-white/70 text-slate-800'}`}
    >
      {view3d ? <BoxIcon className="size-4" aria-hidden="true" /> : <Square className="size-4" aria-hidden="true" />}
      <span>{view3d ? t.fig3d : t.fig2d}</span>
    </button>
  )

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
        <label className="flex min-h-8 cursor-pointer items-center gap-1.5 font-medium">
          <input type="checkbox" checked={ownMap} onChange={(e) => setOwnMap(e.target.checked)} className="size-4 accent-emerald-600" />
          {t.ownMap}
        </label>
        {!fullscreen && viewSwitch}
      </div>
  )

  return (
    <section className={`${fullscreen ? 'map-full relative h-full w-full' : 'space-y-2 sm:space-y-3'} ${night ? 'map-night' : ''}`}>
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

        {/* Full screen: one column at the top-left (always the physical left, in Dhivehi too, because
            the map's own buttons are always on the right), under the search: a row of small buttons (Map key,
            Show me, Hire) and status chips, then at most ONE open panel, each with its own close.
            It never covers the map controls on the right or the status card at the bottom. */}
        {fullscreen && !pinMode && (
          <div
            className={`pointer-events-none absolute left-2 right-14 top-[calc(var(--map-top,0px)+4rem)] bottom-28 z-[6] flex flex-col gap-2 sm:right-auto sm:w-96 land:right-auto! land:bottom-2! land:w-72! ${slide} ${hidden ? '-translate-x-[calc(100%+1rem)]' : ''}`}
            inert={hidden}
            {...swipeColumn}
          >
            {/* Category chips: one at a time (All, Taxi, Bus, Private, Services). */}
            <MapChips chips={chipIds} active={chip} onChoose={chooseChip} />
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
              <ToolButton active={active === 'key'} onClick={() => toggle('key')} label={t.mapKey}>
                <Info className="size-4" aria-hidden="true" />
              </ToolButton>
              {viewSwitch}
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
              {servicesProp && (
                <ToolButton active={active === 'help'} onClick={() => toggle('help')} label={t.svcHelpNear}>
                  <LifeBuoy className="size-4 text-amber-600" aria-hidden="true" />
                </ToolButton>
              )}
              {onMapOnly && (
                <button
                  type="button"
                  onClick={enterFull}
                  aria-label={t.fullmapEnter}
                  title={t.fullmapEnter}
                  className="grid min-h-10 min-w-10 place-items-center rounded-full border border-white/60 bg-white/70 text-slate-800 shadow backdrop-blur-[3px]"
                >
                  <Maximize2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            {/* Status chips: one short line each. */}
            {followId && (
              <Chip>
                <LocateFixed className="size-4 shrink-0 text-sky-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {followText}
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
            {noBuses && (
              <Chip>
                <BusIcon className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{t.chipNoBuses}</span>
              </Chip>
            )}
            {locationOff && (
              <Chip>
                <span className="min-w-0 flex-1 text-xs font-semibold text-amber-800">{t.locationOff}</span>
              </Chip>
            )}
            {sharedSpot && (
              <Chip>
                <MapPin className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <button type="button" onClick={() => map.current?.flyTo({ center: ll(sharedSpot.at), zoom: 18, duration: 600 })} className="min-w-0 flex-1 truncate text-start font-semibold">
                  {sharedName ? t.shareAt(sharedName) : t.sharePlace}
                </button>
                <button
                  type="button"
                  disabled={!mySpot}
                  title={mySpot ? undefined : t.shareLocating}
                  onClick={() => mySpot && routeTo({ at: sharedSpot.at, name: sharedName || t.sharePlace, nameDv: sharedName || t.sharePlace })}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-40"
                >
                  <RouteIcon className="size-3.5" aria-hidden="true" />
                  {t.shareRoute}
                </button>
                {onSharedClose && (
                  <button type="button" onClick={onSharedClose} aria-label={t.close} title={t.close} className="grid min-h-8 min-w-8 shrink-0 place-items-center text-slate-500 hover:text-slate-900">
                    <X className="size-4" aria-hidden="true" />
                  </button>
                )}
              </Chip>
            )}
            {/* The one open panel. */}
            {active && (
              <div className="map-glass pointer-events-auto flex min-h-0 flex-col rounded-2xl border border-white/60 bg-white/70 shadow-xl backdrop-blur-[3px] backdrop-saturate-150">
                <div className="flex shrink-0 items-center gap-2 ps-4">
                  <p className="min-w-0 flex-1 truncate py-2.5 font-bold">{active === 'key' ? t.mapKey : active === 'share' ? t.shareMe : active === 'help' ? t.svcHelpNear : active === 'service' && svc ? svcName(svc) : active === 'center' && ctr ? svcName(ctr) : panelTitle}</p>
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
                  {active === 'help' && (
                    <div className="space-y-2">
                      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label={t.svcKindsLabel} data-noswipe="">
                        {[null, ...SERVICE_KINDS].map((k) => {
                          const Icon = k ? SERVICE_ICONS[k] : LifeBuoy
                          return (
                            <button key={k ?? 'all'} type="button" aria-pressed={helpKind === k} onClick={() => setHelpKind(k)} className={`inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold ${helpKind === k ? 'bg-slate-900 text-white' : 'bg-white/80 text-slate-700'}`}>
                              <Icon className="size-4" aria-hidden="true" /> {k ? t.svcKinds[k] : t.svcAllKinds}
                            </button>
                          )
                        })}
                      </div>
                      {!mySpot ? (
                        <p className="text-sm text-slate-600">{t.svcNeedSpot}</p>
                      ) : help.length === 0 ? (
                        <p className="text-sm text-slate-600">{t.svcNoneNear}</p>
                      ) : (
                        <ul className="space-y-1">
                          {help.map((x) => {
                            const Icon = SERVICE_ICONS[x.kinds[0] ?? 'mechanic']
                            return (
                              <li key={x.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    map.current?.flyTo({ center: ll(x.at), zoom: Math.max(16, map.current.getZoom()), duration: 600 })
                                    openService(x.id)
                                  }}
                                  className="flex min-h-11 w-full items-center gap-2 rounded-lg bg-white/70 px-2 text-start"
                                >
                                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-600 text-white">
                                    <Icon className="size-4" aria-hidden="true" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold">{svcName(x)}</span>
                                    <span className="block truncate text-xs text-slate-600">{x.kinds.map((k) => t.svcKinds[k]).join(', ')}</span>
                                  </span>
                                  <span className="shrink-0 text-sm text-slate-600 tabular-nums">{distance(x.metres)}</span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                  {active === 'service' && svc && (
                    <ServiceCard
                      s={svc}
                      metres={mySpot ? metresBetween(mySpot, svc.at) : null}
                      distance={distance}
                      onRoute={mySpot ? () => routeTo(svc) : undefined}
                    />
                  )}
                  {active === 'center' && ctr && (
                    <CenterCard c={ctr} metres={mySpot ? metresBetween(mySpot, ctr.at) : null} distance={distance} onRoute={mySpot ? () => routeTo(ctr) : undefined} onHire={onHireCenter ? () => {
                      setOpenPanel(null)
                      onHireCenter(ctr.id)
                    } : undefined} />
                  )}
                  {active === 'hire' && panel}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Full map: a small handle brings the menus back (bottom-left, clear of the map's own
            buttons on the right); a ride or a followed vehicle stays as a slim pill. */}
        {hidden && (
          <>
            <button
              type="button"
              onClick={() => onMapOnly?.(false)}
              aria-label={t.fullmapExit}
              title={`${t.fullmapExit}. ${t.fullmapHint}`}
              className="absolute bottom-3 left-2 z-[6] grid size-11 place-items-center rounded-full border border-white/60 bg-white/60 text-slate-800 shadow-lg backdrop-blur-[3px]"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            {pillText && (
              <button
                type="button"
                onClick={() => onMapOnly?.(false)}
                className="absolute left-2 top-2 z-[6] flex max-w-[calc(100%-4.5rem)] items-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-bold shadow backdrop-blur-[3px]"
              >
                {ride && activeTrip ? <CarTaxiFront className="size-4 shrink-0 text-emerald-700" aria-hidden="true" /> : <LocateFixed className="size-4 shrink-0 text-sky-600" aria-hidden="true" />}
                <span className="truncate">{pillText}</span>
              </button>
            )}
          </>
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
            className={cardClass}
            inert={hidden}
            {...swipeCard}
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
            className={cardClass}
            inert={hidden}
            {...swipeCard}
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
            className={cardClass}
            inert={hidden}
            {...swipeCard}
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
            {!trip && svcTrip && (
              <button type="button" onClick={() => setSvcTrip(null)} aria-label={t.close} title={t.close} className="order-last grid min-h-10 min-w-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:text-slate-900">
                <X className="size-5" aria-hidden="true" />
              </button>
            )}
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
        <div
          className={`absolute left-2 right-14 z-[7] sm:right-auto ${fullscreen ? `top-[calc(var(--map-top,0px)+0.5rem)] sm:w-96 land:right-auto! land:w-72! ${slide} ${hidden ? '-translate-x-[calc(100%+1rem)]' : ''}` : 'top-2 sm:w-80'}`}
          inert={hidden}
          {...(fullscreen ? swipeColumn : {})}
        >
          <div className="flex items-center rounded-xl border border-slate-300 bg-white shadow-lg">
            <input
              type="search"
              value={query}
              onFocus={() => void loadPlacesForSearch(followRef.current ? getArea().center : undefined).then(setPlaces)}
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
