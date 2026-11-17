# TaxiQ's own map

TaxiQ draws its own map instead of OpenStreetMap's raster tiles. It shows only what citizens need:
islands, sea and reef, roads, buildings and houses, and places people go (mosques, schools, health,
harbours and jetties, shops, fuel, government offices, parks and trees, sports grounds, beaches).
The look is a clean, game-like 3D map: buildings rise when the map is tilted, the colours are soft,
and the roads are clear. The art and colours are our own. One map serves both the real app
(MapView) and the TaxiQ World game, because the game uses MapView too.

## Phase 1: Greater Malé (built, branch `own-map`)

The owner asked for the Malé area first, not Kulhudhuffushi.

- `scripts/build-world.py male` makes one request to each source: OSM Overpass (the main server,
  then a mirror), Malé City Council lots, and HDC buildings and lots. It writes
  `src/data/world-male.json`: 12,384 building shapes (1,689 HDC with real heights, 8,504 council
  lots, 2,138 OSM, plus mosque domes), 2,038 road lines, 696 green areas, 9,344 trees and 959
  resources. The file is 1.1 MB raw and 363 KB gzipped, and the app only loads it when the map
  looks at the area.
- `src/worldStyle.ts` turns the bundle into GeoJSON sources and layers. It needs no tile server and
  no glyphs, and it has a day palette and a night palette.
- MapView turns it on in the area's box from zoom 13 (the **TaxiQ map** switch, on by default),
  hides the OSM raster layer and tilts the map to 55 degrees on the way in. Markers (vehicles,
  people, services, pins) are DOM, so they stay on top of the buildings.

Left for phase 1:
- Malé heights are guesses (3 to 8 floors per lot, repeatable). Real heights would need the council
  to add them, or a survey.
- House names still come from the existing DOM labels at zoom 18+. Tapping a building doesn't name
  it yet.
- Driving roads still come from OpenFreeMap tiles and Overpass, so those requests remain in Malé.
  The world bundle's road lines could feed `offerRoads` later.
- Villimalé has no house footprints (only OSM buildings). Thilafushi and Gulhifalhu are outside
  the box.
- Kulhudhuffushi, and with it the game map: add an `AREAS` entry that uses
  `src/data/plots.json` as house footprints.

## 2D / 3D view and 3D figures (built, branch `figures-3d`)

- A **2D / 3D** switch in the map's tool row, remembered on the device (`taxiq.mapView`), 3D by
  default. **2D**: flat and top-down everywhere (pitch 0 and no tilting), buildings and trees as flat
  footprints (`setWorld3d` in `src/worldStyle.ts`), and today's flat vehicle and person drawings.
  **3D**: the tilt on entering our map, extruded buildings, and 3D figures.
- **3D figures** (`src/figures3d/`): on our own map, in 3D, from zoom 16.5. Vehicles and people
  are low-poly models built in code with **three.js** (the owner approved the dependency; MIT,
  0.187.0, about 139 KB gzipped in its own chunk, downloaded only when figures first show). One
  MapLibre custom layer shares the map's WebGL context, so buildings hide what's behind them.
  Lit like the world style: a warm sun by day, a cool moon at night, headlights and tail lights.
- Positions are never computed twice: MapView copies where it shows each taxi, private vehicle,
  bus, person and mobile helper into a small registry (`src/core/figures.ts`); the layer only
  draws when that changes, so nothing repaints while nothing moves.
- Looks: 12 vehicle shapes (taxis yellow, green when they answered, red when suspended, with a
  roof sign), riders on two-wheelers, brake lights and indicators. People pick their own look in
  Show me on the map: simple, man (shirt, T-shirt, formal), woman (hijab with a long top, libaas
  with hijab, sports hijab), young person, and one of six clothes colours. Mobile helpers wear
  overalls with a tool bag (mechanic, tyres, battery, towing...) or a delivery jacket and box
  (parts, fuel). A taxi driver look is built but not shown yet.
- Left: the walking person faces the way they walk; a standing person faces the way they last
  walked. Resting (faded) figures aren't faded in 3D yet. The game map isn't our own map yet, so
  it has no 3D figures.

## Phase 2: more of the capital region and Kulhudhuffushi

- Kulhudhuffushi from OSM plus the council plot chart (plots as house footprints, about 5 m high).
- Thilafushi, Gulhifalhu and the islands near Malé.
- Building heights from HDC lots (`HEIGHT_FLR`) where no building is drawn yet.

## Phase 3: every inhabited island

- Build vector tiles for the whole country into one **PMTiles** file and host it on Firebase
  Hosting (same origin, no CSP change). Reading it needs the `pmtiles` npm package. **Needs the
  owner's OK** (a new dependency, MDS whitelist).
- Keep the same layer style. The bundles become a fallback, or go away.

## Licences

- OSM data is ODbL. The published map file is a Derivative Database, so it stays under ODbL
  (share-alike for the data, not for the app's code). We keep "(c) OpenStreetMap contributors" in
  the map attribution, and anyone who asks can get the file (it ships with the site anyway).
- The Malé City Council lots and HDC buildings and lots are used with permission, the same services
  as `scripts/import-male.py`. **The owner must confirm** that this permission also covers drawing
  their shapes, not only the names.

## Privacy

Inside the area, the viewer's browser no longer asks tile.openstreetmap.org for raster tiles, so OSM
no longer sees the viewer's IP address and the part of the map they look at. OpenFreeMap (road
lines for the demo taxis) and Overpass are still asked until the driving roads come from our own
data. No new origins were added, so the CSP is unchanged.
