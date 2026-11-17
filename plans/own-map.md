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

## Sinamalé Bridge (built, branch `bridge-3d`)

The China-Maldives Friendship Bridge (Sinamalé Bridge), Malé to Hulhulé, drawn in 3D on the own map.

### Facts (public sources; facts only, no text or images copied)

- Total length about 2.0 to 2.1 km, of which about 1.39 km is over the sea. [W] [A]
- Main bridge 760 m: six spans of (100 + 2 x 180 + 140 + 100 + 60) m, a continuous rigid frame on
  V-shaped piers. The girder is a hybrid: concrete beams over the V-piers (cantilevers of about 65 m)
  and steel box girders closing the middle of the spans; six closures, three concrete and three
  steel box (sections up to about 600 t; last steel closure 9 July 2018). [S] [F] [A]
- The approaches are girder bridges. The longest spans are 180 m; 26 piers in all, each on four or
  more piles (steel pipe composite piles; the ground is coral limestone to 60 m and more). [H] [S]
- Deck width 20.3 m (20 m in some reports). Two lanes for cars, two for motorcycles, plus bicycle and
  pedestrian lanes (the lane count was argued over later; four vehicle lanes in the design). [W] [A]
- Height: the airport's obstacle surfaces kept the structure under 45 m; described as about 20 m
  high. Seabed to deck over 60 m; the channel is about 46 to 50 m deep at its deepest. [H] [K] [F]
- Designer: CCCC Highway Consultants. Builder (EPC): CCCC Second Harbour Engineering (China Harbour
  Engineering is also named). Contract 30 December 2015; opened 30 August 2018; handed over
  12 November 2018. About US$200 to 300 million (Chinese grant and loan, and the government). [H] [A] [W]
- Not found in public sources: navigation clearance under the main spans, exact pier shapes and
  sizes, the colours of the deck, railings and lamp posts. Those are drawn as our own design.

Sources:
- [W] Wikipedia, Sinamalé Bridge: https://en.wikipedia.org/wiki/Sinamal%C3%A9_Bridge
- [S] Large Span V-shaped Pier Continuous Rigid Structure Design of China-Maldives Friendship
  Bridge (conference paper): https://structurae.net/en/literature/conference-paper/large-span-v-shaped-pier-continuous-rigid-structure-design-of-china-maldives-friendship-bridge
- [F] Construction report (Chinese): https://www.fx361.com/page/2019/0105/20152531.shtml
- [A] AidData project 38037: https://china.aiddata.org/projects/38037/
- [H] Hassan Hameed, book on the bridge (sample pages): https://www.hassanhameed.com/wp-content/uploads/2019/08/Book-on-Bridge-sample-pages.pdf
- [K] Hakai Magazine: https://hakaimagazine.com/news/protests-and-prison-time-fight-over-males-friendship-bridge/

### What is built

- **Line:** OSM's two one-way carriageways (bridge=viaduct, name:en Sinamalé Bridge, about 1,391 m)
  give the deck's centre line, a point every 10 m. They are left out of the flat road lines, so no
  road is drawn across the sea; the deck's top is the road colour, so the road reads as continuing.
- **Main spans:** placed by fitting the span list to the main pier footings OSM maps
  (bridge:support=pier, 5 found, all within 4 m). Their gaps (179, 138, 99 m) match the 180, 140 and
  100 m spans, so the order from Malé is 100, 180, 180, 140, 100, 60. V-shaped piers stand at the
  three supports either side of the 180 m spans (assumed; the 140 m span needs one too); the others
  are twin columns with a cap beam. Approach piers every ~32 m (16 on the Malé side, 2 on the
  Hulhulé side; 25 supports in all against 26 in the book).
- **Profile:** 0 m at each end of the OSM bridge, parabolic vertical curves (160 m) and a steady grade
  up to a level 20 m top over the middle of the two 180 m spans (about 3.6% from Malé, 6% from
  Hulhulé). Simplified: the real ramps continue on land, ours meet the ground at the shore.
- **Girder:** 2.4 m deep on the approaches, 3 m at mid-span on the main bridge, deepening to about
  4.7 m over the V-piers (assumed sizes).
- **Deck section** (our design within the 20.3 m width): median barrier, 7.5 m carriageway each way,
  footpaths with railings, lamp posts every 36 m staggered on both footpaths.
- **Data:** `bridge` in `world-male.json` (centre line, top and girder depth per point in dm, pier
  parts, lamp points): about 9 KB raw, 2.4 KB gzipped. `src/worldStyle.ts` builds the shapes
  (girder, slab, road, median, footpaths, railings, piers, lamps, light pools) into one
  fill-extrusion layer `world-<area>-bridge`, with base and height per part. Day: light concrete and
  pale-grey steel. Night: lamps glow warm and throw pools of light on the deck.
- Also fixed: the road layers' width expression put the zoom curve inside a `match`, which MapLibre
  refuses, so the own map's roads were not drawn at all. The zoom curve is now outside.

### Follow-up: vehicles on the deck

Driving is unchanged: the road graph (`src/homeRoads.ts`, Overpass, OpenFreeMap) still has the
bridge, and vehicles on it are DOM markers at ground level, so over the raised deck they look as if
they float at sea level under it when the map is tilted. The 3D figures layer should lift them:
`bridgeHeightAt(lat, lng)` in `src/worldStyle.ts` gives the deck's top in metres (0 off the
bridge) for any area added to the map. A DOM marker can't take a height, so this waits for figures
drawn in the map (a custom 3D layer), or for an offset hack (shift the marker up on screen by the
projected height).

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
  walked. The game map isn't our own map yet, so it has no 3D figures.

## Map polish (branch `map-polish`)

- On the Sinamalé Bridge, 3D figures ride on the deck (`bridgeHeightAt`, now with a cheap box check
  per deck), and the flat markers and labels are lifted on screen by the deck's height at the
  map's tilt (`liftOnDeck` in MapView), so labels sit above the raised vehicle.
- Resting vehicles and people are see-through in 3D too (a second, transparent material).
- A private vehicle linked as a center taxi (`publicTaxis.vehicleId`, now kept by `asMapTaxi`) is
  drawn in taxi colours (with the roof sign on a sedan) under All and Taxi, and in its own colour
  under Private (`paintVehicle`).
- Tap cards: vehicles show the model, colour, seats and "Also center taxi N"; center taxis show
  their seats, and the plate only for staff (the public projection has none). No plate or phone
  was added to public data (the owner's identity decision); no photos (Storage needs Blaze).
- The viewer's own avatar replaces MapLibre's blue dot (`showUserLocation: false`; the control
  still locates, follows and re-centres): their chosen look as a flat disc with a heading arrow,
  or a walking 3D figure, with a faint still accuracy ring when worse than 25 m. Hidden while they
  are on the map as their own vehicle. Only on this device; nothing new is shared.
- A **child** look (about 70% height) in Show me on the map, the 3D models and the rules.
- Game map: MapView already switches to our own map by the view's middle (`worldAreaAt`), and the
  game's MapView (not full screen) shows the own-map and 2D/3D switches, so it needs no code
  change. The only blocker is data: there is no Kulhudhuffushi world area yet (phase 2 above).

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
