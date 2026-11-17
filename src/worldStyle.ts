// TaxiQ's own map: islands, sea and reef, roads, buildings rising in 3D and places people go,
// drawn by MapLibre from our own data bundle (src/data/world-<area>.json, built by
// scripts/build-world.py) instead of OpenStreetMap's raster tiles. GeoJSON sources only: no tile
// server, no glyphs (labels stay DOM markers in MapView). Original colours, a day and a night look.
//
// Data: (c) OpenStreetMap contributors (ODbL); Malé City Council lots and HDC Hulhumalé buildings and
// lots; the Kulhudhuffushi City Council plot chart. All used with permission.

import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'
import type { ExpressionSpecification, GeoJSONSourceSpecification, LayerSpecification, Map as MlMap } from 'maplibre-gl'
import { HOUSES3D_MIN_ZOOM } from './core/houseTiles'

// The packed shape of a bundle: whole millionths of a degree from `o`, each shape delta-encoded.
type Shape = number[]
export interface WorldBundle {
  v: 1
  o: [number, number] // [west, south]
  box: [number, number, number, number] // s, w, n, e
  land: Shape[]
  reef: Shape[]
  water: Shape[]
  sand: Shape[]
  paved: Shape[]
  green: [GreenKind, Shape][]
  roads: [RoadClass, Shape][]
  // Buildings. Kinds h0..h9 are our own houses (src/data/houses-<area>.json, scripts/build-house-tiles.py)
  // as simple blocks in their wall colour (`hp`): drawn below zoom 17 and in 2D; from zoom 17 in 3D
  // the 3D houses (src/houses3d/) take over.
  b: [BuildingKind | HomeKind, number, number, Shape][]
  hp?: string[]
  trees: Shape
  res: [ResourceKind, number, number, string, string][]
  bridge?: BridgeData[]
}
// A raised bridge (scripts/build-world.py, "bridges"): the deck's centre line with a point every
// ~10 m, its top and girder depth at each point (decimetres above the sea), piers and lamp posts.
export interface BridgeData {
  en: string
  dv: string
  w: number // deck width, m
  line: Shape
  h: number[]
  d: number[]
  piers: ['pier' | 'cap', number, number, Shape][]
  lamps: Shape
}
type GreenKind = 'park' | 'wood' | 'grass' | 'pitch'
type RoadClass = 'main' | 'street' | 'path' | 'runway' | 'taxiway' | 'pier'
type HomeKind = `h${number}`
const HOME_KINDS = Array.from({ length: 10 }, (_, i) => `h${i}`)
const isHome: ExpressionSpecification = ['in', ['get', 'k'], ['literal', HOME_KINDS]]
type BuildingKind = 'house' | 'flats' | 'shop' | 'mosque' | 'dome' | 'school' | 'health' | 'gov' | 'industry' | 'hotel' | 'airport' | 'other'
export const RESOURCE_KINDS = ['mosque', 'school', 'hospital', 'clinic', 'harbour', 'jetty', 'shop', 'fuel', 'gov', 'park', 'pitch', 'beach'] as const
export type ResourceKind = (typeof RESOURCE_KINDS)[number]

export interface Resource {
  kind: ResourceKind
  at: [number, number] // lat, lng
  en: string
  dv: string
}

// Areas drawn with TaxiQ's own map. Keep each box in step with AREAS in scripts/build-world.py.
// Phase 1: Greater Malé; phase 2: Kulhudhuffushi (also the TaxiQ World game's island). The other
// islands come later (plans/own-map.md).
interface WorldArea {
  id: string
  box: [number, number, number, number] // s, w, n, e
  credit: string // whose shapes the area uses besides OpenStreetMap (map attribution)
  load: () => Promise<WorldBundle>
}
const WORLD_AREAS: WorldArea[] = [
  {
    id: 'male',
    box: [4.158, 73.478, 4.252, 73.556],
    credit: 'buildings: Malé City Council, <a href="https://gis.hdc.mv/">HDC</a>',
    load: () => import('./data/world-male.json').then((m) => m.default as unknown as WorldBundle),
  },
  {
    id: 'kulhudhuffushi',
    box: [6.6, 73.05, 6.645, 73.085],
    credit: 'houses: <a href="https://kulhudhuffushicity.gov.mv/map">Kulhudhuffushi City Council</a> plot chart',
    load: () => import('./data/world-kulhudhuffushi.json').then((m) => m.default as unknown as WorldBundle),
  },
]
// Below this zoom the view reaches past the area's edge, so today's map shows instead.
export const WORLD_MIN_ZOOM = 13

