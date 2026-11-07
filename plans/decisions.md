# TaxiQ — decision log

Decisions made by Hussain (product owner). Newest first. Plans in this folder follow these; where a
plan says otherwise, this log wins.

## 2026-11-07

| # | Decision | Effect |
|---|----------|--------|
| D6 | **v3 is an API-first core engine** for the whole vehicle economy: identity and organisations, vehicles, hire, **leasing**, **bank and ledger**, pricing, management, places, tracking, events. Every app (web, driver, game, back offices, partners) is a client of the API. | New plan: [v3 core engine](v3-core-api.md). **Refines D4:** the engine keeps contracts, schedules and an append-only ledger; real money moves only through a licensed partner, added later; the game uses play money. |

## 2026-11-05

| # | Decision | Effect |
|---|----------|--------|
| D1 | Hussain is creating a **dedicated VPS** for production. | Phase 7 moves forward. |
| D2 | **Build the v3 API directly for the VPS** (Node.js + TypeScript + PostgreSQL, using `src/core`). No Cloud Functions, no Firebase Blaze plan. | Phase 2 targets the server in `server/`. Firebase stays as the test/demo site until the web app moves onto the API (Phase 4). |
| D3 | **Roles:** the table below. | Data model and API permissions. |
| D4 | **Subscriptions are recorded only**; drivers pay their center. No money handled in the app. | `subscriptions` table; links to "unpaid fees" suspension. |
| D5 | **Permissions held** (written references to be filed): Ministry approval for the platform, multi-center taxis, and shared + private fares; council permission to use available map and house data. | Multi-center membership (M7) and ride sharing (Phase 10) are no longer regulation-gated. Malé and other council data can be requested/used. Record reference numbers in `SECURITY.md` when filed. |

### Roles (D3)

| Level | Role | Can do |
|-------|------|--------|
| Platform | `dev` | Everything, for development and testing only. **Never in production.** |
| Platform | `system_admin` | Approve or reject centers, block accounts platform-wide. |
| Center | `owner` | Run the center: staff, drivers, vehicles, settings, subscriptions, reports. |
| Center | `partner` | Read-only reports (trips, subscriptions, income records). No queue control. Covers partners and shareholders. |
| Center | `manager` | Approve drivers and vehicles, suspend and lift, subscriptions, reports, plus everything an operator does. |
| Center | `operator` | Run the queue and dispatches; see and cancel passenger requests. |
| Center | `driver` | Member of the center with an approved vehicle: offers, trips, GPS. |
| — | `vehicle_owner` | Owns a vehicle record and assigns its driver(s), when the owner isn't the driver. |
| Public | `citizen` | Any signed-in user: hire and track rides. |

A person can hold several roles (e.g. owner of one center and driver in another). The role switcher
only changes the view; every action is checked on the server.
