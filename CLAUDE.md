# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TaxiQ v2 is a visual model of the physical taxi queue at a call center. The operator calls a ride on the radio, and drivers who want it answer with their center number (`taxiNo`, e.g. 34). The operator taps each one who answers, which slides their row left and uncovers an Assign button in the gap. The slid-left driver *highest in the queue* is highlighted as the suggestion, but any of them can be assigned. **Assigning finishes the call**: the taxi moves to the back, and every slid card returns to normal. If something happens to the driver before the trip is completed, the operator **reopens** that dispatch from Recent dispatches: the driver gets their old place back, and the call returns with its passenger details and the other answering drivers. A **suspended** driver (misconduct, unpaid fees) shows the red side of their card, like a flipped physical tag. They keep their place in the queue but can't answer or be assigned. Each call can carry passenger details, and the pickup can be chosen with the house search. The app is bilingual (English/Dhivehi) and has an Admin view for registering and removing taxis.

`v2` is the **default branch**, a rewrite in React 19 + TypeScript + Vite + Tailwind CSS v4. Branch from and open PRs against `v2`. The `v1` branch (formerly `main`) holds the Angular 15 v1, so don't diff against `v1` expecting related code. There is no `main` branch.

## Commands

Use pnpm (the repo has `pnpm-lock.yaml` and a local `.pnpm-store`).

```sh
pnpm install
pnpm dev       # Vite dev server, http://localhost:5173
pnpm build     # tsc -b (type-check app + node configs) then vite build to docs/
pnpm lint      # oxlint (not ESLint), config in .oxlintrc.json
pnpm test      # Vitest: core engine and validation tests (*.test.ts)
pnpm exec vitest run src/core/queue.test.ts -t "undo"   # one file / one test
pnpm preview   # serve the built docs/
pnpm deploy    # build + deploy docs/ to Firebase Hosting (needs the firebase CLI, logged in)
```

`pnpm build` is the type-check gate, since `tsc -b` runs before the Vite build. CI (`.github/workflows/ci.yml`) runs lint, test and build on every push to `v2`/`v3` and on PRs.

## Branches and plans

- **`v3`** is the active development branch (core engine + API, see `plans/`). `v2` is the default branch and the source of the live sites; keep it working until v3 Phase 4.
- `plans/` holds the v3 plans (read `plans/README.md` first). Notes go there, never in `docs/` (build output).
- Ask Hussain before changing the stack, the data model or the plans.

## API server (`server/`, v3)

