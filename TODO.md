# TaxiQ — notes and to-do

## Next up

### 1. Suspend a driver (the red card)
In the physical queue, a suspended driver's tag is flipped so the red side shows, and everyone can see they are temporarily suspended.
- [ ] Admin can **suspend** a taxi, with a reason (misbehaviour, unpaid fees, other) and an optional note.
- [ ] A suspended row is shown "flipped": a red card in the same place in the queue.
- [ ] Suspended drivers can't be marked as answered or assigned. Tapping a red card does nothing.
- [ ] Admin can **lift** the suspension, and the card flips back.
- [ ] Decide: does a suspended driver keep their place in the queue (like the physical tag), or go to the back when lifted?
- [ ] The map shows suspended cars in red, or hides them.
- [ ] Strings in English and Dhivehi.

### 2. Assigning finishes the call (no Done button)
- [ ] Remove the **Done** step. Assigning a driver closes the call straight away, and all slid cards return to their normal position.
- [ ] Remove the open-call **Reassign** flow, which item 3 replaces.

### 3. Reopen an assignment
If something happens to the driver before the trip is completed (breakdown, no-show, emergency), the operator reopens that dispatch.
- [ ] A **Reopen** action on entries in Recent dispatches.
- [ ] Reopening puts that driver back in their old queue position and slides the drivers who had answered back out, so the operator can assign someone else.
- [ ] Decide: which dispatches can be reopened? Only the latest, or any recent one? If an older one is reopened after other assignments, its "old position" may no longer be exact.
- [ ] Decide: when a driver is reopened off a trip, are they still counted as answering, or not, like the current reassign?

### 4. Firebase: hosting and database (for now)
- [ ] Move hosting from GitHub Pages to Firebase Hosting.
- [ ] Use Firestore for taxis, the queue order, suspensions and the dispatch log, replacing localStorage. Real-time sync means every operator screen shows the same queue.
- [ ] Firestore security rules: only signed-in operators and admins can read or write, and admin-only actions (register, remove, suspend) are enforced in the rules, not just the UI.
- [ ] Later: the driver app writes GPS positions to Firestore, and `src/positions.ts` subscribes to them instead of simulating.
- **MDS checks before real data goes in** (see `SECURITY.md` once written):
  - [ ] **Authentication:** the standard requires eFaas. Plan eFaas (OIDC) sign-in → Firebase Auth custom token.
  - [ ] **Data residency:** Firebase has no Maldives region. Confirm whether a foreign region (e.g. `asia-south1` Mumbai or `asia-southeast1` Singapore) is acceptable for driver and passenger data, or whether a local/approved host is needed later.
  - [ ] **Dependencies:** check the Firebase SDK is on the MDS-whitelisted dependency list.
  - [ ] Keep Firebase config and keys out of the repo where they aren't public-by-design, and lock the API key to the app's domains.

## Backlog
- [x] House / road / landmark search on the map, with nearest taxis (Kulhudhuffushi City Council map data via mapkf, with permission).
- [ ] **Passenger info** on a call (pickup, destination, phone, note), linked to the assigned driver and shown in Recent dispatches. Use the place search to pick the pickup house. Keep it in memory only until there's a backend with auth.
- [ ] Ideas from mapkf: a share-location link for the driver (`?at=lat,lng`), and "my location" in the driver app.
- [ ] **Driver app** that sends GPS while on duty.
- [ ] **`SECURITY.md`** (repo root, not `docs/`) recording the tier and gate status under MDS-STD-SSD-001.
- [ ] Optional "Demo" badge on the sample drivers.
- [ ] Native-speaker review of all Dhivehi strings in `src/i18n.tsx`.
- [ ] Check the map and the phone layout on real devices.
