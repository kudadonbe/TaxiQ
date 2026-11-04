# TaxiQ v3 - Core Engine Implementation Plan

Status: draft plan. Created 2026-11-04. Owner: Hussain Shareef.

Read with: `CLAUDE.md`, `TaxiQ v2 - Core API and Hosting Plan`, `taxiq-multi-center-platform.md`, `taxiq-ride-sharing-brief.md`, `taxiq-male-map-plan.md`.

> All durations, costs and sizes are **estimates** to plan with. Replace them with real numbers as they become known.

## 1. What v3 is

| Version | What it was |
| --- | --- |
| v1 | Taxi queue (Angular) |
| v2 | Taxi operations in one app: citizen, driver, operator, admin (React + Firebase) |
| **v3** | **Core engine and API.** Taxi centers register as tenants, get API keys, and any number of client apps connect to it |

The name stays **TaxiQ** for now. The queue is still the heart of the engine. A rename can happen later without changing the architecture.

## 2. Goals and success criteria

**Goals**

1. One core engine owns all queue, dispatch, role and tenant rules.
2. Any number of centers (tenants) run separate queues on the same engine.
3. Any client app (the TaxiQ web app, a center's own app, a driver app) uses the same versioned API.
4. Test on Firebase, run production on a dedicated VPS, and scale the VPS as usage grows.

**v3 is done when**

- [ ] The v2 web app runs entirely on the v3 API, with no direct database logic left in the browser.
- [ ] At least one real taxi center runs its daily queue on v3 (pilot).
- [ ] A second client (a center app or driver app) works using only the public API docs.
- [ ] Tenant isolation is proven by automated tests.
- [ ] Production runs on the VPS with backups, monitoring and a tested restore.
- [ ] Security and regulation checks are cleared before real personal data goes in.

## 3. Architecture

- **Core engine:** pure TypeScript domain module. Queue, offers, accept, assign, undo, reopen, suspend, membership, permits, privacy levels, fares. No UI, no Firebase imports.
- **Storage adapter:** `Store` interface. Firestore adapter for testing, PostgreSQL adapter for the VPS.
- **Realtime adapter:** Firestore listeners for testing, WebSocket on the VPS.
- **Identity adapter:** Google sign-in for testing, eFaas for production.
- **API layer:** REST, versioned `/v1`, documented with OpenAPI. WebSocket channel for live queue and positions.
- **Tenants:** each center is a tenant. Every request carries one tenant scope.
- **Clients:** thin. They show data and send commands. They never decide outcomes.
- **Audit log:** every state change is recorded with who, when, tenant and before/after.

### Access types

| Caller | How it authenticates | Can do |
| --- | --- | --- |
| Citizen | User login | Request rides, track own trip |
| Driver | User login + approved driver profile | Go online, accept offers, send GPS |
| Operator | User login + center staff role | Run that center's queue |
| Center app | Tenant API key / client credentials | Act for that center only |
| System admin | User login + platform role | Approve centers, block accounts |

## 4. Work breakdown

### Phase 0 - Foundations and legal check

- Create the v3 branch and repo structure (monorepo: `core`, `api`, `web`, `driver`, `docs`).
- Write the domain model and API contract draft.
- Send regulation questions to the Ministry. Read the current Taxi Regulation and amendments.
- Decide database, VPS provider and location (data residency).
- **Deliverable:** approved architecture, API draft, legal question list sent.

### Phase 1 - Extract the core engine

**Status (2026-11-05): done on `v3`.** `src/core/queue.ts` and `src/core/offers.ts` hold the rules as pure functions with Vitest tests (43 passing). The demo queue, the live queue and the ride offers all call them, and CI runs lint, test and build. Next: the multi-tenant model (Phase 2), which needs decisions (Blaze plan for Cloud Functions, data model approval).

- Move queue logic from `useQueue`, `useLiveQueue`, `rides.ts` into `core`.
- Add a unit test runner (for example Vitest). Cover every queue action.
- **Deliverable:** core module with tests, v2 still working.

### Phase 2 - Multi-tenant model and API v1 (Firebase)

- Centers, staff, memberships, per-center queues, vehicles, permits.
- API v1 on Cloud Functions using the Firestore adapter.
- Tenant API keys, rate limits, audit log.
- Firestore rules test suite for tenant isolation.
- Migration script: current data becomes the first center.
- **Deliverable:** working API v1 on Firebase, OpenAPI docs.

### Phase 3 - Identity, roles and registration

- One account, role switcher (citizen / driver / operator), permissions enforced in the core.
- Center registration and admin approval.
- Driver application, vehicle registration, center approval, expiry checks.
- Subscriptions recorded per center.
- **Deliverable:** full onboarding flow for centers and drivers.

### Phase 4 - v2 app becomes the first v3 client

- Web app calls the API only. Remove direct Firestore writes.
- Operator, driver, citizen and admin screens on the API.
- **Deliverable:** v2 UI running on v3 core.

### Phase 5 - Real GPS and driver app

- Driver app (installable web app first; native later only if background GPS requires it).
- Real positions replace `src/positions.ts` simulation, same `Position` shape.
- Smooth movement, stale-position handling, location retention policy.
- **Deliverable:** real taxis moving on the map.

### Phase 6 - Pilot with one center

- Pick one center (Kulhudhuffushi recommended, map data already done).
- Train operators and drivers. Run in parallel with the radio process first.
- Collect issues weekly. Fix and release.
- **Deliverable:** pilot report with real usage numbers.

### Phase 7 - Move to the VPS

- PostgreSQL adapter, WebSocket realtime, API server.
- Reverse proxy with TLS, firewall, backups, monitoring, alerts, log rotation.
- Load test using pilot numbers.
- Migrate data from Firestore. Switch clients by changing the API base URL.
- Tested restore from backup.
- **Deliverable:** production on VPS, Firebase kept for testing.

### Phase 8 - Public API and developer access

- Developer docs site, tenant self-registration for API keys, sandbox tenant.
- API versioning policy and deprecation rules.
- Example client (small center app).
- **Deliverable:** a second client built from the docs alone.

### Phase 9 - Malé map and city view

- Malé roads, buildings and place names (see Malé map plan; depends on permissions).
- City setting so Kulhudhuffushi and Malé both work.
- Operator city view: demand and fleet layers.
- **Deliverable:** Malé available as a second city.

### Phase 10 - Ride sharing and private rides (gated)

- Only after the Ministry confirms shared rides and private pricing are allowed.
- Passenger counts, privacy levels, seat transactions, hidden-taxi enforcement.
- **Deliverable:** shared and private rides behind a per-center setting.

## 5. Timeline (Gantt)

Assumes start **Mon 9 Nov 2026**, Hussain working about **15-20 hours a week** with an AI developer agent. One week per column block.

| Phase | Weeks | Start | End |
| --- | --- | --- | --- |
| 0 Foundations and legal | 1-3 | 9 Nov 2026 | 27 Nov 2026 |
| 1 Extract core engine | 2-6 | 16 Nov 2026 | 18 Dec 2026 |
| 2 Multi-tenant + API v1 | 5-11 | 7 Dec 2026 | 22 Jan 2027 |
| 3 Identity, roles, registration | 9-14 | 4 Jan 2027 | 12 Feb 2027 |
| 4 v2 app on v3 API | 12-16 | 25 Jan 2027 | 26 Feb 2027 |
| 5 Real GPS + driver app | 14-20 | 8 Feb 2027 | 26 Mar 2027 |
| 6 Pilot (one center) | 20-25 | 22 Mar 2027 | 30 Apr 2027 |
| 7 Move to VPS | 22-28 | 5 Apr 2027 | 21 May 2027 |
| 8 Public API + dev access | 27-33 | 10 May 2027 | 25 Jun 2027 |
| 9 Malé map + city view | 28-37 | 17 May 2027 | 23 Jul 2027 |
| 10 Sharing + private (gated) | 34-40 | 28 Jun 2027 | 13 Aug 2027 |

Bar view (each character = 2 weeks):

```
Phase                 Nov  Dec  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug
0 Foundations         ██
1 Core engine          ███
2 Tenants + API           ████
3 Roles + registration      ███
4 v2 on v3 API                 ███
5 Real GPS                       ████
6 Pilot                              ███
7 VPS                                  ████
8 Public API                              ████
9 Malé map                                 █████
10 Sharing (gated)                             ████
```

**Total:** about 40 weeks, mid-August 2027. Full-time work could roughly halve this.

### Milestones

| Milestone | Target |
| --- | --- |
| M1 Architecture and API draft approved | 27 Nov 2026 |
| M2 Core engine extracted with tests | 18 Dec 2026 |
| M3 API v1 live on Firebase | 22 Jan 2027 |
| M4 v2 app fully on v3 API | 26 Feb 2027 |
| M5 Pilot starts | 22 Mar 2027 |
| M6 Production on VPS | 21 May 2027 |
| M7 Public API opened | 25 Jun 2027 |
| M8 Malé live | 23 Jul 2027 |

### Critical path

Core engine -> tenant model and API -> v2 app on API -> real GPS -> pilot -> VPS. Delays here delay everything. Malé map and ride sharing depend on outside permissions and can slip without blocking the core.

## 6. Resources

### People

| Role | Who | Time |
| --- | --- | --- |
| Product owner, lead developer | Hussain | 15-20 h/week |
| Developer agent (AI) | Claude Code / coding agent | Daily, supervised |
| Pilot center contact | One operator from the pilot center | 1-2 h/week during pilot |
| Test drivers | 3-5 drivers | During Phases 5-6 |
| Dhivehi reviewer | Native speaker | One-off, before pilot |
| Legal / regulation advice | Ministry contact, optional lawyer | As needed, Phase 0 and 10 |
| Security review | MDS checklist self-review, optional external | Before production |

### Infrastructure

| Item | Testing | Production (start) | Later |
| --- | --- | --- | --- |
| Hosting | Firebase (Hosting, Firestore, Functions) | 1 VPS: 4 vCPU, 8 GB RAM, 160 GB SSD | Upgrade VPS; then split database to its own server |
| Database | Firestore | PostgreSQL on the VPS | Managed or separate DB server |
| Realtime | Firestore listeners | WebSocket on the VPS | Separate realtime server |
| Backups | Firestore export | Daily off-site backups | Point-in-time recovery |
| Monitoring | Firebase console | Uptime checks, logs, alerts | Metrics dashboard |
| Map tiles | OSM public tiles | **Own tile server or a paid tile provider** (OSM public tiles are not for heavy app use) | CDN |
| Domain + TLS | kd-taxiq.web.app | Own domain, free TLS certificate | Same |
| SMS / notifications | None | SMS or push provider for offers and OTP | Same |

### Estimated running costs (rough)

| Item | Monthly estimate |
| --- | --- |
| Firebase (testing, light use) | Free tier to about USD 25 |
| VPS 4 vCPU / 8 GB | about USD 20-60 |
| Off-site backup storage | about USD 5-10 |
| Map tiles (provider) | Free tier to about USD 50, depends on usage |
| SMS / push | Depends on volume; push is near free, SMS is per message |
| Domain | about USD 1-2 (yearly fee spread) |
| **Total at start** | **about USD 30-150 per month** |

These are planning ranges only. Check current prices and Maldives data residency options before buying.

### Tools

- GitHub repo `kudadonbe/TaxiQ`, new `v3` branch.
- pnpm, TypeScript, Vite, React, Tailwind, Leaflet (kept from v2).
- Vitest for tests, Firebase emulator for rules tests.
- OpenAPI for API docs.
- Node.js server on the VPS, PostgreSQL, a reverse proxy (for example Caddy or Nginx).

### Devices

Drivers' and passengers' own phones are enough for v3. Uber, a multinational, runs on drivers' phones with no special hardware.

| Device | Purpose | When |
| --- | --- | --- |
| Driver's smartphone | GPS, offers, trip steps | Required from Phase 5 |
| Passenger's smartphone | Request and track rides | Required |
| Phone mount and car charger | Safe use while driving, battery for live GPS | Recommended from Phase 5 |
| 4G GPS tracker wired into the taxi | Tracking that works even when the phone is off | Optional, after the pilot |
| Mounted tablet | Dedicated driver screen | Optional, after the pilot |
| Call-a-taxi button at hotels, shops or stands | Passengers without the app | Optional, later |
| Operator PC or tablet with internet | Running a center's queue | Required for each center |

Not planned:

- **Apple AirTags or similar tags:** no live location feed for apps, and anti-tracking alerts would warn passengers.
- **Remote control of vehicles:** large safety and legal risks. Revisit only if regulation and hardware allow it.
- **A custom-built TaxiQ device:** reconsider only if the pilot shows phones are not reliable enough.

## 7. Risks

| Risk | Effect | Response |
| --- | --- | --- |
| Regulation blocks multi-center taxis | Membership rules change | Keep it behind a setting; one primary center per vehicle |
| Regulation blocks shared or private fares | Phase 10 cancelled or changed | Phase 10 is last and gated |
| App approval needed from Ministry | Launch delay | Ask in Phase 0 |
| Tenant data leak | Serious trust and legal issue | Isolation tests in CI from Phase 2 |
| eFaas integration delay | Production delay | Keep identity behind an adapter |
| Background GPS limits on web | Weak tracking | Native driver app as fallback |
| Malé data permission refused | Malé map limited | Start with open building data |
| Solo developer time | Schedule slip | Critical path first; gated phases can wait |
| VPS failure | Downtime | Backups, tested restore, monitoring |
| Data Protection law passes | New duties | Build consent, retention and breach steps now |

## 8. Rules for the developer agent

1. Work on the `v3` branch. Keep v2 working until Phase 4 is done.
2. The core has no UI and no Firebase imports.
3. Every action is checked in the core. Clients are never trusted.
4. Every write is scoped to one tenant and logged.
5. Write tests with each feature. `pnpm build`, `pnpm lint` and tests must pass.
6. Update the OpenAPI spec with every API change.
7. Keep English and Dhivehi strings in sync.
8. No real personal data in the repo or seed files.
9. Update `SECURITY.md` when auth, storage, hosting or data sources change.
10. Ask Hussain before changing the stack, the data model or this plan.

## 9. Open decisions

1. VPS provider and location (local or overseas, data residency).
2. Monorepo layout and package names.
3. Subscription model: who pays whom, record only or collect payments.
4. Pilot center and pilot start date.
5. Whether the name stays TaxiQ for the public API.
6. Who builds center client apps: Hussain, the centers, or both.
