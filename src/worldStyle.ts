// TaxiQ's own map: islands, sea and reef, roads, buildings rising in 3D and places people go,
// drawn by MapLibre from our own data bundle (src/data/world-<area>.json, built by
// scripts/build-world.py) instead of OpenStreetMap's raster tiles. GeoJSON sources only: no tile
// server, no glyphs (labels stay DOM markers in MapView). Original colours, a day and a night look.
//
// Data: (c) OpenStreetMap contributors (ODbL); Malé City Council lots and HDC Hulhumalé buildings and
// lots, used with permission.

import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'
import type { ExpressionSpecification, GeoJSONSourceSpecification, LayerSpecification, Map as MlMap } from 'maplibre-gl'

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
  b: [BuildingKind, number, number, Shape][]
  trees: Shape
  res: [ResourceKind, number, number, string, string][]
}
type GreenKind = 'park' | 'wood' | 'grass' | 'pitch'
type RoadClass = 'main' | 'street' | 'path' | 'runway' | 'taxiway' | 'pier'
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
// Phase 1: Greater Malé. Kulhudhuffushi and the other islands come later (plans/own-map.md).
interface WorldArea {
  id: string
  box: [number, number, number, number] // s, w, n, e
  load: () => Promise<WorldBundle>
}
const WORLD_AREAS: WorldArea[] = [
  { id: 'male', box: [4.158, 73.478, 4.252, 73.556], load: () => import('./data/world-male.json').then((m) => m.default as unknown as WorldBundle) },
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

export const WORLD_ATTRIBUTION =
  'TaxiQ map: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL); buildings: Malé City Council, <a href="https://gis.hdc.mv/">HDC</a>'

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
const roadWidth = (extra: number) => byClass(Object.fromEntries(Object.entries(ROAD_M).map(([c, m]) => [c, metric(m + extra, c === 'path' ? 1 : c === 'main' ? 3 : 2)])) as Record<RoadClass, ExpressionSpecification>)

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
})

// Add an area's layers to the map, just above `beforeId`'s layer group (under the trip line,
// highlights and other overlays). Starts hidden; showWorld turns it on.
export function addWorld(m: MlMap, area: string, w: WorldBundle, beforeId: string | undefined, night: boolean) {
  const L = ids(area)
  if (m.getLayer(L.sea)) return
  const o = w.o
  const pal = night ? NIGHT : DAY
  const src = (id: string, data: FeatureCollection, attribution?: string) => {
    const spec: GeoJSONSourceSpecification = { type: 'geojson', data, ...(attribution ? { attribution } : {}) }
    if (!m.getSource(id)) m.addSource(id, spec)
  }
  src(`${L.land}-src`, fc(w.land.map((s) => poly(o, s))), WORLD_ATTRIBUTION)
  src(`${L.reef}-src`, fc(w.reef.map((s) => poly(o, s))))
  src(`${L.water}-src`, fc(w.water.map((s) => poly(o, s))))
  src(`${L.sand}-src`, fc(w.sand.map((s) => poly(o, s))))
  src(`${L.paved}-src`, fc(w.paved.map((s) => poly(o, s))))
  src(`${L.green}-src`, fc(w.green.map(([k, s]) => poly(o, s, { k }))))
  src(`${L.road}-src`, fc(w.roads.map(([c, s]) => line(o, s, { c }))))
  src(`${L.b}-src`, fc(w.b.map(([k, h, base, s]) => poly(o, s, { k, h, base }))))
  src(`${L.trees}-src`, fc(decode(o, w.trees).map((p, i) => canopy(p, i))))

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
  ]
  for (const l of layers) m.addLayer(l, beforeId)
}

const LAYER_KEYS = ['sea', 'reef', 'lagoon', 'land', 'coast', 'sand', 'paved', 'green', 'pitchLine', 'water', 'casing', 'road', 'trees', 'b'] as const

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
  m.setPaintProperty(L.trees, 'fill-extrusion-height', on ? ['get', 'h'] : 0)
  m.setPaintProperty(L.trees, 'fill-extrusion-base', on ? 1.2 : 0)
}
