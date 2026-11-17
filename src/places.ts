// House / road / landmark names for map search, map labels and pin names, by area (AREAS).
// Kulhudhuffushi: the Kulhudhuffushi City Council map (via mapkf.vercel.app, with permission),
// scripts/import-places.py. Malé area: Malé City Council (Malé lots) and HDC (Hulhumalé lots and
// buildings), used with permission, scripts/import-male.py; Maldives Post postcodes,
// scripts/import-postcodes.py. scripts/split-places.py splits them into small tiles
// (src/data/places/<area>/, format in src/core/placeTiles.ts), and only the tiles needed are loaded.

import { decodeRows, filesAround, fold, originOf, placeId, type Row } from './core/placeTiles'

export type PlaceType = 'h' | 'r' | 'l' | 'p' // house, road, landmark, unnamed plot

export interface Place {
  t: PlaceType
  e: string // English name
  d: string // Dhivehi name (may be empty)
  k: string // search key (lowercase, simplified spelling)
  pl?: string // plot number
  pc?: string // Maldives Post postcode (Malé houses)
  p: [number, number][] // lat/lng points (roads have several)
}

// Every tile file, lazily: one small chunk each.
const FILES = import.meta.glob<Row[]>('./data/places/*/*.json', { import: 'default' })

interface Area {
  id: string
  box: [number, number, number, number] // south, west, north, east
  whole: boolean // small enough to load whole every time (labels across the island)
  files: Map<string, () => Promise<Row[]>>
  list: Place[] // what is loaded so far; grows as tiles load (callers may keep it)
  loading: Map<string, Promise<void>>
  seen: Set<string>
}
const area = (id: string, box: Area['box'], whole = false): Area => {
  const files = new Map<string, () => Promise<Row[]>>()
  const dir = `./data/places/${id}/`
  for (const [path, load] of Object.entries(FILES)) if (path.startsWith(dir)) files.set(path.slice(dir.length, -5), load)
  return { id, box, whole, files, list: [], loading: new Map(), seen: new Set() }
}
// The first is home: Kulhudhuffushi (about 90 KB gzipped, so always whole), used when the viewer is
// in no area with house data. The Malé area (about 260 KB) loads by tiles.
const AREAS = [area('kdh', [6.6, 73.05, 6.645, 73.09], true), area('male', [4.12, 73.4, 4.27, 73.57])]
const HOME = AREAS[0]!

export const regionAt = (at: readonly [number, number] | undefined) =>
  at ? AREAS.find((r) => at[0] >= r.box[0] && at[0] <= r.box[2] && at[1] >= r.box[1] && at[1] <= r.box[3]) : undefined

function loadFile(a: Area, name: string): Promise<void> {
  let p = a.loading.get(name)
  const load = a.files.get(name)
  if (!p && load) {
    p = load().then((rows) => {
      for (const place of decodeRows(rows, originOf(name))) {
        if (place.t === 'r') {
          const id = placeId(place)
          if (a.seen.has(id)) continue
          a.seen.add(id)
        }
        a.list.push(place)
      }
    })
    p.catch(() => a.loading.delete(name)) // try again next time
    a.loading.set(name, p)
  }
  return p ?? Promise.resolve()
}

// A whole area (for search, which must find any house in it). A new array, so React sees it change.
function loadArea(a: Area): Promise<Place[]> {
  return Promise.all([...a.files.keys()].map((name) => loadFile(a, name))).then(() => [...a.list])
}

// All of Kulhudhuffushi (the game and the game map).
export const loadPlaces = (): Promise<Place[]> => loadArea(HOME)

// How far around a point to load names: covers a phone's view at label zoom (18) around it.
export const AROUND_DEG = 0.003

// A search box has focus: the caller wants names for search, so load the whole area.
// (MapView's search box loads places on focus through loadPlacesAround.)
const searching = () => typeof document !== 'undefined' && document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'search'

