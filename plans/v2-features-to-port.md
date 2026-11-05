# v2 features to bring into v3

Features added to the live **v2** app after the `v3` branch was created (split at `487a7b3`). v3 doesn't
have them yet. Port each one, then tick it off here. Commits are on `origin/v2`.

The map font and opacity fix (`5a27fab`) is already on v3 (`86a6751`).

## Order

1. MapLibre map: everything else on the map builds on it.
2. Island names, whole-world view, my location.
3. Trip routes.
4. Translation editor.
5. People and roles screen.

## 1. Map on MapLibre (rotate, tilt, compass, my location)

- **v2:** `677a72c`. `src/components/MapView.tsx` and `src/components/plotLayer.ts` were rewritten on `maplibre-gl` (BSD-3), and Leaflet was removed. The commit also bundles the MapLibre worker (`?worker&url` + `setWorkerUrl`, `worker: { format: 'es' }` in `vite.config.ts`), changes the CSP (`worker-src 'self' blob:`, `child-src blob:`, OSM tiles in `connect-src`), and adds `@types/geojson`.
- **v3 conflict:** v3's `MapView` is still on Leaflet and has the `positionSource` prop (real GPS, Phase 5), which hides markers that have no position. Take the v2 MapLibre version and put `positionSource` back: subscribe through it instead of `subscribePositions`, and add markers to the map only once they have a position.
- **v3 extra:** cars must keep turning by `heading - map.getBearing()` with the live GPS feed (`src/v3/livePositions.ts`).
- [ ] Ported
- [ ] Rotation checked on a real phone (two-finger twist, tilt, compass)

## 2. Island names, whole-world view, my location

- **v2:** `3ff4a60`. `scripts/build-islands.py` builds `src/data/islands.json` (683 labels from OpenStreetMap, ODbL) and includes the Villimalé fix. Labels show by zoom (towns 8+, islands 11+, islets 13+) in MV Bodu (`.island-label` in `index.css`). The map zooms out to the whole world, and has the geolocate control.
- **v3:** island names belong with the **city/island setting** (Malé plan, Phase 9). Keep `islands.json` country-wide; per-island house and plot data goes in `src/data/<island>/`.
- [ ] Ported
- [ ] Missing Dhivehi island names (459 of 683) filled in, either through the translation editor or a reviewed list

## 3. Trip routes (Uber-style), Taxi / Walk

- **v2:** `353bffd`. `src/core/route.ts` (Dijkstra; taxis follow one-way streets, walking doesn't) with tests, the `MapView` `trip` prop (route line, pins, distance/time card, mode switch), and `CallInfo.destinationAt`.
- **v3:** `route.ts` is already pure core, so copy it with its tests. In the API:
  - store the destination position on requests and dispatches (`ride_requests.destination_lat/lng`, `dispatches.call.destinationAt`)
  - show the route on the Citizen hire screen, the operator queue map, and the driver's accepted ride (driver to pickup, then pickup to destination)
- **Later:** ferry lines between islands from OpenStreetMap as a third mode, and buses where there is data (Malé). Routing needs a road graph per island (same city setting as #2).
- [ ] Ported
- [ ] Destination position stored by the API
- [ ] Driver sees the route to the pickup

## 4. Fix Dhivehi translations in the app (✏️)

- **v2:** `3f2d426`, `f206abf`. `src/translations.ts` (flattening, `{1}` templates, `applyOverrides`, checks) with tests, and `src/components/TranslationEditor.tsx`. It adds `dvFixes` and `builtInStrings` in `src/i18n.tsx`. Fixes are stored in Firestore `translations/dv`: anyone reads them, admins and devs write them.
- **v3:** move the storage to the API:
  - a `translations` table (lang, key, text, updated_by, updated_at) with an audit entry
  - a public `GET /v1/translations/dv`
  - `POST /v1/translations/dv`, for system admin and dev (and later, maybe a "translator" platform role)

  Cover both string sets in the editor: `src/i18n.tsx` (v2 screens) and `src/v3/strings.ts` (v3 screens).
- **Before porting:** bring in the fixes Hussain made on v2. Run Export in the editor, or read `translations/dv` from Firestore, and write them into the built-in strings.
- [ ] Ported
- [ ] v2 fixes written into the built-in Dhivehi strings

## 5. People and roles screen

- **v2:** `9b2c474`. Every sign-in writes `users/{uid}` (email, name, first and last seen). `src/components/PeoplePanel.tsx` lists everyone with their role, with filters and counts (Citizen, Driver, Operator, Admin, Dev), search, inline role changes, and pre-adding by email. Only a dev can give or remove `dev`.
- **v3:** the server already has `users` (with `created_at`). Still needed:
  - a `last_seen` column
  - `GET /v1/platform/users` (system admin and dev): users with their platform role, staff roles per center, and driver memberships
  - `POST /v1/platform/users/:uid/role` to grant or revoke `system_admin` (dev only grants or revokes `dev`). Today this is only possible from the CLI (`server/src/grant.ts`).
  - a **People** tab on the v3 System admin screen
  - per center, the Staff tab already does this for owners. Consider listing everyone who has used the center (drivers, operators, recent passengers) there too.
- [ ] Ported

## Keep this list up to date

When something new goes into v2 before v3 replaces it, add it here with its commit.
