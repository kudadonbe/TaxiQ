---
title: TaxiQ v2 - Malé Map Plan
status: research-done, data-not-yet-obtained
created: 2026-11-04
tags: [taxiq, maps, male, data]
---

# TaxiQ v2 - Malé Map Plan

**Goal:** Find every house in Malé and rebuild the Malé map the way we built Kulhudhuffushi.

**Bottom line:** I did not find a public, complete Malé house dataset. Build a first map from open building data now, and ask the data owners for permission to use their house names and plots. That permission model is what made Kulhudhuffushi possible.

## What Kulhudhuffushi used

| Layer | Source | Script | Output |
|---|---|---|---|
| Roads | OSM Overpass | `scripts/build-roads.py` | `src/data/roads.json` |
| House, road, and landmark names | mapkf `data.json`, used with permission | `scripts/import-places.py` | `src/data/places.json` |
| Plot polygons | Traced from mapkf chart tiles, used with permission | `scripts/build-plots.py` | `src/data/plots.json` |
| Background | OSM tiles | `src/components/MapView.tsx` | Live tiles |

Only the roads script can be reused almost as is. The other two depend on mapkf's file format, tile grid, and `GEO` constants. I found no mapkf equivalent for Malé.

## Malé sources

| Source | Could provide | Status | Main limit |
|---|---|---|---|
| Malé City Council land database | Blocks, plots, land use | **Ask first.** No public URL or download found | Sensitive data is restricted. Reporting mentions georeferenced data for Villimalé, but does not say the same for Malé |
| Male' Map app / AlfiSoft | Addresses and postcodes for Malé and Villimalé; a portfolio page also lists Hulhumalé | **Ask first.** The data appears to be curated by AlfiSoft | Do not scrape or extract it without permission. Its format and house count are unknown |
| OpenStreetMap | Roads, buildings, some names | Open (ODbL) | Coverage not measured yet |
| Overture Maps | Building footprints from OSM, Esri, Google, and Microsoft | Open (ODbL listed by the catalog page checked) | Footprints are not plots. Close-packed buildings may merge. Name and address coverage unconfirmed |
| OneMap / Geomatics | Island outline; public API documented | Open, under its own license | The API docs list no buildings, parcels, or house names. A news report mentions base map shapefiles, so check the portal |

## Recommended approach

### Step 1: Measure open data
Run these on a machine with normal internet access. **They were not tested**, because this environment blocks those hosts. Check the bounding box against the map first.

```sh
# OSM buildings for Malé island: south, west, north, east
curl -s --data-urlencode 'data=[out:json][timeout:90];(way["building"](4.165,73.495,4.185,73.535);relation["building"](4.165,73.495,4.185,73.535););out geom tags;' \
  https://overpass-api.de/api/interpreter -o male-buildings-osm.json

# OSM roads: same filter as build-roads.py
curl -s --data-urlencode 'data=[out:json][timeout:60];way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|service|track)$"]["access"!~"no|private"]["service"!~"parking_aisle|driveway"](4.165,73.495,4.185,73.535);(._;>;);out body;' \
  https://overpass-api.de/api/interpreter -o male-roads-osm.json

# Overture buildings: west, south, east, north
pip install overturemaps
overturemaps download --bbox=73.495,4.165,73.535,4.185 -f geojson --type=building -o male-buildings-overture.geojson
```

Report these numbers before building anything:
- Building count from each source
- Number with `name`, `addr:housename`, or `addr:street`
- A visual check of 3 sample blocks, looking for merged or missing buildings

### Step 2: Ask for permission
Send requests to Malé City Council and AlfiSoft. Hussain sends these, or approves them first.

Ask for:
- House names in English and Dhivehi, with postcodes if available
- Point locations, or plot and block polygons
- Permission to use them in TaxiQ, with credit
- Allowed update process and any fee

Do not request or store owner names, lease details, or other personal records. TaxiQ only needs a place name and a location.

