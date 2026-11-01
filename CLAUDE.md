# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TaxiQ v2 is a visual model of the physical taxi queue at a call center. The operator calls a ride on the radio, and drivers who want it answer with their center number (`taxiNo`, e.g. 34). The operator taps each one who answers, which slides their row left and uncovers an Assign button in the gap. The slid-left driver *highest in the queue* is highlighted as the suggestion, but any of them can be assigned. The assigned taxi moves to the back, and the call stays open. If the driver doesn't respond, the operator reassigns to another slid-left driver, and the first driver goes back to their old place. **Done** closes the call. The app is bilingual (English/Dhivehi) and has an Admin view for registering and removing taxis.

The `v2` branch is a rewrite in React 19 + TypeScript + Vite + Tailwind CSS v4. The `main` branch still holds the Angular 15 v1, so don't diff against `main` expecting related code.

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

- There is no backend and no router. `src/main.tsx` wraps `App.tsx` in `I18nProvider`. `App` switches between the queue view and `AdminPanel` with a local `view` state.
- All queue state lives in the `useQueue` hook (`src/useQueue.ts`):
  - `queue` is every registered taxi, in rank order.
  - `interested` is the set of drivers who answered the current call.
  - `assignedId` is the taxi holding the open call's assignment, if any. It is always `history[0]`.
  - `pick` is derived: the first taxi in `queue` that is in `interested` and isn't `assignedId`.
  - `history` is the undo stack, capped at 20 and in memory only.
  - The actions are `toggle`, `done`, `assign`, `undo`, `register`, `remove` and `reset`.
  - `assign` while a call is open is a reassign: it restores `history[0]`'s taxi to its old index, unmarks that driver, and replaces the history entry.
- **Undo** reverses the latest assignment exactly. Each `Dispatch` stores the taxi's old index (`from`) and the interested set, and undo puts both back. `remove` clears `history`, because removing a taxi shifts everyone's index.
- **Persistence:** full taxi records are saved in `localStorage` under the key `taxiq.queue.v3`. On load, each record goes back through `parseStoredTaxi`, and anything invalid or duplicated is dropped. Bump the key if the stored shape changes. The language choice is saved under `taxiq.lang`.
- **Validation:** `src/validate.ts` is the single set of allow-list rules. Both the admin form and the stored-data loader use it, and center numbers and registrations must be unique. Change the rules there, not in the components.
- **i18n:** `src/i18n.tsx` holds every UI string, in `en` and `dv`. Add new strings to both. Choosing Dhivehi sets `<html dir="rtl" lang="dv">`, so use logical utilities (`text-start`, `ms-*`/`me-*`) for anything that should mirror. The slide-left animation and its `pl-20` gutter are deliberately physical, so rows slide left in both languages. Each driver has `name` and `nameDv`; display it with `driverName()`. The Thaana font is self-hosted from `@fontsource/noto-sans-thaana`.
- **Seed data:** `src/data/taxis.ts` holds the default taxis, used on first run and by Reset. Its phone numbers are masked.
- **Deploy:** GitHub Pages serves the `docs/` folder of the `v2` branch at https://kudadonbe.github.io/TaxiQ/. `docs/` is build output: Vite empties it on every build, so never hand-edit or put other files there. To publish, run `pnpm build` and commit `docs/` along with the source. `vite.config.ts` uses `base: './'` so the site works under the `/TaxiQ/` path.
- **Styling:** Tailwind v4 through the `@tailwindcss/vite` plugin. There is no `tailwind.config`; theme tokens go in the `@theme` block in `src/index.css`.

## Conventions

- TypeScript is strict about unused code (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`). Use `import type` for type-only imports, and don't use enums or parameter properties.
- Code style is 2-space indent and single quotes in TS, with no semicolons. See `.editorconfig`.

## Security standard

The workspace requires the MDS Secure Software Development Standard (see `../CLAUDE.md` and `kudadonbe/standards/mds/checklist.md`). This repo has no `SECURITY.md` yet, so its tier and gate status aren't recorded. Note that `docs/` here is the Pages build output and gets wiped on every build, so SECURITY.md must live somewhere else (e.g. the repo root). Propose one before adding auth, a backend or real driver data.
- The admin panel has **no authentication**, since there is no server to enforce it. Any real deployment needs a backend with eFaas login, and the client-side panel must not be treated as access control.
- Real phone numbers, photos and other personal data must not go into the seed file or the repo.
