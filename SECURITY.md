# Security — TaxiQ

Standard: MDS Secure Software Development Standard, MDS-STD-SSD-001 v1.0. Notes and checklist are in
`kudadonbe/kudadonbe/standards`.
Last assessed: 2026-11-04 (first pass, from the code; not an audit).

> This file is in the repo root, not `docs/`. In this repo `docs/` is the GitHub Pages build output
> and is wiped on every `pnpm build`.

## Classification

**Tier 1 (planned system):** TaxiQ is public-facing and, once live, will handle personal data
(Software Management Policy 4.2.1: "public-facing *or* PII-handling"):

- Driver names, phone numbers, vehicle registrations and suspension records.
- Passenger phone numbers, pickup and destination addresses (house names).
- Live GPS positions of drivers (from the planned driver app).

**Current release (v2.x demo):** a static demo on GitHub Pages with **no real personal data**. The sample
drivers are fictional, with masked phone numbers. The demo is not a production deployment, so no gate
beyond Gate 1 applies yet. Treat it as a prototype for the design phase.

- Data classification: not yet recorded.
- Digital Service Standards: in scope once there are public or operator users (public-facing).

## Current state

| Area | State |
|------|-------|
| Hosting | Firebase Hosting (project `kd-taxiq`, https://kd-taxiq.web.app), with security headers set in `firebase.json`: CSP (self, OSM tiles, and only the Google sign-in and Firestore endpoints), HSTS, nosniff, strict referrer policy and `frame-ancestors 'none'`. The browser API key is restricted to TaxiQ's domains. Also mirrored on GitHub Pages (no custom headers). Static, HTTPS, no backend yet. |
| Database | Firestore `(default)` in **asia-southeast1 (Singapore)**, Native mode, delete protection on. Role-based rules in `firestore.rules`: the email must be verified, the role comes from `roles/{email}`, field shapes are checked, dispatches can't be deleted, and anything not listed is denied. Before the role rules, deny-all was verified (unauthenticated read and write returned 403). Data residency outside the Maldives was chosen by the product owner on 2026-11-04 and still needs MDS/approver sign-off before real data goes in. |
| Auth | **Google sign-in (Firebase Auth)**, an **exception** to the eFaas requirement (see Exceptions). A Google account alone grants nothing: access needs an entry in Firestore `roles/{email}` (admin or operator), checked by the security rules on every read and write. Operators run the queue and dispatches; only admins register, remove or suspend taxis and manage staff. A `dev` role (the developer's account) has full access, including acting as any taxi's driver, for testing; keep it to the developer only and remove it before production. Signed-out visitors get the local demo only. |
| Public access | Signed-out visitors can read only `publicTaxis` (center number, driver names, suspended): no phone numbers. Verified: every other collection returns 403 without sign-in. Any signed-in Google account can request one ride at a time (`requests/{uid}`); the request's phone number is visible to the passenger, staff, and the driver it is offered to or who accepted it. |
| Ride offers (no server) | The rules enforce the 20-second timeout with the server clock (`request.time`), that only the offered driver can accept, that an accepting driver can only move their own taxi to the back of the queue, and that the next taxi is in the queue and not already skipped. **Known limit:** the rules can't check that the next taxi is the *first* eligible one in queue order, so a modified client on a signed-in account could skip ahead. Acceptable for a pilot; a Cloud Function would close it. |
| Data at rest | **Live mode (staff):** taxis, the queue state and the dispatch log, including passenger details, are in Firestore (Singapore), encrypted at rest by Google. **Demo mode:** taxis and the queue order are in the browser's `localStorage`; passenger details and the log stay in memory. |
| Input validation | Allow-list rules in `src/validate.ts` for taxi records, suspension notes and call details. The same rules re-validate anything read back from `localStorage`. |
| Output encoding | React escapes all text. Map markers and tooltips are built with `textContent`. The only `innerHTML` is static SVG with no user data. |
| Location sharing (citizens) | **Opt-in, off by default.** A signed-in person can show themselves on the map (`src/usePresence.ts`). They choose who sees them: **drivers and centers** (who see their name), or **everyone signed in** (who see an icon only, never the name: a separate nameless copy, `presencePublic`). The way they move is guessed from GPS speed, and they can correct it. Retention: updated at most every 10 s; hidden after 2 minutes without an update (app closed); stops by itself after 1 hour (rules cap `expiresAt` at 61 minutes); **Stop deletes both records**. Only the person can write their records (`firestore.rules`, checked by `pnpm test:rules`). Records left behind when an app is closed stay hidden; a Firestore TTL policy on `expiresAt` (console) should delete them for good. Tier 1 personal data: it needs a privacy notice before real use. |
| Private vehicles for hire | The owner's application (`vehicles/{id}`: name, phone, vehicle details) is readable only by the owner and staff. Any operator decides; every application and decision is in an append-only log (`vehicleLog`). While the owner switches an approved vehicle to Available, their device's live position is shown to signed-in users (`publicVehicles`: vehicle type, colour, first name, price; never the phone number), hidden 2 minutes after the last update and removed when they switch it off or are suspended. The owner may choose a rider figure for a motorbike or e-bike (man, woman or young rider); it is off by default, only ever the owner's own choice, never inferred, and can be changed or removed at any time. Documents (licence, insurance, permits) and eFaas identity are planned for v3. |
| Private-vehicle bookings | `privateRides/{passengerUid}` holds the passenger's name, phone, pickup and destination; readable only by the passenger, that vehicle's owner and staff. The owner's first name and phone go to the passenger only when the owner accepts. The status only moves forward (offering, accepted, onboard, done), set by the owner; only the passenger cancels (`firestore.rules`, checked by `pnpm test:rules`). |
| Open trips | A passenger can post a trip without picking a vehicle. **Taxi:** it goes to the top taxi in `queue/state.order` (checked by the rules); **private hire:** to the top of the private queue (vehicles on the map, first available first, by `publicVehicles.since`). Only the offered driver sees it. The driver offers (20 s), the passenger books or says no thanks (60 s), and the driver's phone completes it (30 s); each wait is enforced with the server clock. A driver can't book a trip the passenger hasn't booked. **Known gap:** the rules check that the next private vehicle is approved, on the map, not the passenger's own and not one that already passed, but they can't check it is the *top* of the private queue (that needs a server, v3). A vehicle's `since` can only be set to now (switched on, or back from a trip) or kept, so nobody can jump the queue. The driver's phone says the passenger's **first name** aloud when a trip comes. |
| Trip price and finish | The total is worked out on the passenger's device (the center's fare table, or the owner's price, for the road distance) and the rules keep it unchanged after the request is sent. **Known gap:** the rules can't check the total against the distance (that needs a server, v3); the driver sees it before offering, so a wrong price can be passed. Only the driver can mark Picked up and Arrived; only the passenger can confirm it finished or report a problem (or anyone involved after 10 minutes, by the server clock); only staff close a problem. The fare table (`config/fares`) is written only by admins. |
| Vehicle as taxi and private hire | Only an admin links a private vehicle to the center as a taxi (`vehicles.taxiId`, `taxis.vehicleId`) and gives a center driver private hire (`roles.private`); the owner can only ask, and can't change or drop the link. One at a time is enforced by the rules: a taxi whose vehicle is on the private map can't offer for or accept a queue trip. After approval, a new registration, type or seats goes back to Pending (an operator checks again; off the map until then). |
| Taxi centers | Each center's taxis (with phone numbers), queue changes, dispatch log (with passenger details) and taxi requests are readable only by that center's staff and platform admins; a center admin can't touch another center's taxis, fare or people, or create centers or platform admins (all checked by the rules and `pnpm test:rules`). Platform admins are admins with no center, and developers. Private hire is shared across centers. |
| Voice messages | `voiceClips/{message}-{lang}` holds short recorded clips (audio only, at most ~350 KB, fixed message ids), written only by admins and played by signed-in users. Recording needs the microphone: the `Permissions-Policy` allows it for this site only (`microphone=(self)`), and the browser asks before recording. Clips play from memory (`media-src 'self' blob:`). Never record a real passenger's name or other personal data in a clip. |
| Activity log | `activity/{id}` keeps one short record per event for each person (`src/activity.ts`): vehicle applied, edited, approved, rejected, suspended or linked; Available on or off; booking sent, cancelled or finished; offer taken or passed; problem reported; role changed; ride fixed by staff. Each holds the person's uid, the kind (a fixed list in the rules), a detail of at most 80 characters, who wrote it (`by`, the writer's email) and the server time. Written by the person's own app, or by staff acting on that person; read only by the person and staff. Append-only: nobody can edit or delete an entry. Kept 90 days: `expireAt` (the rules refuse more than 91 days) and a Firestore TTL policy delete old entries (to switch on: `gcloud firestore fields ttls update expireAt --collection-group=activity --enable-ttl --project kd-taxiq`). Never holds locations or phone numbers. |
| Money account | `accountEntries/{id}` records each person's money (`src/account.ts`, `src/core/account.ts`). When a trip finishes, the same write that marks it done records Paid for the passenger and Earned for the driver (taxi: the driver's own account, `requests.driverUid`, set by the driver who offered or accepted) or the vehicle's owner, at the trip's fixed total. Cash only for now (`method: 'cash'`); no card or bank details are held. Append-only: nobody can edit or delete an entry. The rules check every trip entry against its trip (read after the write): the trip is done, the amount is its price, the accounts are its passenger and driver or owner, the writer is one of them or staff, and the id is the trip key and side, so a trip can't be recorded twice. Staff fix mistakes only with a correction entry (a signed amount, at most MVR 100,000 either way, with a reason of 3-120 characters). Read only by the person and staff. A payment gateway comes later, on the v3 server, not in the browser. |
| Dhivehi corpus | `corpusRoots`, `corpusWords` (with `forms/{dialect}`), `corpusSentences`, `corpusSources` and `corpusHistory` hold the owner's own language research (words, roots, dialect forms, example sentences, sources cited), written in his own words; nothing is imported from Radheef or any other dictionary. Read and written only by corpus editors: platform admins, or a `roles/{email}` entry with `corpus: true` (set or removed by platform admins only); reading goes through one rules function, `corpusReader()`, so it can be opened up later on purpose. No personal data beyond the editors' emails in who-changed-what fields and a short speaker label on a dialect form (at most 60 characters, like 'elder, Hithadhoo'; the app and the rules refuse phone numbers and emails there; never a full name). Every write adds a `corpusHistory` entry (before and after, by, server time) in the same batch, and the rules check it was written (`historyId`); history is append-only (no update or delete), so deleting an entry keeps its last content. Exported as JSON on the editor's own device only. Checked by `pnpm test:rules`. |
| Third parties | OpenStreetMap tiles (each viewer's IP address goes to OSM). When a viewer outside Kulhudhuffushi shares their location, the map loads the roads around them from the OSM Overpass API (overpass-api.de, then overpass.kumi.systems as a mirror; only a position **rounded to about 1 km** is sent, with their IP address) and from OpenFreeMap vector tiles (tiles.openfreemap.org, which sees the viewer's IP and the map area, like the OSM tiles). In the Greater Malé area, the map reads live RTL bus positions from RTL's public feed (bo.rtl.mv:4455), which sees the viewer's IP address; nothing about the viewer is sent, and nothing is stored. The exact location never leaves the device, and nothing is stored. Place-name data from the Kulhudhuffushi City Council map (via mapkf, used with permission). Fonts are self-hosted. The "Share pickup" link opens mapkf.vercel.app with the pickup coordinates in the URL, but only when the operator chooses to share it. |
| Logging / audit | None yet. Production needs an audit trail for assignments, reopens, suspensions and admin changes. |

