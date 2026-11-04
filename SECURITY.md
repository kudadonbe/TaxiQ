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
| Hosting | Firebase Hosting (project `kd-taxiq`, https://kd-taxiq.web.app), with security headers set in `firebase.json`: CSP (self only, plus OSM tiles), HSTS, nosniff, strict referrer policy and `frame-ancestors 'none'`. Also mirrored on GitHub Pages (no custom headers). Static, HTTPS, no backend yet. |
| Auth | **None.** The admin panel and dispatch screens are open to anyone who has the link. This is acceptable only because there is no real data and no server. The production system must use **eFaas**, with authorisation enforced on the server (e.g. Firestore security rules), never only in the UI. |
| Data at rest | Taxi records, suspensions and the queue order are in the viewer's own `localStorage`. Passenger details and the dispatch log are **memory only**: they are cleared on reload and never written to storage. |
| Input validation | Allow-list rules in `src/validate.ts` for taxi records, suspension notes and call details. The same rules re-validate anything read back from `localStorage`. |
| Output encoding | React escapes all text. Map markers and tooltips are built with `textContent`. The only `innerHTML` is static SVG with no user data. |
| Third parties | OpenStreetMap tiles (each viewer's IP address goes to OSM). Place-name data from the Kulhudhuffushi City Council map (via mapkf, used with permission). Fonts are self-hosted. The "Share pickup" link opens mapkf.vercel.app with the pickup coordinates in the URL, but only when the operator chooses to share it. |
| Logging / audit | None yet. Production needs an audit trail for assignments, reopens, suspensions and admin changes. |

## Gates

| Gate | Status | Date | Approver | Notes |
|------|--------|------|----------|-------|
| 1 Initiation | Not started | | | Business case, scope, risk register and data classification needed before real data is used. |
| 2 Design | Not started | | | Firebase design (eFaas → Firebase Auth custom token, Firestore rules, region) to be reviewed. |
| 3 Testing | Not started | | | Tier 1: SAST, DAST, pen test, SBOM, OWASP Top 10, WCAG. |
| 4 Deployment | Not started | | | Rollback plan, monitoring, MDS notification. |

## Blockers before real data or production

- [ ] eFaas sign-in, with roles (operator, admin, driver) enforced server-side.
- [ ] Backend and database (Firebase planned). Confirm the data-residency region is acceptable: there is no Maldives region.
- [ ] Firebase SDK on the MDS-whitelisted dependency list, or an exception requested.
- [ ] Data classification, retention rules for passenger details and GPS tracks, and a privacy notice.
- [ ] Audit logging of dispatch and admin actions.
- [ ] SBOM generated each release.

SBOM: not generated yet. Direct dependencies are in `package.json` (react, react-dom, leaflet,
@fontsource/noto-sans-thaana; build-time: vite, tailwindcss, typescript, oxlint), with versions locked in `pnpm-lock.yaml`.
Exceptions: none.
