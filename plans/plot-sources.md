# Plot and house sources (references)

Researched 17 Nov 2026. The goal is **our own** house data (`src/data/houses-<area>.json`, built by
`scripts/build-houses.py`, design in `plans/house-designs.md`). Public charts and lot layers are
**references**: we take facts from them (where a house is, its name, plot number, road, height) and
redraw the shapes ourselves. We don't ship anyone's chart or lot layer as it is.

What this means for rights, plainly (not legal advice; the owner decides):

- **Facts** (a house called X stands about here, on road Y, ~12 m tall) are generally free to use.
- A **database** as a whole (its selection, structure, outlines drawn by someone) can carry rights.
  Copying it wholesale, or vertex by vertex, is copying the database; redrawing from it at our own
  level of detail, with our own fields, is much further away, but credit is still due where we lean
  on it heavily. "Publicly reachable" is not the same as "licensed for reuse": most of the services
  below publish no terms at all, so the existing permissions (Kulhudhuffushi chart via mapkf, Malé
  City Council, HDC) are what we rely on. Ask for written permission where it says **ask**.
- **OpenStreetMap** data stays **ODbL** whatever we do to it. `roads.json` and `world-*.json` are
  OSM-derived, so `houses-*.json` uses `roads.json` only to choose which side a house faces (a
  bearing); house names, plots and roads names come from the council references. Keep
  "(c) OpenStreetMap contributors" in the map attribution regardless.
- **Personal data:** two public Malé layers (below) also expose owner names and ID-card numbers.
  We never request those fields (`build-houses.py` asks for named fields only), and nothing personal
  goes into our files.

## Sources

