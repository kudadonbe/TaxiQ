# TaxiQ — notes and to-do

## Done

### Suspend a driver (the red card)
- [x] Admin can **suspend** a taxi with a reason (misconduct, unpaid fees, other) and an optional note.
- [x] A suspended row shows the red side of the card, with a flip animation, in the same place in the queue.
- [x] Suspended drivers can't be marked as answered or assigned.
- [x] Admin can **lift** the suspension.
- [x] Decided: a suspended driver **keeps their place** in the queue, like the physical tag.
- [x] Map shows suspended cars in red, and they're left out of "nearest taxis".
- [x] Strings in English and Dhivehi.

### Assigning finishes the call
- [x] No Done button: Assign closes the call, and all slid cards return to normal.
- [x] Open-call Reassign removed (Reopen replaces it).

### Reopen an assignment
- [x] **Reopen** on any entry in Recent dispatches that hasn't been reopened yet.
- [x] The driver goes back to their old queue position, and the call comes back with its passenger details and the other answering drivers.
- [x] Decided: **any recent dispatch** can be reopened. For the latest one the position is exact. For an older one the driver goes back to the same position number, which may be slightly off if the queue has changed since.
- [x] Decided: the reopened driver is **not** marked as answering again.
- [x] Undo (latest dispatch, exact) is kept for mistaken taps.

### Passenger info
- [x] Call details: pickup (with house/road search), destination, passenger phone, note. Validated, and **memory only**.
- [x] Details go with the dispatch and show in Recent dispatches.
- [x] The pickup shows on the Map as a green pin, with the nearest available taxis.
- [x] **Share pickup** sends the driver a mapkf.vercel.app link that opens the house on the council map.

### Other
- [x] House, road and landmark search on the map, with nearest taxis (Kulhudhuffushi City Council map data via mapkf, used with permission).
- [x] `SECURITY.md` (repo root) recording Tier 1 for the planned system and the blockers before real data.
- [x] "Demo" badge on the sample drivers in Admin.
- [x] Council plot chart redrawn as vector plots (sharp at any zoom), with house names on the map and tap-a-plot for its houses and plot number.

## Next up

### Firebase: hosting and database
Needs a Firebase project from you, so this can't be done without it.
- [x] Firebase project `kd-taxiq` created; hosting live at https://kd-taxiq.web.app with security headers (`pnpm deploy`).
- [x] Firestore created in `asia-southeast1` (Singapore), Native mode, delete protection on, rules deny-all.
- [ ] Decide whether to keep the GitHub Pages copy or retire it once Firebase is the main site.
- [x] Live mode: taxis, the queue state and dispatches in Firestore with real-time sync and transactions (demo mode kept for signed-out visitors).
- [x] Role-based Firestore rules (`roles/{email}`: admin or operator), with admin-only taxi and staff management.
- [x] Google sign-in (Firebase Auth), an MDS exception to eFaas (see SECURITY.md).
- [ ] Write a Firestore rules test suite (emulator) for the role checks.
- [ ] Driver app writes GPS positions to Firestore, and `src/positions.ts` subscribes to them.
- **MDS checks before real data goes in** (see `SECURITY.md`):
  - [ ] **Authentication:** replace Google sign-in with eFaas (OIDC → Firebase Auth custom token); get written approval for the interim exception.
  - [ ] **Data residency:** Singapore chosen (2026-11-04); get approver/MDS sign-off before real data.
  - [ ] **Dependencies:** check the Firebase SDK is on the MDS-whitelisted dependency list.
  - [ ] Lock the Firebase API key to the app's domains.

### Public hiring
- [x] The public sees only the map and Hire a taxi; the queue and Admin are staff-only.
- [x] Passengers sign in with Google and request any taxi (offered down the queue, 20 s each) or a specific taxi tapped on the map.
- [x] Driver role and Driver screen: offers with Accept/Decline, accepted rides with a call button.
- [x] Staff see open passenger requests and can cancel them.
- [ ] Sounds and vibration on the driver's phone when an offer arrives.
- [ ] Optional: a Cloud Function (Blaze plan) to make offer order tamper-proof and move offers on without any screen open.

### Map (requested 2026-11-05)
- [x] Map engine switched to MapLibre: rotate, tilt, pinch zoom, compass and "my location" with heading, like Google Maps.
- [x] Whole-world map, island and town names (MV Bodu), house names in Dhanbumaa, opaque plot map.
- [x] Trip route on the map: pickup to destination along the roads (one-way streets for taxis), start and end pins, distance and time, Taxi / Walk switch. Shown when both ends are picked from the house search.
- [ ] Travel modes like Google Maps where they apply in the Maldives: taxi or car (one-way streets), walking (ignores one-way), and ferry lines between islands from OpenStreetMap. Bus only where there is data (Malé area).
- [ ] House names and plots for other islands, kept per island (`src/data/<island>/...`), starting with the Malé area. Plots can be traced the same way as Kulhudhuffushi once a plot chart is available.
- [ ] v3: a base map from Hussain's drone photos (see `plans/` when v3 resumes): orthophoto processing (e.g. OpenDroneMap), map tiles served from the VPS, and a MapLibre raster layer. Centimetre-level detail is realistic; 5 mm accuracy needs RTK or surveyed ground control points, and a drone permit from the Civil Aviation Authority.

### Game mode (idea, 2026-11-05)
- [ ] Review the design: `plans/game-mode.md` (multiplayer business game on the real map, play money, roles citizen/driver/center owner, "off the meter" goal).
- [x] G1: rooms with join codes, roles, host start/pause/resume/end, game clock, shared map of game cars; How to play (in the app and `plans/how-to-play.md`).
- [x] G2: rides, queue offers, fares (placeholders), logbook; always-running TaxiQ World with saved people; rules tests.
- [ ] Real Kulhudhuffushi fare table (replace placeholders in `src/core/fares.ts`).
- [ ] G3: money and KD-Bank, starting with a job or a loan; money calendar 1 real minute = 1 money day (decided, option a; game-mode §5.5). G4: winning. G5: events and deals. G6: port to v3.

## Backlog
- [ ] **Driver app** that sends GPS while on duty, and shows "my location" (an idea from mapkf).
- [ ] Review traced plots against the chart: about 4% of houses didn't land in a traced plot, and a few neighbouring plots may have merged where lines were faint.
- [ ] Driving distance (by road) for nearest taxis, instead of straight-line distance.
- [ ] Audit log of assignments, reopens, suspensions and admin changes (needs the backend).
- [ ] Native-speaker review of all Dhivehi strings in `src/i18n.tsx`.
- [ ] Check the map and the phone layout on real devices.

## Product direction (see plans/product-direction.md)

- [ ] Two sides in the app and the game: public-service taxi and private hire (people and companies with their own cars). Answer the questions in §3 first.
- [ ] v3: hire any land vehicle (types, ways to hire, providers).