// The area the map is looking at, if it has our own map (by the middle of the view).
export function worldAreaAt(at: readonly [number, number], zoom: number): string | null {
  if (zoom < WORLD_MIN_ZOOM) return null
  return WORLD_AREAS.find((a) => at[0] >= a.box[0] && at[0] <= a.box[2] && at[1] >= a.box[1] && at[1] <= a.box[3])?.id ?? null
}

const cache = new Map<string, Promise<WorldBundle>>()
export function loadWorld(id: string): Promise<WorldBundle> {
  let p = cache.get(id)
  if (!p) {
    const a = WORLD_AREAS.find((x) => x.id === id)
    if (!a) return Promise.reject(new Error(`no world area ${id}`))
    cache.set(id, (p = a.load()))
  }
  return p
}

// The credit on an area's world source: OpenStreetMap (ODbL) and whoever's shapes the area uses.
export function worldAttribution(area: string): string {
  const credit = WORLD_AREAS.find((a) => a.id === area)?.credit
  return `TaxiQ map: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL)${credit ? `; ${credit}` : ''}`
}

// ---- decoding ----

function decode(o: [number, number], s: Shape): [number, number][] {
  const pts: [number, number][] = []
  let x = 0
  let y = 0
  for (let i = 0; i + 1 < s.length; i += 2) {
    x += s[i]!
    y += s[i + 1]!
    pts.push([Math.round((o[0] + x / 1e6) * 1e6) / 1e6, Math.round((o[1] + y / 1e6) * 1e6) / 1e6])
  }
  return pts
}

const ring = (pts: [number, number][]) => {
  const r = pts.slice()
  const a = r[0]!
  const b = r[r.length - 1]!
  if (a[0] !== b[0] || a[1] !== b[1]) r.push(a)
  return r
}

type Props = Record<string, string | number>
const poly = (o: [number, number], s: Shape, p: Props = {}): Feature<Polygon, Props> => ({ type: 'Feature', properties: p, geometry: { type: 'Polygon', coordinates: [ring(decode(o, s))] } })
const line = (o: [number, number], s: Shape, p: Props = {}): Feature<LineString, Props> => ({ type: 'Feature', properties: p, geometry: { type: 'LineString', coordinates: decode(o, s) } })
const fc = <G extends Polygon | LineString | Point>(features: Feature<G, Props>[]): FeatureCollection<G, Props> => ({ type: 'FeatureCollection', features })

// A tree canopy: a small octagon (about 2 to 3 m across), extruded so it stands up when tilted.
function canopy(at: [number, number], i: number): Feature<Polygon, Props> {
  const r = 1.1 + ((i * 7919) % 10) / 10 // metres
  const k = 1 / (111_320 * Math.cos((at[1] * Math.PI) / 180))
  const pts: [number, number][] = []
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * Math.PI * 2
    pts.push([at[0] + Math.cos(a) * r * k, at[1] + (Math.sin(a) * r) / 111_320])
  }
  return { type: 'Feature', properties: { h: 4.5 + ((i * 104_729) % 30) / 10 }, geometry: { type: 'Polygon', coordinates: [ring(pts)] } }
}

// ---- bridges ----

// Parts of a bridge, each its own colour. The deck's cross-section (metres from the centre line):
// a median barrier, a carriageway each side (car and motorcycle lanes), footpaths and railings.
type BridgePart = 'girder' | 'slab' | 'road' | 'median' | 'walk' | 'rail' | 'pier' | 'cap' | 'post' | 'lamp' | 'glow'
const ROAD_HALF = 7.9
const GIRDER_HALF = 7