## Gates

| Gate | Status | Date | Approver | Notes |
|------|--------|------|----------|-------|
| 1 Initiation | Not started | | | Business case, scope, risk register and data classification needed before real data is used. |
| 2 Design | Not started | | | Firebase design (eFaas → Firebase Auth custom token, Firestore rules, region) to be reviewed. |
| 3 Testing | Not started | | | Tier 1: SAST, DAST, pen test, SBOM, OWASP Top 10, WCAG. |
| 4 Deployment | Not started | | | Rollback plan, monitoring, MDS notification. |

## Blockers before real data or production

- [x] Roles (admin, operator) enforced server-side in Firestore rules.
- [ ] eFaas sign-in to replace Google sign-in (exception 1).
- [x] Firebase project `kd-taxiq` and Firestore (Singapore) created, rules locked.
- [ ] Approval for storing data in Singapore (no Maldives region).
- [ ] Firebase SDK on the MDS-whitelisted dependency list, or an exception requested.
- [ ] maplibre-gl (BSD-3) and lucide-react (ISC, icons) on the MDS-whitelisted dependency list, or an exception requested.
- [ ] Data classification, retention rules for passenger details and GPS tracks, and a privacy notice.
- [ ] Audit logging of dispatch and admin actions.
- [ ] SBOM generated each release.

SBOM: not generated yet. Direct dependencies are in `package.json` (react, react-dom, firebase, maplibre-gl,
lucide-react, @fontsource/noto-sans-thaana; build-time: vite, tailwindcss, typescript, oxlint, vitest), with versions locked in `pnpm-lock.yaml`.
Exceptions:

| # | Criterion | Exception | Compensating controls | Approval | Remediation |
|---|-----------|-----------|-----------------------|----------|-------------|
| 1 | 4.1.5 / 4.2: authentication via eFaas | Google sign-in (Firebase Auth) instead of eFaas, decided by the product owner on 2026-11-04 | Staff allow-list (`roles/{email}`) enforced in Firestore rules; verified email required; least-privilege roles; API key restricted to TaxiQ domains | **Pending:** written approval from the gate approver and MDS is required (SWM 3.2) | Move to eFaas (OIDC → Firebase custom token) before real data. Target ≤ 90 days. |