`server/` is a pnpm workspace package: Fastify + PostgreSQL (`pg`) + `jose`, run with `tsx`. It imports the core engine straight from `../src/core`, and the allow-list helpers from `../src/validate.ts`. Read `server/README.md` and `server/openapi.yaml`.
- Every center (tenant) has its own rows, keyed by `center_id`. The schema is in `server/migrations/*.sql`, applied by `migrate()`; add a new numbered file for every change and never edit an applied one.
- `access.ts` decides who may do what: platform roles (`dev`, `system_admin`) plus center staff roles (`owner`, `partner`, `manager`, `operator`), and drivers through `memberships`. Every route calls `require(...)`. `identity.ts` is the auth adapter: Firebase ID tokens now, eFaas later.
- `queueStore.ts` loads a center's queue with `SELECT ... FOR UPDATE`, applies a core rule, and saves it, all inside `tx()`. `offerStore.ts` does the same for ride offers. `sweepTimedOut` (run from `main.ts`) moves offers on after `OFFER_SECONDS` on the server.
- Every change writes `audit()`. Errors are `ApiError(status, code)` and return `{error: code}` only.
- Tests: `server/test/api.test.ts` drives the API with `app.inject` against a real PostgreSQL (`TEST_DATABASE_URL`). It covers each role's permissions and isolation between centers. Update `openapi.yaml` with every route change.
- **v3 web app (`src/v3/`)**: when the build has `VITE_API_URL` set, `main.tsx` renders `V3App` instead of the v2 `App`, and every screen talks only to the API. The pieces:
  - `api.ts`: `apiCall` attaches the Firebase ID token; `usePoll` refreshes every 2 s (there's no realtime channel yet, so polling until WebSocket); `useAction` runs a write and refreshes.
  - The **Act as** switcher in `V3App` offers only the roles that `GET /v1/me` reports (citizen, driver per membership, center per staff role, system admin). It changes the view only; the API checks every action.
  - Screens: `CitizenScreen` (hire, apply to drive, register a center), `DriverScreen` (offers), `CenterScreen` (tabs by role: Queue, Drivers, Staff, Subscriptions, Reports), `PlatformScreen` (approve centers). Strings are in `strings.ts`, English and Dhivehi with the same keys.
  - **Real GPS (Phase 5):** in `DriverScreen`, **Go online** turns on `useGpsSharing` (`watchPosition`, sends every 4 s, keeps the screen awake). The server keeps only the latest position per driver (`server/migrations/002_positions.sql`, `routes/positions.ts`). `livePositions.ts` (`apiPositionSource`) polls `/v1/centers/:id/positions` and glides the cars using `src/core/motion.ts`. `MapView` takes a `positionSource` prop (default: the simulation), and it only shows taxis that have a position, so offline or stale taxis disappear.
  - Without `VITE_API_URL`, the v2 Firebase app runs unchanged.
  - Deploying v3 to Firebase Hosting needs the API origin added to `connect-src` in `firebase.json`, and the web origin in the server's `CORS_ORIGINS`.

## Architecture

- **Core engine (`src/core/`)**: the queue and offer rules as pure functions, with no React, UI or Firebase imports. `queue.ts` covers normalizeOrder, toggleInterest, assign, undo/canUndo, reopen, onSuspend, removeTaxi and driverToBack. `offers.ts` covers nextTaxi, startOffer, moveOffer, offerTimedOut and canAccept. Each action returns the new `{order, interested}`, or `null` when it isn't allowed. Every client calls these functions: the demo hook, the live Firestore hook, `rides.ts`, and later the API server. Change a rule here, add a test, and keep `firestore.rules` matching it.

- There is no backend and no router. `src/main.tsx` wraps `App.tsx` in `I18nProvider`. `App` switches between three views with a local `view` state: the queue, `MapView` and `AdminPanel`. `MapView` is lazy-loaded, so Leaflet only downloads when the Map tab opens.
- All queue state lives in the `useQueue` hook (`src/useQueue.ts`):
  - `queue` is every registered taxi, in rank order.
  - `interested` is the set of drivers who answered the current call.
  - `call` is the passenger details for the call being taken (`CallInfo`). It is memory only.
  - `pick` is derived: the first taxi in `queue` that is in `interested`. Suspended taxis can never be in `interested`.
  - `history` is the dispatch log, capped at 30 and in memory only. Each `Dispatch` stores the taxi's old index (`from`), the interested set and the call.
  - The actions are `toggle`, `clear`, `assign`, `undo`, `reopen`, `suspend`, `lift`, `register`, `remove` and `reset`.
- **Undo** (latest dispatch only) takes a dispatch back as if it never happened: same index, same answered drivers, same call details. It is allowed only while `history[0].exact` is true.
- **Reopen** (any dispatch not yet reopened) moves the driver back to `from`, clamped to the queue length. It restores the call and the other answered drivers, but not the reopened driver. The entry is marked `reopened` and kept in the log. A reopen or a removal sets `exact: false` on the other entries, because their indexes may no longer match. Both undo and reopen are blocked while a call is in progress, so they never overwrite the call being taken.
- **Persistence:** full taxi records, including an optional `suspended` record (reason, note, time), are saved in `localStorage` under the key `taxiq.queue.v3`. Call details and the dispatch log are never saved. On load, each record goes back through `parseStoredTaxi`, and anything invalid or duplicated is dropped. Bump the key if the stored shape changes. The language choice is saved under `taxiq.lang`.
- **Validation:** `src/validate.ts` is the single set of allow-list rules. Both the admin form and the stored-data loader use it, and center numbers and registrations must be unique. Free text (call details, suspension notes) uses `isFreeText`: letters in any script, digits and basic punctuation, up to 120 characters. Invalid call details block Assign. Change the rules there, not in the components.
- **i18n:** `src/i18n.tsx` holds every UI string, in `en` and `dv`. Add new strings to both. Choosing Dhivehi sets `<html dir="rtl" lang="dv">`, so use logical utilities (`text-start`, `ms-*`/`me-*`) for anything that should mirror. The slide-left animation and its `pl-20` gutter are deliberately physical, so rows slide left in both languages. Each driver has `name` and `nameDv`; display it with `driverName()`. Fonts are self-hosted in `src/fonts/` (copied from the `kudadonbe.v3` repo): **MV Bodu** for all headings (`h1`–`h3`, via `--font-heading`) and **Dhanbumaa** for body text. Noto Sans Thaana (`@fontsource`) is the fallback. Their `@font-face` rules in `src/index.css` use a Thaana-only `unicode-range`, because these fonts have no Latin letters. Latin text uses the system font, and the font files only download when Dhivehi is on screen.
- **Map:** `MapView` drives Leaflet imperatively. Markers are kept in a ref and moved with `setLatLng`, so position updates never re-render React. Marker content is built with `textContent`, never HTML strings. Tiles come from tile.openstreetmap.org, which means each viewer's IP address goes to OSM. Markers are top-down car SVGs rotated to the heading every frame, with an upright number label. Positions come from `subscribePositions` in `src/positions.ts`. That is a **placeholder** that simulates taxis on **Kulhudhuffushi's** real road graph (`src/data/roads.json`). Each taxi takes random turns at junctions and avoids U-turns. Regenerate the road graph with `scripts/build-roads.py`; the OpenStreetMap download command is in its docstring. The real feed (driver app → server → WebSocket, with eFaas login) must replace that one function and keep the same `Position` shape.
- **Place search:** `src/places.ts` searches `src/data/places.json`, which holds 3,914 Kulhudhuffushi houses, roads, landmarks and plots with English and Dhivehi names and plot numbers. The data comes from the **Kulhudhuffushi City Council** map via mapkf.vercel.app by emjey, used with permission. Keep the credit in the map attribution and the README. The file is lazy-loaded on the search box's first focus. `scripts/import-places.py` rebuilds it, converting the site's chart positions to lat/lng with the site's own `GEO` constants. Road points line up with OSM roads to a median of about 4 m. Selecting a place drops a pin (or highlights the road) and lists the 3 nearest taxis, refreshed every second.
- **Plot map and labels:** `src/data/plots.json` holds the Kulhudhuffushi City Council plot chart **redrawn as vector polygons**: 3,419 plots with their ward colours. It is used with permission. Each plot carries the houses inside it (`h`, as [English, Dhivehi]) and its plot number, and 3,083 of the 3,227 houses are matched. `scripts/build-plots.py` builds it by tracing the chart's zoom-6 tiles from mapkf with OpenCV. Setup and download steps are in its docstring; numpy, OpenCV and shapely are dev-only tools, not app dependencies. `src/components/plotLayer.ts` draws the plots on a canvas renderer, and tapping a plot opens a popup built with `textContent`. The map zooms to 22, with OSM tiles upscaled past 19. Lazy-loaded data: `plots.json` (~200 KB gzipped) loads when the Map opens with "Plot map" on, which is the default. House and landmark labels appear at zoom 18+, only for what's in view and at most 400. They grow with zoom via `--map-label-size` and are styled by `.map-label` in `index.css`.
- **Call details:** `CallPanel` sits above the queue and stays collapsed to a one-line summary. `PlaceInput` suggests houses and roads, and picking one sets `pickupAt`. The Map shows that pickup as a green pin with the nearest available taxis. `DispatchLog` shows each dispatch's details, Reopen, and **Share pickup**. Share pickup sends a mapkf.vercel.app `?at=lat,lng` link, so the driver sees the house on the council map.
- **Who sees what** (`App.tsx`, from the host and the role):
  - **demo:** the GitHub Pages host. Operator screens on local data.
  - **staff:** admin or operator. Queue, Map, and Admin (admins only), plus the Passenger requests panel.
  - **driver:** role `driver` with a `taxiId`. The Driver screen (offers with Accept/Decline, accepted rides) and the Map.
  - **public:** signed out, or signed in without a role. The Hire a taxi panel and the public map, with no tabs.
  - **dev:** role `dev`, full access for testing. Every tab (Queue, Map, Admin, Driver, Hire). On the Driver tab, a dev can act as the driver of any taxi by setting `taxiId` on their own roles entry. In the rules, `dev` counts as admin and staff, and as a driver for its chosen taxi.
- **Hiring (no server):** `src/rides.ts` and `src/useRides.ts`. Each passenger has one request at `requests/{uid}`. A **queue** request is offered to the first taxi in `queue/state.order` that isn't suspended and hasn't been skipped. A **direct** request (a car tapped on the map) goes to that taxi only, and if it isn't accepted the passenger can send it to the queue. Each offer lasts `OFFER_SECONDS` (20). Every screen watching the request (the passenger, drivers, staff) calls `moveOn` after it times out; the rules let only one succeed, because they check `request.time`. `acceptRide` runs in one transaction: it marks the request accepted, moves the driver's taxi to the back, and logs a dispatch with a `requestId`. `firestore.rules` is the referee, so keep it in sync with any change to this flow. `publicTaxis/{id}` is the public projection of `taxis` (no phones); admin sessions keep it in sync automatically in `useLiveQueue`.
- **Two modes, one interface:** `App` picks the queue implementation from the sign-in state. Both return the same `QueueApi` (defined in `useQueue.ts`):
  - **Demo:** `useLocalQueue` in `useQueue.ts`. Signed out, or signed in without a staff role. It keeps state in this browser, and this is all the GitHub Pages copy can do.
  - **Live:** `useLiveQueue.ts`. Signed-in staff. It uses Firestore: `taxis/{id}`, `queue/state` (`{order, interested}`), and `dispatches/{id}` (never deleted; undo and reopen set `undone` or `reopened`). Every change to the order runs in `runTransaction`. Undo is exact only while the taxi is still last in the order. The call draft stays local to each operator until Assign writes it into the dispatch.
- **Auth:** `src/auth.tsx` handles Google sign-in through Firebase Auth. This is an **MDS exception** to eFaas, recorded in `SECURITY.md`. It loads `src/firebase.ts` dynamically, so the SDK isn't in the main bundle. The role comes from `roles/{email}`, which admins manage in `StaffPanel` (Admin tab). The first admin's entry has to be created in the Firebase console. In live mode, operators don't see the Admin tab, and the rules enforce the same split. `src/firebaseConfig.ts` holds the public web config; the API key is restricted to the TaxiQ domains and localhost:5173/4173. When adding any new remote origin, update the CSP in `firebase.json`.
- **Seed data:** `src/data/taxis.ts` holds the default taxis, used on first run and by Reset. Its phone numbers are masked. The Admin list shows them with a **Demo** badge.
- **Deploy:** the build output is `docs/` (Vite empties it on every build, so never hand-edit it or put other files there), and it is published in two places:
  - **Firebase Hosting**, project `kd-taxiq` (`.firebaserc`), at https://kd-taxiq.web.app. Deploy with `pnpm deploy`. `firebase.json` serves `docs/` and sets the security headers (CSP, HSTS, nosniff, referrer policy, no framing). When adding a third-party origin (e.g. Firestore or eFaas), add it to the CSP or it will be blocked. **Firestore** (default database, Native mode, `asia-southeast1` Singapore, delete protection on) holds the live data. Deploy rules with `firebase deploy --only firestore:rules`. Never loosen the rules to `if true` or to any signed-in user: access must always go through `roles/{email}`.
  - **GitHub Pages**, serving `docs/` from the `v2` branch, at https://kudadonbe.github.io/TaxiQ/. It updates when `docs/` is committed and pushed.
  `vite.config.ts` uses `base: './'`, so the same build works at both the Firebase root and the Pages `/TaxiQ/` path.
- **Mobile:** the layout targets phones first (~375 px). On small screens the queue rows hide the plate and avatar, the queue count moves into the Queue tab, and tap targets are at least 40 px. Keep the `pl-20` gutter, because the Assign button needs it.
- **Styling:** Tailwind v4 through the `@tailwindcss/vite` plugin. There is no `tailwind.config`; theme tokens go in the `@theme` block in `src/index.css`.

## Conventions

- TypeScript is strict about unused code (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`). Use `import type` for type-only imports, and don't use enums or parameter properties.
- Code style is 2-space indent and single quotes in TS, with no semicolons. See `.editorconfig`.

## Security standard

The workspace requires the MDS Secure Software Development Standard (see `../CLAUDE.md` and `kudadonbe/standards/mds/checklist.md`). `SECURITY.md` is in the **repo root**, because `docs/` is the Pages build output. It records **Tier 1 for the planned system** (public-facing, with personal data) and lists the blockers before real data. Update it when adding auth, a backend or real data.
- The admin panel has **no authentication**, since there is no server to enforce it. Any real deployment needs a backend with eFaas login, and the client-side panel must not be treated as access control.
- Real phone numbers, photos and other personal data must not go into the seed file or the repo.
