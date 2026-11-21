# Open items

What's waiting, so any session (on any machine, or in the cloud at claude.ai/code) can pick up
where the last one stopped. Update it when something is done or new: tick it, or remove it once
it's merged and released. Last updated 2026-11-21.

The long-term vision (a real digital Maldives: registries for every profession and business, shops,
property, identity and payments) is in `plans/digital-raajje-vision.md` on the `v3` branch.

## Released (v2.6.0 and since)

- [x] Services on the map (PR #3, `40c4ea0`), v2.6.0 tagged with a GitHub release; v2.5.0 tagged.
- [x] Pick on map names the place around the pin, works at once, nearest road as fallback
  (`20716c3`).
- [x] **v2.7.0** (`de927b2`, released 2026-11-16 with `pnpm release`, tagged, GitHub release):
  catch-up driving along the roads instead of fading (one-way aware, rear-axle turning), zoom-out
  badges (shapes from about zoom 17.5), Use as a citizen and off duty (`duty/{taxiId}`), queue
  position for drivers, screen kept on while Available, background warning, driving note reworded.
  **To check on a real phone:** the wake lock, the catch-up driving after lost signal, and the
  Dhivehi wording of the new labels (wake*, duty*, drivingShort).

- [x] **v2.8.0**: vehicle model library (80 models, 12 top-down shapes, model picker; the map draws
  each private vehicle as its model at its real length and wheelbase), bicycles, map category chips
  (All, Taxi, Bus, Private, Services; buses not fetched when hidden), full-map mode (menus slide
  away; back with the handle, an edge swipe or a long press; landscape layout), My vehicles moved
  into My account under What I offer. **To check on a phone:** the swipes and long press (iOS may
  take a left-edge swipe as Back), landscape, the Dhivehi of the new labels (chip*, fullmap*,
  model*, acctOffer*).

- [x] **v2.9.0**: TaxiQ's own 3D map for Greater Malé (`plans/own-map.md`): 12,384 buildings, 959
  places people go, roads, reef, trees, day and night; OSM raster tiles hidden there. **Left:** real
  heights, tap a building for its name, Villimalé houses, OpenFreeMap tiles still used for driving
  roads; phase 2 Kulhudhuffushi (and the game), phase 3 every island (PMTiles, needs the owner's OK).
  **Owner to confirm:** council/HDC permission covers drawing lot and building shapes; ODbL for the
  published map file.

- [x] **v2.10.0**: the Sinamalé Bridge in 3D (researched; `plans/own-map.md`), own-map roads fixed,
  3D figures with three.js (vehicles, taxis, riders, people with Maldivian hijab styles, work
  outfits; each person picks a look), a 2D / 3D switch. **Left:** vehicles on the bridge deck
  (`bridgeHeightAt`), faded resting figures in 3D, stepped V-piers.

- [x] **v2.11.0-v2.17.0** (2026-11-17 to 11-21, each tagged with a GitHub release): corpus editor
  box, expired-record cleanup without Blaze, Help near me by road (2.11); taxi centers register
  themselves, centers on the map (2.12); your avatar instead of the GPS dot, child look, vehicles on
  the bridge deck, linked taxis in taxi colours, fuller tap cards (2.13); place files in tiles (2.14);
  Kulhudhuffushi in 3D, also the game, and our own house dataset (2.15); Share pickup to our own map
  (2.15.1); our own houses in 3D and a 2D fix (2.16); one tap menu for every figure (2.17).
  **Left:** real house heights, the rest of the atoll, tapping a house, free taxis on a center's card,
  suspending a center doesn't remove its admin role, a rules check for a center admin keeping
  private hire, a figure behind a house can still be tapped.

## Needs a decision or an outside step

- [ ] **three.js** (MIT, v2.10.0) needs the MDS whitelist or an exception (SECURITY.md).
- [ ] **Automatic deploy** ([PR #2](https://github.com/kudadonbe/TaxiQ/pull/2), `ci-deploy`): the
  owner creates the deploy-only service account and the `FIREBASE_SERVICE_ACCOUNT` secret
  (SECURITY.md, "Automatic deploy"), then merge.
- [ ] **Email to the Dhivehi Language Academy** (draft in the owner's Gmail): proofread and send.
  No Radheef data without their permission.
- [ ] **MTCC**: a formal OK (or an official API) for the RTL bus feed.
- [ ] **Rufiyaa sign** (U+20C2): our own tiny font from the MMA's official artwork (owner sends it).
- [ ] **Project name**: "Digital Raajje" suggested; check domains, app stores, trademark register.
- [ ] **The exact "can't offer while driving" message** the owner saw (to fix the right note).
- [ ] **Signed-out map question:**
  signed-out visitors see private vehicles **anonymously** (type, colour, price; no name) and
  services publicly (owners' consent wording updated).
- [ ] **Address updates by residents:** who may suggest (anyone signed in, or only nearby); whether
  approvers must have been signed in a while (e.g. 7 days); whether approved changes also go into
  the house file at release.
- [ ] **Plot map re-trace:** confirm with emjey / the council that re-tracing at higher detail is
  within the permission.
- [ ] **Kulhudhuffushi plots:** keep the traced chart or switch to the council's vector lots
  (Charrette's KC_Basemap; ~6 m apart; a written OK needed). See `plans/plot-sources.md`.
- [ ] **Tell Malé City Council / Charrette** that two public layers expose owners' names and ID
  numbers.
- [ ] **mapkf.vercel.app is down** (402): ask emjey whether it comes back (Share pickup already
  links to our own map).
- [ ] **Fuvahmulah open data** (3,539 houses): ask for licence terms if wanted.
- [ ] **Try on a phone:** 3D houses in central Malé (~240k triangles at zoom 18), tap menus, a
  Share pickup link, full-map swipes, wake lock.
- [ ] **Identity and safety** answers (suggested): "verified" = phone by SMS + operator check now,
  eFaas later; private vehicles' plates shown on tap to signed-in users (logged); taxi driver name and
  photo to signed-in users with each driver's consent; taxi names kept in the public list.

## Next (agreed, after the current batch)

- [ ] **Vehicle photos** on the tap card (Storage needs Blaze, or small images in Firestore, operator
  checked). Taxi colours and the linked-vehicle colours are done (v2.13).
- [ ] **Mobile-first, the rest:** the map for signed-out visitors (anonymous private vehicles,
  public services, with consent wording); one Available switch for vehicles and services.
- [ ] **Identity and safety:** vehicle numbers public for taxis and buses; taxi driver cards; the
  private-hire **mutual reveal** (a verified person must offer their own identity to ask for the
  other's; both see, or neither); verification.
- [ ] **Address updates by residents:** private to the submitter at once; public after 10
  approvals by different signed-in people or one operator/admin; the public never sees who
  submitted; operators can undo.
- [ ] **Sharper plot map** (re-traced from the most detailed tiles), or the council's vector lots.
- [ ] **Push notifications** for ride requests (needs a server: Blaze + Cloud Functions, or the VPS).
- [ ] **Android app** (Capacitor: background GPS while locked, push, Play Store USD 25 once); iPhone
  later (USD 99 a year).

## Small next steps

- [ ] Check the **Dhivehi labels**: `plans/dhivehi-to-check.md` (48) plus the newer fig*, figMenu*,
  ctr*, share* labels.
- [ ] Merge the other session's v3 port-list entry (`worktree-v3-port-centers`, `fc6a6d5`) as one
  line; remove old worktrees in `.claude/worktrees/` and their local branches (all on GitHub).
- [ ] Taxi fare for TaxiQ Center (Kulhudhuffushi); seats on 7-10 seat taxis.
- [ ] Fare extras: domestic terminal (+MVR 10/15), luggage (7-10 seats); whether private hire in
  Greater Malé is capped at the official fare.

## Later

- `plans/vehicles-traffic-services.md`: traffic, citizen reports (no police checkpoints), spare
  parts, repair guides in Dhivehi, ratings, request a mechanic or tow.
- Game cars on the driving rules (a deterministic version).
- The Dhivehi beys ingredients table in the corpus (laagulha = Caesalpinia bonduc, MFDA list 2023
  row 177; the others in the owner's own words).
- The VPS (Linode, Singapore; plan in the `kudadonbe` repo, `workspace/dev-server.md`).
- v3: the server and the vision (`plans/digital-raajje-vision.md` on `v3`).
