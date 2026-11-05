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
| Location data (v3 API) | Drivers share GPS only while they choose **Online**, and only from the Driver screen while it is open. The server keeps **only each driver's latest position** (`driver_positions`, one row per driver, overwritten on every update, no history). Going offline clears the location. Positions older than 120 s are never served. The public map gets center number, position and heading only. Updates arrive at most every 2 s. Retention: none beyond the latest point. Before keeping trip tracks, define a retention period and a privacy notice. |
| Data at rest | **Live mode (staff):** taxis, the queue state and the dispatch log, including passenger details, are in Firestore (Singapore), encrypted at rest by Google. **Demo mode:** taxis and the queue order are in the browser's `localStorage`; passenger details and the log stay in memory. |
| Input validation | Allow-list rules in `src/validate.ts` for taxi records, suspension notes and call details. The same rules re-validate anything read back from `localStorage`. |
| Output encoding | React escapes all text. Map markers and tooltips are built with `textContent`. The only `innerHTML` is static SVG with no user data. |
| Third parties | OpenStreetMap tiles (each viewer's IP address goes to OSM). Place-name data from the Kulhudhuffushi City Council map (via mapkf, used with permission). Fonts are self-hosted. The "Share pickup" link opens mapkf.vercel.app with the pickup coordinates in the URL, but only when the operator chooses to share it. |
| Logging / audit | None yet. Production needs an audit trail for assignments, reopens, suspensions and admin changes. |

## Permissions and approvals

Reported by the product owner on 2026-11-05 (see `plans/decisions.md`, D5). File the written references here.

| From | Covers | Reference | Date |
|------|--------|-----------|------|
| Ministry | TaxiQ operating as a taxi platform/app | _pending_ | |
| Ministry | One taxi working with more than one center | _pending_ | |
| Ministry | Shared rides and paid private rides | _pending_ | |
| Council(s) | Use of available map, plot and house-name data | _pending (name the councils)_ | |

These don't replace the MDS gates or the eFaas and data-residency items below.

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
- [ ] Data classification, retention rules for passenger details and GPS tracks, and a privacy notice.
- [ ] Audit logging of dispatch and admin actions.
- [ ] SBOM generated each release.

SBOM: not generated yet. Direct dependencies are in `package.json` (react, react-dom, leaflet,
@fontsource/noto-sans-thaana; build-time: vite, tailwindcss, typescript, oxlint), with versions locked in `pnpm-lock.yaml`.
Exceptions:

| # | Criterion | Exception | Compensating controls | Approval | Remediation |
|---|-----------|-----------|-----------------------|----------|-------------|
| 1 | 4.1.5 / 4.2: authentication via eFaas | Google sign-in (Firebase Auth) instead of eFaas, decided by the product owner on 2026-11-04 | Staff allow-list (`roles/{email}`) enforced in Firestore rules; verified email required; least-privilege roles; API key restricted to TaxiQ domains | **Pending:** written approval from the gate approver and MDS is required (SWM 3.2) | Move to eFaas (OIDC → Firebase custom token) before real data. Target ≤ 90 days. |
