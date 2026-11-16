# Open items

What's waiting, so any session (on any machine, or in the cloud at claude.ai/code) can pick up
where the last one stopped. Update it when something is done or new: tick it, or remove it once
it's merged and released. Last updated 2026-11-16.

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

## Needs a decision or an outside step

- [ ] **Automatic deploy** ([PR #2](https://github.com/kudadonbe/TaxiQ/pull/2), `ci-deploy`): the
  owner creates the deploy-only service account and the `FIREBASE_SERVICE_ACCOUNT` secret
  (SECURITY.md, "Automatic deploy"), then merge.
- [ ] **Old activity-log entries** (90 days): TTL needs the Blaze plan; or a free in-app cleanup.
- [ ] **Email to the Dhivehi Language Academy** (draft in the owner's Gmail): proofread and send.
  No Radheef data without their permission.
- [ ] **MTCC**: a formal OK (or an official API) for the RTL bus feed.
- [ ] **Rufiyaa sign** (U+20C2): our own tiny font from the MMA's official artwork (owner sends it).
- [ ] **Project name**: "Digital Raajje" suggested; check domains, app stores, trademark register.
- [ ] **The exact "can't offer while driving" message** the owner saw (to fix the right note).
- [ ] **Mobile-first redesign questions:** gestures to hide/show the menus (suggested: a full-map
  button or an edge swipe to hide; a long press, an edge swipe or a corner handle to bring back);
  signed-out visitors see private vehicles **anonymously** (type, colour, price; no name) and
  services publicly (owners' consent wording updated).
- [ ] **Address updates by residents:** who may suggest (anyone signed in, or only nearby); whether
  approvers must have been signed in a while (e.g. 7 days); whether approved changes also go into
  the house file at release.
- [ ] **Plot map re-trace:** confirm with emjey / the council that re-tracing at higher detail is
  within the permission.
- [ ] **Identity and safety** answers (suggested): "verified" = phone by SMS + operator check now,
  eFaas later; private vehicles' plates shown on tap to signed-in users (logged); taxi driver name and
  photo to signed-in users with each driver's consent; taxi names kept in the public list.

## Next (agreed, after the current batch)

- [ ] **Vehicle model library:** `vehicleModels` (make, model, years, real length and width, seats,
  wheelbase, shape); about 12 top-down shapes (hatchback, sedan, SUV, van, minibus, pickup, lorry,
  bus, scooter, motorbike, e-bike, bicycle); a model picker in My vehicles; the map uses the model's
  shape and size. Bicycle as a type.
- [ ] **Map category chips:** All, Taxi, Bus, Private, Services (then Rentals, Stays, Shops and the
  registries); each chip with its own panel. Replaces today's map-key switches.
- [ ] **Taxis always in taxi colours** on the map (over the model's shape); a tap card with the car's
  real photo, plate, model and colour; a car also offered as private hire is drawn in its real
  colour in the Private view. Vehicle photos in Storage (Blaze) or small in Firestore, operator
  checked.
- [ ] **Mobile-first redesign:** menus that slide away for a full-screen map (header and tabs too),
  a slim header on phones, landscape layout (side rail, side panels), an **Offer** tab for vehicles
  and services together (one Available switch, Can I take rides? there), the map for signed-out
  visitors.
- [ ] **Taxi centers register themselves** (the owner, with the Transport Authority licence number;
  a platform admin approves; the owner becomes its admin); centers on the map with their **logo**
  (small square, approved), Hire from this center.
- [ ] **Identity and safety:** vehicle numbers public for taxis and buses; taxi driver cards; the
  private-hire **mutual reveal** (a verified person must offer their own identity to ask for the
  other's; both see, or neither); verification.
- [ ] **Address updates by residents:** private to the submitter at once; public after 10
  approvals by different signed-in people or one operator/admin; the public never sees who
  submitted; operators can undo.
- [ ] **Sharper plot map** (re-traced from the most detailed tiles) and house and plot files split by
  area (Malé places are 1.9 MB today).
- [ ] **Push notifications** for ride requests (needs a server: Blaze + Cloud Functions, or the VPS).
- [ ] **Android app** (Capacitor: background GPS while locked, push, Play Store USD 25 once); iPhone
  later (USD 99 a year).

## Small next steps

- [ ] A **Corpus editor** checkbox in Management -> Users.
- [ ] Check the **Dhivehi labels** written by agents with the translation editor.
- [ ] Merge the other session's v3 port-list entry (`worktree-v3-port-centers`, `fc6a6d5`) as one
  line; remove old worktrees in `.claude/worktrees/`; delete merged branches (`services-map`,
  `services-map-wip`, `review-services`, `fix-pin-place`).
- [ ] Taxi fare for TaxiQ Center (Kulhudhuffushi); seats on 7-10 seat taxis.
- [ ] Fare extras: domestic terminal (+MVR 10/15), luggage (7-10 seats); whether private hire in
  Greater Malé is capped at the official fare.
- [ ] Help near me by road distance for the top few.

## Later

- `plans/vehicles-traffic-services.md`: traffic, citizen reports (no police checkpoints), spare
  parts, repair guides in Dhivehi, ratings, request a mechanic or tow.
- Game cars on the driving rules (a deterministic version).
- The Dhivehi beys ingredients table in the corpus (laagulha = Caesalpinia bonduc, MFDA list 2023
  row 177; the others in the owner's own words).
- The VPS (Linode, Singapore; plan in the `kudadonbe` repo, `workspace/dev-server.md`).
- v3: the server and the vision (`plans/digital-raajje-vision.md` on `v3`).
