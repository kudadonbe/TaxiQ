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
pnpm preview   # serve the built docs/
```

There is no test runner set up yet. `pnpm build` is the type-check gate, since `tsc -b` runs before the Vite build.

## Architecture

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
- **Call details:** `CallPanel` sits above the queue and stays collapsed to a one-line summary. `PlaceInput` suggests houses and roads, and picking one sets `pickupAt`. The Map shows that pickup as a green pin with the nearest available taxis. `DispatchLog` shows each dispatch's details, Reopen, and **Share pickup**. Share pickup sends a mapkf.vercel.app `?at=lat,lng` link, so the driver sees the house on the council map.
- **Seed data:** `src/data/taxis.ts` holds the default taxis, used on first run and by Reset. Its phone numbers are masked. The Admin list shows them with a **Demo** badge.
- **Deploy:** GitHub Pages serves the `docs/` folder of the `v2` branch at https://kudadonbe.github.io/TaxiQ/. `docs/` is build output: Vite empties it on every build, so never hand-edit or put other files there. To publish, run `pnpm build` and commit `docs/` along with the source. `vite.config.ts` uses `base: './'` so the site works under the `/TaxiQ/` path.
- **Mobile:** the layout targets phones first (~375 px). On small screens the queue rows hide the plate and avatar, the queue count moves into the Queue tab, and tap targets are at least 40 px. Keep the `pl-20` gutter, because the Assign button needs it.
- **Styling:** Tailwind v4 through the `@tailwindcss/vite` plugin. There is no `tailwind.config`; theme tokens go in the `@theme` block in `src/index.css`.

## Conventions

- TypeScript is strict about unused code (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`). Use `import type` for type-only imports, and don't use enums or parameter properties.
- Code style is 2-space indent and single quotes in TS, with no semicolons. See `.editorconfig`.

## Security standard

The workspace requires the MDS Secure Software Development Standard (see `../CLAUDE.md` and `kudadonbe/standards/mds/checklist.md`). `SECURITY.md` is in the **repo root**, because `docs/` is the Pages build output. It records **Tier 1 for the planned system** (public-facing, with personal data) and lists the blockers before real data. Update it when adding auth, a backend or real data.
- The admin panel has **no authentication**, since there is no server to enforce it. Any real deployment needs a backend with eFaas login, and the client-side panel must not be treated as access control.
- Real phone numbers, photos and other personal data must not go into the seed file or the repo.
