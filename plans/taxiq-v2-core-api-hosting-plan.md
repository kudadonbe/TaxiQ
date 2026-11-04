# TaxiQ v2 - Core API and Hosting Plan

Status: plan. Created 2026-11-04. Read with `CLAUDE.md`, `taxiq-multi-center-platform.md`, and `taxiq-ride-sharing-brief.md`.

## Confirmed decisions (Hussain)

- The taxi queue is the core of everything. It is exposed as the **TaxiQ API**.
- Taxi centers can have their own client apps. Every client app talks to the TaxiQ API.
- Firebase is for **testing only**.
- Later, the core moves to a **dedicated VPS**. Resources are added as usage grows.

## Architecture

- **Core (TaxiQ API):** owns every rule. Queue order, offers, accept, assign, undo, reopen, suspend, center membership, vehicle and permit checks, privacy levels, and fares.
- **Clients:** the TaxiQ web app and any center's own app. Clients are thin. They display data and send requests. They never decide queue outcomes.
- **No client is trusted.** Every action is checked in the core against the caller's role and center.

## Rules for the developer agent

1. Move queue logic out of React hooks (`useQueue`, `useLiveQueue`, `rides.ts`) into one core module with no UI or Firebase imports.
2. Put storage behind an interface, for example `QueueStore`. Write a Firestore adapter now, and a database adapter for the VPS later.
3. Define the API contract first: versioned (`/v1`), documented (OpenAPI), with stable IDs and error codes.
4. Real-time updates go through one channel abstraction (Firestore listeners now, WebSocket on the VPS later).
5. Auth goes through one identity interface (Google sign-in now, eFaas later).
6. Each center gets its own API key or client credentials. Every request is scoped to one center.
7. Log every state change (assign, reopen, suspend, role change) in an audit log.
8. The current web app must use the same API as outside clients. No private shortcuts.

## Phase plan

### Phase A: Firebase (testing)

- Core module plus Firestore adapter.
- API served by Cloud Functions, or Firestore rules as an interim check.
- Rules test suite for tenant isolation.

### Phase B: VPS (production)

- Same core module running as a server (for example Node.js with TypeScript).
- Database chosen for transactions, for example PostgreSQL.
- WebSocket for live positions and queue updates.
- Reverse proxy with TLS, backups, monitoring, and rate limits.
- Data migration script from Firestore.
- Client apps switch by changing only the API base URL.

### Phase C: Growth

- Add CPU, memory, and storage to the VPS as load grows.
- Measure first: requests per second, live connections, database load.
- Split services or add servers only when one VPS is no longer enough.

## Before production

- Clear the blockers in `SECURITY.md` (eFaas, data residency, dependencies).
- Confirm hosting location rules for personal and location data.
- Confirm regulation questions in `taxiq-multi-center-platform.md`.

## Open questions

1. Which VPS provider and location?
2. Which database on the VPS?
3. Will center client apps be built by Hussain, or by the centers themselves?
