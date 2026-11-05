// The area the map is showing and the roads the demo taxis drive on. It starts on Kulhudhuffushi
// (our own road data). When the viewer shares their location, the map moves there: near
// Kulhudhuffushi it keeps our roads; anywhere else it loads the real roads around them from
// OpenStreetMap (Overpass), sending only a position rounded to about 1 km.

import { useSyncExternalStore } from 'react'
import { buildGraph, coarse, gridAround, overpassQuery } from './core/osmRoads'
import { metres, type RoadGraph } from './core/route'
import { MAP_CENTER, ROAD_GRAPH } from './homeRoads'

// The main OpenStreetMap Overpass server, then a public mirror. Each gets 12 seconds.
export const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
const AREA_RADIUS = 2000 // metres of road loaded around the viewer
const HOME_RADIUS = 6000 // within this of Kulhudhuffushi, use our own road data

export interface Area {
  graph: RoadGraph
  center: [number, number]
  kind: 'home' | 'here' | 'grid' // Kulhudhuffushi; real roads around the viewer; a stand-in grid there
  located: boolean // the viewer's location was used
}

let area: Area = { graph: ROAD_GRAPH, center: MAP_CENTER, kind: 'home', located: false }
const listeners = new Set<() => void>()
const set = (a: Area) => {
  area = a
  listeners.forEach((f) => f())
}

export const getArea = () => area
export function subscribeArea(f: () => void) {
  listeners.add(f)
  return () => listeners.delete(f)
}
export const useArea = () => useSyncExternalStore(subscribeArea, getArea, getArea)

let loading: Promise<void> | null = null

// Move the demo area to the viewer's location (once per page load).
export function moveToLocation(at: [number, number]): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    if (metres(at, MAP_CENTER) < HOME_RADIUS) {
      set({ graph: ROAD_GRAPH, center: at, kind: 'home', located: true })
      return
    }
    const lat = coarse(at[0])
    const lng = coarse(at[1])
    // Show the place straight away on a stand-in grid, then swap in the real roads if they load.
    set({ graph: gridAround(at[0], at[1]), center: at, kind: 'grid', located: true })
    for (const url of OVERPASS_URLS) {
      try {
        const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: overpassQuery(lat, lng, AREA_RADIUS) }), signal: AbortSignal.timeout(12_000) })
        const graph = r.ok ? buildGraph(await r.json()) : null
        if (graph) {
          set({ graph, center: at, kind: 'here', located: true })
          return
        }
        if (r.ok) return // the service answered: there are no roads here (open sea), keep the grid
      } catch {
        // Busy or unreachable: try the next server.
      }
    }
  })()
  return loading
}
