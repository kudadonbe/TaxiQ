// Kulhudhuffushi house / road / landmark names for map search. Data: src/data/places.json, built by
// scripts/import-places.py from the Kulhudhuffushi City Council map (via mapkf.vercel.app, with
// permission). Loaded on demand so the map opens without it.

export type PlaceType = 'h' | 'r' | 'l' | 'p' // house, road, landmark, unnamed plot

export interface Place {
  t: PlaceType
  e: string // English name
  d: string // Dhivehi name (may be empty)
  k: string // search key (lowercase, simplified spelling)
  pl?: string // plot number
  p: [number, number][] // lat/lng points (roads have several)
}

let cache: Promise<Place[]> | null = null

export function loadPlaces(): Promise<Place[]> {
  cache ??= import('./data/places.json').then((m) => m.default as Place[])
  return cache
}

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9ހ-޿]/g, '')

// Ranked search: exact > starts with > contains, across English, Dhivehi, the simplified key and
// plot number. Unnamed plots only match by number.
export function searchPlaces(places: Place[], query: string, limit = 8): Place[] {
  const q = fold(query)
  if (!q) return []
  const scored: [number, Place][] = []
  for (const place of places) {
    const fields = place.t === 'p' ? [place.pl ?? fold(place.e)] : [fold(place.e), fold(place.d), place.k, place.pl ?? '']
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