interface Deck {
  pts: [number, number][] // lng, lat
  xy: [number, number][] // metres east, north of the first point
  h: number[] // top, m
  half: number
  kx: number
  box: [number, number, number, number] // w, s, e, n (padded by the half width), a cheap first check
}
function deckOf(o: [number, number], b: BridgeData): Deck {
  const pts = decode(o, b.line)
  const kx = 111_320 * Math.cos((pts[0]![1] * Math.PI) / 180)
  const xy = pts.map(([x, y]) => [(x - pts[0]![0]) * kx, (y - pts[0]![1]) * 111_320] as [number, number])
  const half = b.w / 2
  const padX = (half + 2) / kx
  const padY = (half + 2) / 111_320
  const lngs = pts.map((p) => p[0])
  const lats = pts.map((p) => p[1])
  const box: Deck['box'] = [Math.min(...lngs) - padX, Math.min(...lats) - padY, Math.max(...lngs) + padX, Math.max(...lats) + padY]
  return { pts, xy, h: b.h.map((v) => v / 10), half, kx, box }
}

// The deck's top at a point (m above the sea), and how far it is from the centre line, or null when
// the point isn't on the deck.
function onDeck(d: Deck, lng: number, lat: number): { h: number; across: number; toward: [number, number] } | null {
  const px = (lng - d.pts[0]![0]) * d.kx
  const py = (lat - d.pts[0]![1]) * 111_320
  let best: { h: number; across: number; toward: [number, number] } | null = null
  let bestD = Infinity
  for (let i = 0; i + 1 < d.xy.length; i++) {
    const [ax, ay] = d.xy[i]!
    const [bx, by] = d.xy[i + 1]!
    const dx = bx - ax
    const dy = by - ay
    const L = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    const cx = ax + t * dx
    const cy = ay + t * dy
    const dist = Math.hypot(px - cx, py - cy)
    if (dist < bestD) {
      bestD = dist
      best = { h: d.h[i]! + (d.h[i + 1]! - d.h[i]!) * t, across: dist, toward: [cx - px, cy - py] }
    }
  }
  return best && best.across <= d.half + 1 ? best : null
}

const decks = new Map<string, Deck[]>() // by area

// How high a bridge deck is at a point (m above the sea), or 0 off every bridge. For figures and
// vehicles drawn in 3D, so they ride on the deck instead of the sea. Knows the bridges of every area
// added to the map so far (addWorld).
export function bridgeHeightAt(lat: number, lng: number): number {
  for (const list of decks.values())
    for (const d of list) {
      if (lng < d.box[0] || lng > d.box[2] || lat < d.box[1] || lat > d.box[3]) continue
      const hit = onDeck(d, lng, lat)
      if (hit) return hit.h
    }
  return 0
}