// Places for naming and labels around a point: the tiles within AROUND_DEG of it, in its area.
// The list returned keeps growing as other tiles of that area load (a pin, a search), so labels kept
// from it fill in. In Kulhudhuffushi or outside any area: all of Kulhudhuffushi, as before. Called
// while a search box has focus: the whole area (as loadPlacesForSearch).
export function loadPlacesAround(at: readonly [number, number] | undefined, r = AROUND_DEG): Promise<Place[]> {
  const a = regionAt(at)
  if (!a || !at) return loadPlaces()
  if (a.whole || searching()) return loadArea(a)
  return Promise.all(filesAround(at, r).map((name) => loadFile(a, name))).then(() => a.list)
}

// Places for search near a point: the whole area it is in (Kulhudhuffushi outside any area).
export const loadPlacesForSearch = (at: readonly [number, number] | undefined): Promise<Place[]> => loadArea(regionAt(at) ?? HOME)

// The nearest named place within `max` metres (houses and landmarks first).
export function nearestPlace(places: Place[], at: [number, number], max = 80): Place | null {
  let best: { p: Place; d: number } | null = null
  for (const p of places) {
    if (p.t === 'r' || (p.t === 'p' && !p.e)) continue
    for (const pt of p.p) {
      const d = metresBetween(at, pt)
      if (d <= max && (!best || d < best.d)) best = { p, d }
    }
  }
  return best?.p ?? null
}

// The nearest road within `max` metres of a point (distance to the road's line, not just its
// points): a fallback name for a pinned spot with no house or landmark close by.
export function nearestRoad(places: Place[], at: [number, number], max = 60): Place | null {
  const k = Math.cos((at[0] * Math.PI) / 180)
  const xy = (q: [number, number]) => [(q[1] - at[1]) * 111_320 * k, (q[0] - at[0]) * 111_320] as const
  let best: { p: Place; d: number } | null = null
  for (const p of places) {
    if (p.t !== 'r' || !p.e) continue
    for (let i = 0; i < p.p.length; i++) {
      const [ax, ay] = xy(p.p[i]!)
      let d = Math.hypot(ax, ay)
      if (i > 0) {
        const [bx, by] = xy(p.p[i - 1]!)
        const vx = ax - bx
        const vy = ay - by
        const len2 = vx * vx + vy * vy
        const t = len2 ? Math.max(0, Math.min(1, -(bx * vx + by * vy) / len2)) : 0
        d = Math.min(d, Math.hypot(bx + t * vx, by + t * vy))
      }
      if (d <= max && (!best || d < best.d)) best = { p, d }
    }
  }
  return best?.p ?? null
}

// Ranked search: exact > starts with > contains, across English, Dhivehi, the simplified key and
// plot number. Unnamed plots only match by number.
export function searchPlaces(places: Place[], query: string, limit = 8): Place[] {
  const q = fold(query)
  if (!q) return []
  const scored: [number, Place][] = []
  for (const place of places) {
    const fields = place.t === 'p' ? [place.pl ?? fold(place.e)] : [fold(place.e), fold(place.d), place.k, place.pl ?? '', place.pc ?? '']
    let best = 0
    for (const f of fields) {
      if (!f) continue
      if (f === q) best = Math.max(best, 3)
      else if (f.startsWith(q)) best = Math.max(best, 2)
      else if (q.length > 2 && f.includes(q)) best = Math.max(best, 1)
    }
    if (best) scored.push([best * 10 - (place.t === 'p' ? 5 : 0), place])
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].e.length - b[1].e.length)
    .slice(0, limit)
    .map(([, p]) => p)
}

const cosLat = Math.cos((6.62 * Math.PI) / 180)

// Straight-line distance in metres (fine at island scale).
export function metresBetween(a: [number, number], b: [number, number]) {
  return Math.hypot((b[0] - a[0]) * 111_320, (b[1] - a[1]) * 111_320 * cosLat)
}
