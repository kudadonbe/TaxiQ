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
- [x] Council plot chart (house land areas) as a map layer, with house names drawn on the map when zoomed in.

## Next up

### Firebase: hosting and database
Needs a Firebase project from you, so this can't be done without it.
- [ ] Create the Firebase project and choose its region (see the MDS checks below).
- [ ] Move hosting from GitHub Pages to Firebase Hosting.
- [ ] Use Firestore for taxis, the queue order, suspensions and the dispatch log, replacing localStorage. Real-time sync means every operator screen shows the same queue.
- [ ] Firestore security rules: only signed-in operators and admins can read or write, and admin-only actions (register, remove, suspend) are enforced in the rules.
- [ ] Driver app writes GPS positions to Firestore, and `src/positions.ts` subscribes to them.
- **MDS checks before real data goes in** (see `SECURITY.md`):
  - [ ] **Authentication:** eFaas (OIDC) sign-in → Firebase Auth custom token.
  - [ ] **Data residency:** Firebase has no Maldives region. Confirm that a foreign region (e.g. `asia-south1` Mumbai or `asia-southeast1` Singapore) is acceptable.
  - [ ] **Dependencies:** check the Firebase SDK is on the MDS-whitelisted dependency list.
  - [ ] Lock the Firebase API key to the app's domains.

## Backlog
- [ ] **Driver app** that sends GPS while on duty, and shows "my location" (an idea from mapkf).
- [ ] Sharper plot chart when zoomed right in (use the zoom-6/7 tiles as a tiled layer instead of one image).
- [ ] Driving distance (by road) for nearest taxis, instead of straight-line distance.
- [ ] Audit log of assignments, reopens, suspensions and admin changes (needs the backend).
- [ ] Native-speaker review of all Dhivehi strings in `src/i18n.tsx`.
- [ ] Check the map and the phone layout on real devices.
