// The area the map is showing and the roads the demo taxis drive on. It starts on Kulhudhuffushi
// (our own road data). When the viewer shares their location, the map moves there: near
// Kulhudhuffushi it keeps our roads; anywhere else the real roads come from the map's OpenFreeMap
// vector tiles, with the Overpass API as a backup (sent only a position rounded to about 1 km).

import { useSyncExternalStore } from 'react'
import { buildGraph, coarse, overpassQuery } from './core/osmRoads'
import { metres, type RoadGraph } from './core/route'
import { MAP_CENTER, ROAD_GRAPH } from './homeRoads'
import { setViewerSpot } from './viewerSpot'

// The main OpenStreetMap Overpass server, then a public mirror. Each gets 12 seconds.
export const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
const AREA_RADIUS = 2000 // metres of road loaded around the viewer
const HOME_RADIUS = 6000 // within this of Kulhudhuffushi, use our own road data

export interface Area {
  graph: RoadGraph
  center: [number, number]
  kind: 'home' | 'here' | 'loading' | 'none' // Kulhudhuffushi; real roads near the viewer; finding them; none found
  located: boolean // the viewer's location was used
  source?: RoadSource // where the roads came from, when kind is 'here'
}

// Road sources, best first: full OpenStreetMap data with one-way streets (Overpass), then the map's
// vector tiles (also with one-way streets, simplified shapes). Our own surveyed data (Kulhudhuffushi)
// beats both. A better source always replaces a weaker one.
export type RoadSource = 'overpass' | 'tiles'
const RANK: Record<RoadSource, number> = { overpass: 2, tiles: 1 }

let area: Area = { graph: ROAD_GRAPH, center: MAP_CENTER, kind: 'home', located: false }
const listeners = new Set<() => void>()
const set = (a: Area) => {
  area = a
  setViewerSpot(a.center)
  listeners.forEach((f) => f())
}

export const getArea = () => area
export function subscribeArea(f: () => void) {
  listeners.add(f)
  return () => listeners.delete(f)
}
export const useArea = () => useSyncExternalStore(subscribeArea, getArea, getArea)

const NO_ROADS: RoadGraph = { nodes: [], next: [] }
const GIVE_UP_MS = 25_000
const MOVE_AREA_M = 3_000 // moving this far loads the roads and places for the new area
const LAST_SPOT = 'taxiq.lastSpot'

// The viewer's last known spot (on this device only, rounded to about 100 m), so the map can open
// there next time while it looks for them.
export function lastSpot(): [number, number] | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_SPOT) ?? 'null')
    return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number') ? [v[0], v[1]] : null
  } catch {
    return null
  }
}
function rememberSpot(at: [number, number]) {
  try {
    localStorage.setItem(LAST_SPOT, JSON.stringify([Math.round(at[0] * 1000) / 1000, Math.round(at[1] * 1000) / 1000]))
  } catch {
    // Storage unavailable: the map just opens on the Maldives next time.
  }
}

// Real roads found for the viewer's area (from the map's vector tiles, or from Overpass): the demo
// taxis start driving on them. A bigger road network replaces a smaller one.
export function offerRoads(graph: RoadGraph, source: RoadSource) {
  if (!area.located || area.kind === 'home') return
  if (area.kind === 'here' && area.source) {
    const better = RANK[source] > RANK[area.source]
    const same = RANK[source] === RANK[area.source]
    if (!better && !(same && graph.nodes.length > area.graph.nodes.length)) return
  }
  set({ ...area, graph, kind: 'here', source })
}

// Follow the viewer: called on every GPS update. A new area (moved 3 km or more) loads its roads. Demo taxis only ever drive on
// real roads: until roads are found for the area none are shown, and if none can be found the
// note under the map says so.
export function moveToLocation(at: [number, number]) {
  rememberSpot(at)
  // Still in the same area: only where the viewer is changes (for the house search and pins).
  if (area.located && metres(at, area.center) < MOVE_AREA_M) {
    setViewerSpot(at)
    return
  }
  if (metres(at, MAP_CENTER) < HOME_RADIUS) {
    set({ graph: ROAD_GRAPH, center: at, kind: 'home', located: true })
    return
  }
  set({ graph: NO_ROADS, center: at, kind: 'loading', located: true })
  setTimeout(() => {
    if (area.kind === 'loading') set({ ...area, kind: 'none' })
  }, GIVE_UP_MS)
  // Backup source: the Overpass API (the map's vector tiles are the main one, see MapView).
  void (async () => {
    const lat = coarse(at[0])
    const lng = coarse(at[1])
    for (const url of OVERPASS_URLS) {
      try {
        const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: overpassQuery(lat, lng, AREA_RADIUS) }), signal: AbortSignal.timeout(12_000) })
        const graph = r.ok ? buildGraph(await r.json()) : null
        if (graph) offerRoads(graph, 'overpass')
        if (r.ok) return
      } catch {
        // Busy or unreachable: try the next server.
      }
    }
  })()
}