// The bridge as extruded shapes: each with its part `k`, its base and its top (m).
function bridgeFeatures(o: [number, number], b: BridgeData, deck: Deck): Feature<Polygon, Props>[] {
  const out: Feature<Polygon, Props>[] = []
  const { pts } = deck
  // Four pieces per ~10 m step, so the deck's small height steps along a grade don't show.
  const SUB = 4
  const xy: [number, number][] = []
  const h: number[] = []
  const depth: number[] = []
  for (let i = 0; i < deck.xy.length; i++) {
    for (let j = 0; j < (i + 1 < deck.xy.length ? SUB : 1); j++) {
      const f = j / SUB
      const a = deck.xy[i]!
      const c = deck.xy[i + 1] ?? a
      xy.push([a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f])
      h.push(deck.h[i]! + ((deck.h[i + 1] ?? deck.h[i]!) - deck.h[i]!) * f)
      depth.push((b.d[i]! + ((b.d[i + 1] ?? b.d[i]!) - b.d[i]!) * f) / 10)
    }
  }
  const toLL = (x: number, y: number): [number, number] => [pts[0]![0] + x / deck.kx, pts[0]![1] + y / 111_320]
  // A unit normal (to the left) at each point, averaged over the segments either side.
  const normals = xy.map((_, i) => {
    const a = xy[Math.max(0, i - 1)]!
    const c = xy[Math.min(xy.length - 1, i + 1)]!
    const dx = c[0] - a[0]
    const dy = c[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    return [-dy / L, dx / L] as [number, number]
  })
  const add = (k: BridgePart, base: number, top: number, ring: [number, number][]) => {
    ring.push(ring[0]!)
    out.push({ type: 'Feature', properties: { k, h: Math.round(top * 100) / 100, base: Math.round(Math.max(0, base) * 100) / 100 }, geometry: { type: 'Polygon', coordinates: [ring] } })
  }
  const strip = (i: number, a: number, c: number) => {
    const p = xy[i]!
    const q = xy[i + 1]!
    const n = normals[i]!
    const m = normals[i + 1]!
    return [toLL(p[0] + n[0] * a, p[1] + n[1] * a), toLL(q[0] + m[0] * a, q[1] + m[1] * a), toLL(q[0] + m[0] * c, q[1] + m[1] * c), toLL(p[0] + n[0] * c, p[1] + n[1] * c)]
  }
  const half = deck.half
  for (let i = 0; i + 1 < xy.length; i++) {
    const top = (h[i]! + h[i + 1]!) / 2
    const d = (depth[i]! + depth[i + 1]!) / 2
    if (top - d > 0.2) add('girder', top - d, top - 0.55, strip(i, -GIRDER_HALF, GIRDER_HALF))
    add('slab', top - 0.6, top - 0.05, strip(i, -half, half))
    add('road', top - 0.06, top, strip(i, -ROAD_HALF, ROAD_HALF))
    add('median', top, top + 0.9, strip(i, -0.35, 0.35))
    for (const s of [1, -1]) {
      add('walk', top - 0.06, top + 0.2, strip(i, s * ROAD_HALF, s * (half - 0.3)))
      add('rail', top + 0.2, top + 1.3, strip(i, s * (half - 0.3), s * half))
    }
  }
  for (const [k, base, top, sh] of b.piers) add(k, base / 10, top / 10, decode(o, sh))
  // Lamp posts: a slim post, a head leaning over the road, and a pool of light on the road.
  const square = (lng: number, lat: number, size: number): [number, number][] => {
    const dx = size / 2 / deck.kx
    const dy = size / 2 / 111_320
    return [[lng - dx, lat - dy], [lng + dx, lat - dy], [lng + dx, lat + dy], [lng - dx, lat + dy]]
  }
  const octagon = (lng: number, lat: number, r: number): [number, number][] =>
    Array.from({ length: 8 }, (_, j) => [lng + (Math.cos((j / 8) * Math.PI * 2) * r) / deck.kx, lat + (Math.sin((j / 8) * Math.PI * 2) * r) / 111_320] as [number, number])
  for (const [lng, lat] of decode(o, b.lamps)) {
    const hit = onDeck(deck, lng, lat)
    if (!hit) continue
    const L = Math.hypot(hit.toward[0], hit.toward[1]) || 1
    const ux = hit.toward[0] / L
    const uy = hit.toward[1] / L
    const at = (m: number): [number, number] => [lng + (ux * m) / deck.kx, lat + (uy * m) / 111_320]
    const top = hit.h + 0.2
    add('post', top, top + 9, square(lng, lat, 0.35))
    const [hx, hy] = at(0.9)
    add('lamp', top + 8.7, top + 9.25, square(hx, hy, 1.1))
    const [gx, gy] = at(4)
    add('glow', hit.h - 0.1, hit.h + 0.03, octagon(gx, gy, 4.5))
  }
  return out
}

export function worldResources(w: WorldBundle): Resource[] {
  return w.res
    .filter(([k]) => (RESOURCE_KINDS as readonly string[]).includes(k))
    .map(([kind, x, y, en, dv]) => ({ kind, at: [w.o[1] + y / 1e6, w.o[0] + x / 1e6], en, dv }))
}

// ---- look ----

interface Palette {
  sea: string
  lagoon: string
  reef: string
  land: string
  coast: string
  sand: string
  paved: string
  green: Record<GreenKind, string>
  tree: string
  road: Record<RoadClass, string>
  casing: Record<RoadClass, string>
  b: Record<BuildingKind, string>
  bridge: Record<BridgePart, string>
}

const DAY: Palette = {
  sea: '#4fb0d6',
  lagoon: '#8fe0dc',
  reef: '#b5eee2',
  land: '#efe4c6',
  coast: '#f9f0d6',
  sand: '#f8eccb',
  paved: '#dcd8cf',
  green: { park: '#a6d68a', wood: '#86c26c', grass: '#bfe2a1', pitch: '#93cf72' },
  tree: '#5fae55',
  road: { main: '#ffffff', street: '#fdfbf6', path: '#f3ead6', runway: '#626a76', taxiway: '#8d939c', pier: '#c9a37b' },
  casing: { main: '#c4b799', street: '#d6ccb4', path: '#ddd1b6', runway: '#4b525c', taxiway: '#737a84', pier: '#9c7a57' },
  b: {
    house: '#f5d9b6',
    flats: '#eec6a0',
    shop: '#f6bf98',
    mosque: '#fbfaf4',
    dome: '#e0b548',
    school: '#f5d46c',
    health: '#f3a3a8',
    gov: '#b8c9ea',
    industry: '#cbc6bb',
    hotel: '#d5c0ee',
    airport: '#cdd8e4',
    other: '#e8dccb',
  },
  // Light concrete and pale-grey steel, the deck the same white as the roads it carries. By day the
  // light pools are the road's own colour, so they don't show.
  bridge: { girder: '#e2e6ea', slab: '#cfd5db', road: '#ffffff', median: '#f1efe8', walk: '#efe5cf', rail: '#8e99a5', pier: '#d6dade', cap: '#c3cad1', post: '#7f8994', lamp: '#f3efe2', glow: '#ffffff' },
}

const NIGHT: Palette = {
  sea: '#0e2338',
  lagoon: '#1d4a5c',
  reef: '#245566',
  land: '#2b3243',
  coast: '#3a4256',
  sand: '#3b4152',
  paved: '#343a4a',
  green: { park: '#2d4a3b', wood: '#264235', grass: '#30493b', pitch: '#2f5040' },
  tree: '#2f5a43',
  road: { main: '#6a7591', street: '#56607a', path: '#474f64', runway: '#20242c', taxiway: '#2b3039', pier: '#5a4b3d' },
  casing: { main: '#1c2130', street: '#1d2231', path: '#262b3a', runway: '#121419', taxiway: '#181b22', pier: '#3a3027' },
  b: {
    house: '#5b5466',
    flats: '#56506a',
    shop: '#6a5664',
    mosque: '#a9afb8',
    dome: '#9a8543',
    school: '#6d6650',
    health: '#6c4f5a',
    gov: '#4b5675',
    industry: '#4a4c55',
    hotel: '#5c5179',
    airport: '#4d5868',
    other: '#545263',
  },
  // At night the lamps glow warm and throw pools of light on the deck; the railings catch it.
  bridge: { girder: '#4c5567', slab: '#434c5c', road: '#6a7591', median: '#7a829a', walk: '#4f566a', rail: '#9aa5c4', pier: '#465061', cap: '#3f4858', post: '#5b6377', lamp: '#ffe28c', glow: '#b9a56e' },
}

const match = (key: string, table: Record<string, string>, fallback: string): ExpressionSpecification => ['match', ['get', key], ...Object.entries(table).flat(), fallback] as unknown as ExpressionSpecification

// A width in metres on the ground, at least `minPx` on screen when zoomed out. MapLibre's world is
// 512 px wide at zoom 0, so at zoom 16 one pixel is about 1.19 m near the equator.
const M_PER_PX_16 = 1.19
const metric = (m: number, minPx: number): ExpressionSpecification => [
  'interpolate',
  ['exponential', 2],
  ['zoom'],
  12,
  Math.max(minPx * 0.5, m / M_PER_PX_16 / 16),
  16,
  Math.max(minPx, m / M_PER_PX_16),
  22,
  Math.max(minPx, (m / M_PER_PX_16) * 64),
]
const ROAD_M: Record<RoadClass, number> = { main: 10, street: 6, path: 2.2, runway: 45, taxiway: 18, pier: 4 }
const byClass = (table: Record<RoadClass, ExpressionSpecification | number>): ExpressionSpecification => ['match', ['get', 'c'], ...Object.entries(table).flat(), 1] as unknown as ExpressionSpecification
// MapLibre allows only one zoom curve per expression and it must be on the outside, so the class
// match goes inside each zoom stop (the same widths as `metric`).
const roadWidth = (extra: number): ExpressionSpecification => {
  const at = (stop: 12 | 16 | 22) =>
    byClass(
      Object.fromEntries(
        Object.entries(ROAD_M).map(([c, m]) => {
          const minPx = c === 'path' ? 1 : c === 'main' ? 3 : 2
          const w = m + extra
          return [c, stop === 12 ? Math.max(minPx * 0.5, w / M_PER_PX_16 / 16) : stop === 16 ? Math.max(minPx, w / M_PER_PX_16) : Math.max(minPx, (w / M_PER_PX_16) * 64)]
        }),
      ) as Record<RoadClass, number>,
    )
  return ['interpolate', ['exponential', 2], ['zoom'], 12, at(12), 16, at(16), 22, at(22)]
}

const ids = (a: string) => ({
  sea: `world-${a}-sea`,
  lagoon: `world-${a}-lagoon`,
  reef: `world-${a}-reef`,
  land: `world-${a}-land`,
  coast: `world-${a}-coast`,
  sand: `world-${a}-sand`,
  paved: `world-${a}-paved`,
  green: `world-${a}-green`,
  pitchLine: `world-${a}-pitch-line`,
  water: `world-${a}-water`,
  casing: `world-${a}-road-casing`,
  road: `world-${a}-road`,
  trees: `world-${a}-trees`,
  b: `world-${a}-buildings`,
  bridge: `world-${a}-bridge`,
  homes: `world-${a}-homes`,
})

// Our houses' wall colours by area (the bundle's `hp`), and the same at night: mixed toward the
// night houses' colour.
const homePalettes = new Map<string, string[]>()
const NIGHT_HOME = [0x4d, 0x4a, 0x5e]
function nightOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v * 0.3 + NIGHT_HOME[i]! * 0.7))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
function homeColour(area: string, night: boolean, fallback: string): ExpressionSpecification | string {
  const hp = (homePalettes.get(area) ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c))
  if (!hp.length) return fallback
  return ['match', ['get', 'k'], ...hp.flatMap((c, i) => [`h${i}`, night ? nightOf(c) : c]), fallback] as unknown as ExpressionSpecification
}