| Area | Source | Owner / host | What it has | Format | Coverage, freshness | Terms / credit | Used? |
|---|---|---|---|---|---|---|---|
| Kulhudhuffushi | [mapkf.vercel.app](https://mapkf.vercel.app) (chart tiles, `data.json`) | emjey; chart by the Secretariat of Kulhudhuffushi City Council (Adam Mohamed, Hussain Ali) | Plot chart (raster), 3,914 houses/roads/landmarks with EN/DV names and plot numbers | Raster tiles + JSON points | Whole island | Used with permission; credit both. **The site is down now (HTTP 402 DEPLOYMENT_DISABLED)**: our copies in `places.json`/`plots.json` still work, but `Share pickup` links to mapkf break | Reference (already in repo) |
| Kulhudhuffushi | [KC_Basemap_WFL1](https://services8.arcgis.com/X5BMOMb5BwtyTn3H/arcgis/rest/services/KC_Basemap_WFL1/FeatureServer) layer 0 *KC_Resi Lots* | ArcGIS Online user `charretteGIS` (Charrette, planning consultant), made for the council | 2,386 residential lot polygons, house name (EN only, `Goathi_Name`), survey zone; also parcels (434, land use), 36 buildings, 1,520 lots (2024-02) | ArcGIS FeatureServer (vector) | Whole island, Feb 2024 | No licence or credit text on the item. **Ask** the council / Charrette before relying on it | Reference: compared; optional `--ref council` |
| Kulhudhuffushi | [KULHUDHUFFUSHI_MAPS](https://services8.arcgis.com/X5BMOMb5BwtyTn3H/arcgis/rest/services/KULHUDHUFFUSHI_MAPS/FeatureServer) | charretteGIS | Residential (2,255), land use existing/proposed, road centre lines (speeds, no names), boundary, reef, trees, business points | FeatureServer | Whole island | None stated; **ask** | No (candidate: road centre lines) |
| Malé, Villimalé | [Male_Lots_28sep25_Public](https://services8.arcgis.com/X5BMOMb5BwtyTn3H/arcgis/rest/services/Male_Lots_28sep25_Public/FeatureServer/0) | charretteGIS for Malé City Council | 8,595 lots: name EN/DV, ward, block, road EN/DV, land use, **Elevation (building height, m)**, area | FeatureServer | Malé, Sep 2025 | Used with permission (as in `import-male.py`); credit Malé City Council | Reference (house names, block, road, height, lot outline) |
| Malé | [Male_Roads](https://services8.arcgis.com/X5BMOMb5BwtyTn3H/arcgis/rest/services/Male_Roads/FeatureServer/0) | charretteGIS for Malé City Council | 265 road centre lines with names and lane counts | FeatureServer | Malé | Same permission as the lots | Reference (front side of each house) |
| Villimalé | `VILIMALE_LOTS`, `VILIMALE_HOUSE_NAMES`, `VILIMALE_ROADS` on the same host | charretteGIS for Malé City Council | Lots, house-name points, roads | FeatureServer | Villimalé | Same as Malé lots (confirm) | Not yet (next: adds Villimalé houses, missing today) |
| Malé | `MC_3D_WFL1`, `MC_Residential_WFL1` on the same host | charretteGIS | Lots with registration data, **owner names and national ID numbers** | FeatureServer | Malé | Personal data; must not be used. **Tell Malé City Council / Charrette these layers are public** | No, never |
| Fuvahmulah | [Open data: map data](https://fuvahmulah.gov.mv/en/council/reports/open-data/map-data) ([GeoJSON](https://umami.fuvahmulah.gov.mv/q/WhvMIrkXL), KML) | Fuvahmulah City Council | 3,811 **points**: 3,539 houses plus shops, mosques etc., names EN/DV, road EN/DV, district | GeoJSON points (no plot outlines) | Whole island, updated daily (10 Nov 2026) | Published "for public use, research and application development"; no licence text: credit Fuvahmulah City Council | Not yet (next: houses from points + OSM buildings, 1,743) |
| Fuvahmulah | `FVM_residential`, `FVM_Basemap_*`, `FVM_LUP_*`, `FVM_RoadsV1` (charretteGIS host) | charretteGIS for Fuvahmulah City Council | Existing residential polygons, base map, land use plans, roads | FeatureServer | Whole island | None stated; **ask** | Not yet |
| Fuvahmulah | [fuvahmulah-map-ssr.pages.dev](https://fuvahmulah-map-ssr.pages.dev/about) | Ammadu (personal project) | Addresses, house names, drawn shapes | Web app | Island | Own terms page; private project: **ask** | No |
| Addu | [adducitycouncil.pages.dev/data](https://adducitycouncil.pages.dev/data) | Addu City Council (unofficial domain) | Stats, PDFs (Land Use Plan 2026), an interactive map without a reachable data endpoint | PDF / web map | Addu | None stated | No (PDF land use plans: tracing candidates) |
| Addu | [adducity.gov.mv uploads](https://www.adducity.gov.mv/uploads/1740979588.pdf) | Addu City Council | Reclamation and zoning plans | PDF charts | Parts of Addu | None stated | No (tracing candidate; needs georeferencing to OSM + a plot-number OCR pass) |
| Thinadhoo | none found | Thinadhoo City Council | Plot allocation notices only | - | - | - | No (OSM has only 25 buildings) |
| Hulhumalé | [DBO_Property_Public](https://gis.hdc.mv/server/rest/services/DBO_Property_Public/FeatureServer) | Housing Development Corporation (HDC) | 1,765 buildings with names and heights (layer 0), lots (layer 1) | FeatureServer | Hulhumalé Phase 1 and 2 | Used with permission; credit HDC | Reference (blocks with heights) |
| National | [OneMap](https://readme.onemap.mv) island service and downloads | Geomatics Department, Ministry of Infrastructure, Housing and Urban Development (MLSA) | Islands, reefs, lagoons, control points (no plots or buildings) | FeatureServer + shapefiles | National | [Data Usage License](https://readme.onemap.mv/pdf/Data%20Usage%20License.pdf): royalty-free, commercial use and adaptation allowed; credit "Contains information licensed under Data Usage License – Geomatics Department of Ministry of Infrastructure, Housing and Urban Development"; no endorsement implied | No (good open source for island outlines) |
| Many islands | Charrette's land use plans on the same host (`LUP_NRLAC_*`, `Existing_LUP_WFL1`, `Zoning_*`) | charretteGIS | Land use plans (existing / proposed) for several islands | FeatureServer | Various | None stated; **ask** | No |
| Everywhere | OpenStreetMap (Overpass) | OSM contributors | Buildings: Kulhudhuffushi 158, Malé 953, Fuvahmulah 1,743, Addu 3,364, Thinadhoo 25 (counts 17 Nov 2026) | Vector | Patchy | ODbL: share-alike, credit "(c) OpenStreetMap contributors" | Roads only (front side) |

## Kulhudhuffushi: council vector lots vs our traced chart

`build-houses.py kulhudhuffushi` prints this every run.

- Council residential lots: 2,385; traced plots (`plots.json`): 3,419 (it also has non-residential
  plots). 1,934 council lot centres fall inside a traced plot.
- Centre offset, council lot to the traced plot holding it: **mean 6.0 m**, median 5.5 m, p90 10.2 m.
  Boundary distance (council corners to the traced outline): mean 4.7 m, median 3.9 m.
- Only 894 of 2,439 house points (chart) sit in a council lot with the same English name. The gap is
  not one shift: houses named the same in both sit 1 to 11 m apart, varying across the island (the
  south-west is ~10 m east, the north ~3 m). One reference is georeferenced differently.
- Against OSM roads: 135 of 915 road nodes fall inside council lots, 237 inside traced plots (the
  traced set covers more ground, so this leans council but doesn't settle it).
- **Choice for the owner:** the default build uses the traced chart, which shares one frame with
  the house pins and labels already in the app. `--ref council` uses the council lots and moves each
  house point by the local gap (median of its 8 nearest same-name pairs; 1,320 pairs): 3,070 houses
  then sit in a council lot. A survey check of a few corners (GPS on site) would settle which frame
  is right; then the other can be warped to it.

## Our house files (built 17 Nov 2026)

| File | Houses | Size (gzipped) | Footprint vs reference |
|---|---|---|---|
| `houses-kulhudhuffushi.json` | 3,227 (3,084 in a traced plot, 143 without one get a 10 x 13 m house facing the nearest road) | 661 KB (164 KB) | centre 2.2 m mean from the plot centre (house set back, yard behind); 3,013 of 3,084 inside their plot |
| `houses-male.json` | 8,903 (Malé 7,516 named residential lots, Hulhumalé 1,387 HDC blocks) | 1,834 KB (445 KB) | centre 0.16 m from the lot centre, corners 0.26 m mean from the lot outline (town houses fill their lot; squared, simplified, set back 0.3 m) |

## Next steps (later, one line each)

- Places search: add `houses-*.json` names where `places*.json` has none (e.g. Fuvahmulah), or point search results at the house id.
- Plot layer: draw our footprints instead of the traced chart when "Plot map" is on (same colours by ward).
- Own 3D map: draw each house from its `design` (see `plans/house-designs.md`) instead of the flat 5 m footprint extrusion.
- Villimalé: add the council's Villimalé lots and house names to `build-houses.py male`.
- Fuvahmulah: council house points + OSM buildings (or a default plot) -> `houses-fuvahmulah.json`.
- mapkf is down: ask emjey whether it will return; host the Share pickup page ourselves if not.
- Ask Kulhudhuffushi City Council (and Charrette) in writing about KC_Basemap; tell Malé City Council about the public owner/ID layers.
