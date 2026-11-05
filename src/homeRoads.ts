// Kulhudhuffushi, Haa Dhaalu Atoll: TaxiQ's home island and its road graph (src/data/roads.json,
// built from OpenStreetMap by scripts/build-roads.py).

import roads from './data/roads.json'
import type { RoadGraph } from './core/route'

export const MAP_CENTER: [number, number] = [6.6217, 73.0696]

export const ROAD_GRAPH: RoadGraph = { nodes: roads.n as [number, number][], next: roads.a as number[][] }