### Step 3: Build the map
Use the same output shapes the app already reads:
- `places.json`: `{ t, e, d, k, pl?, p }`
- `plots.json`: `{ c, p, h?, pl? }`
- `roads.json`: `{ n, a }`

New scripts:
- `scripts/build-male-footprints.py`: merges and cleans OSM and Overture buildings
- `scripts/import-male-places.py`: imports whichever permitted name source we get
- `scripts/match-male-houses.py`: places each name on a polygon and reports failures

Match quality matters more than the total. Kulhudhuffushi matched 3,083 of 3,227 houses, so report the same figure for Malé and export every unmatched house for review.

### Step 4: Fill the gaps
Use these if no complete list becomes available:
- Let staff and drivers add or correct a house on the map, subject to review
- Let passengers drop a pin when a house is missing
- Use Maldives Post postcodes only if a licensed source is available

## Code changes needed

Kulhudhuffushi is currently hard-coded. Add a city setting before adding Malé:

- `src/positions.ts`: `MAP_CENTER` and the road graph
- `src/places.ts`: the places data file
- `src/components/plotLayer.ts`: the plot data file and its credit
- `src/components/MapView.tsx`: the map attribution
- Share pickup: its mapkf link only works for Kulhudhuffushi, so Malé needs an in-app or generic map link
- Build scripts: stop writing to the Kulhudhuffushi output paths

Suggested layout: `src/data/<city>/{places,plots,roads}.json`, lazy-loaded per city.

Watch these Malé-specific points:
- **One-way streets:** `build-roads.py` honours `oneway`, so check the tags against real traffic. Wrong tags will make simulated taxis and any future routing wrong.
- **Size and rendering:** The current map draws about 3,400 polygons on canvas. Measure Malé's count, then test on a real phone. Move to vector tiles only if needed.
- **Tall buildings:** One building can have several named addresses, so a polygon must allow many houses.
- **Footprint colours:** Plot colours currently represent wards in the council chart. Decide what footprints should show.
- **Security:** Update `SECURITY.md` for any new data source, and update the CSP in `firebase.json` for any new remote origin.
- **Credits:** Add ODbL and permitted-source credits to the map attribution and the README.
- **Repo placement:** Do not put notes in `docs/`. It is the build output, and Vite empties it on every build.

## Done when

- [ ] Malé opens at the right location with its real road graph
- [ ] Building or plot shapes stay sharp at zoom 22
- [ ] Houses can be searched in English and Dhivehi
- [ ] The match rate and unmatched-house list are reported
- [ ] Pickup pins and nearest taxis work in Malé
- [ ] Kulhudhuffushi still works exactly as before
- [ ] Every data source has written permission or a confirmed open license, and is credited
- [ ] `pnpm build` and `pnpm lint` pass

## Questions for Hussain

1. Should the first release cover only Malé island, or also Hulhumalé and Villimalé?
2. Should Malé replace Kulhudhuffushi, or should the app support both through a city selector?
3. Who should contact Malé City Council and AlfiSoft?
4. Is footprint-only acceptable for the first version if names arrive later?

## Sources

- [OneMap documentation](https://readme.onemap.mv)
- [MLSA base map release (PSM News)](https://psmnews.mv/en/104759)
- [Malé City land information system (Raajje.mv, 1 Oct 2025)](https://raajje.mv/171371)
- [Column on access to Malé land records (Maldives Independent, 3 Aug 2025)](https://maldivesindependent.com/by-saif-fathih/nobody-knows-who-owns-mals-land-and-thats-not-an-accident-6b5c)
- [Male' Map on the App Store](https://apps.apple.com/us/app/male-map/id801885396)
- [Male' Map project page (Intellea)](https://intellea-co.pages.dev/portfolio/male-map)
- [Overture buildings catalog](https://gee-community-catalog.org/projects/overture_buildings/)
- [House names in the Maldives (Wikipedia)](https://en.wikipedia.org/wiki/Unique_house_names_in_Maldives)