// Add an area's layers to the map, just above `beforeId`'s layer group (under the trip line,
// highlights and other overlays). Starts hidden; showWorld turns it on.
export function addWorld(m: MlMap, area: string, w: WorldBundle, beforeId: string | undefined, night: boolean) {
  const L = ids(area)
  if (m.getLayer(L.sea)) return
  const o = w.o
  homePalettes.set(area, w.hp ?? [])
  const pal = night ? NIGHT : DAY
  const src = (id: string, data: FeatureCollection, attribution?: string) => {
    const spec: GeoJSONSourceSpecification = { type: 'geojson', data, ...(attribution ? { attribution } : {}) }
    if (!m.getSource(id)) m.addSource(id, spec)
  }
  src(`${L.land}-src`, fc(w.land.map((s) => poly(o, s))), worldAttribution(area))
  src(`${L.reef}-src`, fc(w.reef.map((s) => poly(o, s))))
  src(`${L.water}-src`, fc(w.water.map((s) => poly(o, s))))
  src(`${L.sand}-src`, fc(w.sand.map((s) => poly(o, s))))
  src(`${L.paved}-src`, fc(w.paved.map((s) => poly(o, s))))
  src(`${L.green}-src`, fc(w.green.map(([k, s]) => poly(o, s, { k }))))
  src(`${L.road}-src`, fc(w.roads.map(([c, s]) => line(o, s, { c }))))
  src(`${L.b}-src`, fc(w.b.map(([k, h, base, s]) => poly(o, s, { k, h, base }))))
  src(`${L.trees}-src`, fc(decode(o, w.trees).map((p, i) => canopy(p, i))))
  const bridgeShapes: Feature<Polygon, Props>[] = []
  const areaDecks: Deck[] = []
  for (const b of w.bridge ?? []) {
    const deck = deckOf(o, b)
    areaDecks.push(deck)
    bridgeShapes.push(...bridgeFeatures(o, b, deck))
  }
  decks.set(area, areaDecks)
  src(`${L.bridge}-src`, fc(bridgeShapes))

  const hidden = { visibility: 'none' as const }
  const layers: LayerSpecification[] = [
    { id: L.sea, type: 'background', layout: hidden, paint: { 'background-color': pal.sea } },
    { id: L.reef, type: 'fill', source: `${L.reef}-src`, layout: hidden, paint: { 'fill-color': pal.reef, 'fill-opacity': 0.75 } },
    // Shallow water round every island: a wide soft band along the shore.
    { id: L.lagoon, type: 'line', source: `${L.land}-src`, layout: { ...hidden, 'line-join': 'round' }, paint: { 'line-color': pal.lagoon, 'line-width': metric(60, 6), 'line-blur': metric(30, 3), 'line-opacity': 0.9 } },
    { id: L.land, type: 'fill', source: `${L.land}-src`, layout: hidden, paint: { 'fill-color': pal.land } },
    { id: L.coast, type: 'line', source: `${L.land}-src`, layout: { ...hidden, 'line-join': 'round' }, paint: { 'line-color': pal.coast, 'line-width': metric(5, 1.5) } },
    { id: L.sand, type: 'fill', source: `${L.sand}-src`, layout: hidden, paint: { 'fill-color': pal.sand } },
    { id: L.paved, type: 'fill', source: `${L.paved}-src`, layout: hidden, paint: { 'fill-color': pal.paved } },
    { id: L.green, type: 'fill', source: `${L.green}-src`, layout: hidden, paint: { 'fill-color': match('k', pal.green, pal.green.grass) } },
    { id: L.pitchLine, type: 'line', source: `${L.green}-src`, filter: ['==', ['get', 'k'], 'pitch'], minzoom: 16, layout: hidden, paint: { 'line-color': '#ffffff', 'line-opacity': night ? 0.3 : 0.8, 'line-width': metric(0.4, 1) } },
    { id: L.water, type: 'fill', source: `${L.water}-src`, layout: hidden, paint: { 'fill-color': pal.lagoon } },
    { id: L.casing, type: 'line', source: `${L.road}-src`, layout: { ...hidden, 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': match('c', pal.casing, pal.casing.street), 'line-width': roadWidth(1.6) } },
    { id: L.road, type: 'line', source: `${L.road}-src`, layout: { ...hidden, 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': match('c', pal.road, pal.road.street), 'line-width': roadWidth(0) } },
    {
      id: L.trees,
      type: 'fill-extrusion',
      source: `${L.trees}-src`,
      minzoom: 14.5,
      layout: hidden,
      paint: { 'fill-extrusion-color': pal.tree, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 1.2, 'fill-extrusion-opacity': 0.95, 'fill-extrusion-vertical-gradient': true },
    },
    {
      id: L.b,
      type: 'fill-extrusion',
      source: `${L.b}-src`,
      filter: ['!', isHome],
      layout: hidden,
      paint: {
        'fill-extrusion-color': match('k', pal.b, pal.b.other),
        // Buildings rise from the ground as you zoom in (flat when far out), like a game camera.
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, ['get', 'h']],
        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, ['get', 'base']],
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    {
      // Our own houses as simple blocks in their wall colour: zoomed out, and in 2D (setWorld3d);
      // from zoom 17 in 3D the 3D houses (src/houses3d/) draw them instead, never both.
      id: L.homes,
      type: 'fill-extrusion',
      source: `${L.b}-src`,
      filter: isHome,
      maxzoom: HOUSES3D_MIN_ZOOM,
      layout: hidden,
      paint: {
        'fill-extrusion-color': homeColour(area, night, pal.b.house),
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, ['get', 'h']],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    {
      // Raised bridge decks: each part from its base to its top, rising with the buildings.
      id: L.bridge,
      type: 'fill-extrusion',
      source: `${L.bridge}-src`,
      layout: hidden,
      paint: {
        'fill-extrusion-color': match('k', pal.bridge, pal.bridge.slab),
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, ['get', 'h']],
        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 15, ['get', 'base']],
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': true,
      },
    },
  ]
  for (const l of layers) m.addLayer(l, beforeId)
}

const LAYER_KEYS = ['sea', 'reef', 'lagoon', 'land', 'coast', 'sand', 'paved', 'green', 'pitchLine', 'water', 'casing', 'road', 'trees', 'b', 'homes', 'bridge'] as const

export function showWorld(m: MlMap, area: string, on: boolean) {
  const L = ids(area)
  for (const k of LAYER_KEYS) if (m.getLayer(L[k])) m.setLayoutProperty(L[k], 'visibility', on ? 'visible' : 'none')
}

// Day or night colours (the map's own clock, like the vehicles' headlights).
export function setWorldNight(m: MlMap, area: string, night: boolean) {
  const L = ids(area)
  if (!m.getLayer(L.sea)) return
  const pal = night ? NIGHT : DAY
  m.setPaintProperty(L.sea, 'background-color', pal.sea)
  m.setPaintProperty(L.reef, 'fill-color', pal.reef)
  m.setPaintProperty(L.lagoon, 'line-color', pal.lagoon)
  m.setPaintProperty(L.land, 'fill-color', pal.land)
  m.setPaintProperty(L.coast, 'line-color', pal.coast)
  m.setPaintProperty(L.sand, 'fill-color', pal.sand)
  m.setPaintProperty(L.paved, 'fill-color', pal.paved)
  m.setPaintProperty(L.green, 'fill-color', match('k', pal.green, pal.green.grass))
  m.setPaintProperty(L.pitchLine, 'line-opacity', night ? 0.3 : 0.8)
  m.setPaintProperty(L.water, 'fill-color', pal.lagoon)
  m.setPaintProperty(L.casing, 'line-color', match('c', pal.casing, pal.casing.street))
  m.setPaintProperty(L.road, 'line-color', match('c', pal.road, pal.road.street))
  m.setPaintProperty(L.trees, 'fill-extrusion-color', pal.tree)
  m.setPaintProperty(L.b, 'fill-extrusion-color', match('k', pal.b, pal.b.other))
  if (m.getLayer(L.homes)) m.setPaintProperty(L.homes, 'fill-extrusion-color', homeColour(area, night, pal.b.house))
  if (m.getLayer(L.bridge)) m.setPaintProperty(L.bridge, 'fill-extrusion-color', match('k', pal.bridge, pal.bridge.slab))
  // A low, warm sun by day; a cool moon at night. Shapes the 3D buildings' sides.
  m.setLight(night ? { anchor: 'map', color: '#c7d2fe', intensity: 0.35, position: [1.2, 200, 50] } : { anchor: 'map', color: '#fff7e8', intensity: 0.45, position: [1.3, 210, 35] })
}

// 2D or 3D view (the map's 2D / 3D switch): in 2D the buildings and tree canopies lie flat as
// footprints (extrusion height 0); in 3D they rise again, as addWorld draws them.
export function setWorld3d(m: MlMap, area: string, on: boolean) {
  const L = ids(area)
  if (!m.getLayer(L.b)) return
  const rise = (key: 'h' | 'base'): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 13, 0, 15, ['get', key]]
  m.setPaintProperty(L.b, 'fill-extrusion-height', on ? rise('h') : 0)
  m.setPaintProperty(L.b, 'fill-extrusion-base', on ? rise('base') : 0)
  if (m.getLayer(L.homes)) {
    m.setPaintProperty(L.homes, 'fill-extrusion-height', on ? rise('h') : 0)
    // In 2D the simple blocks show at every zoom (flat footprints); in 3D the 3D houses take over.
    m.setLayerZoomRange(L.homes, 0, on ? HOUSES3D_MIN_ZOOM : 24)
  }
  m.setPaintProperty(L.trees, 'fill-extrusion-height', on ? ['get', 'h'] : 0)
  m.setPaintProperty(L.trees, 'fill-extrusion-base', on ? 1.2 : 0)
}
