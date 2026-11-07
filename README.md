# TaxiQ v3 (in progress)

TaxiQ v3 is an **API-first core engine** for the vehicle economy: hire, leasing, a bank and ledger, management and more, behind one API that every app uses ([plan](plans/v3-core-api.md), decision D6). It turns the single-center taxi queue of v2 into a **platform for many organisations** with a server of its own:

- a **core engine** (`src/core`): the queue, offers, dispatches, routes, the game and money rules, pure TypeScript with tests, shared by the server and the browser;
- an **API server** (`server/`): Node.js, Fastify and PostgreSQL, running the core engine for every center (API reference in `server/openapi.yaml`);
- **web screens** (`src/v3`) that talk to the API.

**Status:** paused until the server (a VPS) is set up. Until then the live app is **v2** (branch `v2`, https://kd-taxiq.web.app). Every feature v2 has gained since the split is listed, with what to change for v3, in [`plans/v2-features-to-port.md`](plans/v2-features-to-port.md).

Where v3 goes (see [`plans/`](plans/README.md)):

- many centers, each with its own queue, staff and settings, and a Management area per center;
- **eFaas** login and identity checks (the MDS standard), driver documents and permits with expiry dates;
- real driver GPS over a live connection, push notifications, payments, ratings and trip history;
- the TaxiQ Game and its ledger run by the server, so they can't be cheated;
- two sides, **public service** (taxi centers) and **private hire**, growing to hiring **any land vehicle** ([product direction](plans/product-direction.md)).

## Develop

```sh
pnpm install
pnpm dev          # web, http://localhost:5173
pnpm test         # core engine and web unit tests (Vitest)
pnpm build        # type-check + production build
pnpm lint
```

The API server: see [`server/README.md`](server/README.md) (needs PostgreSQL; `pnpm --filter @taxiq/server dev`).

Security standard: the workspace follows the MDS Secure Software Development Standard; tier and gates are in [SECURITY.md](SECURITY.md).

## v2 today: what works in the live app

v2 has **no server of its own**: the browser and the Firebase rules (`firestore.rules`) do all the work. Anything that must keep running while nobody has the app open, or needs a trusted referee, is limited until v3.

### Works (live)

- **Accounts and roles:** Google sign-in (an MDS exception to eFaas, see `SECURITY.md`); roles admin, operator, driver, Private driver and developer, or none (citizen). Management → Users lists everyone who has signed in, who's online, and changes roles. Developers have a **View as** switch.
- **Taxi center:** the queue (answer, Assign, Undo, Reopen, suspend, lift); reorder and shuffle with a reason, logged; register, suspend and remove taxis; call details, the dispatch log and Share pickup.
- **Hiring a center taxi:** offered down the queue, or to one tapped taxi; the driver accepts on the Driver screen.
- **Private vehicles:** offer a car, van, pickup, motorbike or e-bike; any operator approves it, with a log; the Private driver role plus an approved vehicle is needed to take rides. **Available** puts it on the map from the owner's GPS, with a heartbeat that rests while parked (Active, Rest, Nap, Sleep at night).
- **Booking a private vehicle:** tap it, book; the owner accepts, then marks Picked up and Trip done; the passenger watches it on its real position.
- **Map:** full screen, rotating, opens at your GPS location; Kulhudhuffushi and Malé house names, Malé postcodes, plots; pin a pickup and destination; routes that follow one-way streets; follow and unfollow a vehicle; **Show me on the map** (opt-in, you choose who sees you).
- **English and Dhivehi**, with live translation fixes (the pencil button, admins).
- **TaxiQ Game:** the always-running TaxiQ World, rides and fares, money with KD-Bank (Murabaha, Ijara, Qard Hasan) and an open, hash-checked ledger.

### Demo or placeholder

- **Center taxi positions are simulated**, and so is watching a center-taxi trip. Private vehicles use real GPS.
- **Game prices** (fares, car, fuel, living costs, salary) and **gold and silver prices** are placeholders.
- **Demo rides** (a taxi that accepts by itself) only on the GitHub Pages demo site.
- **Roads outside Kulhudhuffushi** load from OpenStreetMap at runtime; they can be slow, and road signs and turn rules aren't used.

### Not for real use yet

- **Payments, receipts, ratings and trip history:** none.
- **eFaas login and driver documents** (licence, insurance, permits): not collected or checked.
- **Notifications with the app closed:** drivers and owners only see requests while the app is open.
- **Anything that must run with no device open:** TaxiQ World only takes new rides while someone has it open; leftover location records need a Firestore TTL policy to be cleaned up.
- **Cheat-proof game money:** a modified app running the game engine could fake bot rides.
- **Public launch:** location sharing and personal data need a privacy notice, and the MDS gates (SBOM, whitelisted dependencies, permits) are still open in `SECURITY.md`.
- **Data gaps:** no Villimalé houses; about 60% of Malé houses have no postcode yet.

### Planned for v3 (a server)

eFaas login and identity checks, driver documents and permits, real driver GPS over a live connection, push notifications, payments, a server-run game and ledger, per-center management, and hiring any land vehicle. See `plans/v2-features-to-port.md` on the `v3` branch.

## Credits

- House, road and place names, and the plot chart layer: the official **Kulhudhuffushi City Map** by the Secretariat of the Kulhudhuffushi City Council (chart by Adam Mohamed and Hussain Ali), via [mapkf.vercel.app](https://mapkf.vercel.app) by emjey. Used with permission.
- Malé house, place and road names: **Malé City Council** (public Malé lots data). Hulhumalé buildings and lots: **Housing Development Corporation (HDC)**, [gis.hdc.mv](https://gis.hdc.mv/). Used with permission; rebuilt with `scripts/import-male.py`.
- Malé postcodes: the **Maldives Post** [postcode finder](https://maldivespost.com/post-code), matched to houses by name (`scripts/import-postcodes.py`). Used with permission.
- Map tiles and road network: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
