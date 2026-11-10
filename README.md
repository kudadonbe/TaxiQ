# TaxiQ v2

A visual model of the physical taxi queue at a call center, in English and Dhivehi.

1. The operator takes the customer's details (pickup from the house search, destination, phone, note) and calls the ride on the radio.
2. Drivers who want it answer with their center number; the operator taps each one and their row slides left, uncovering an **Assign** button.
3. The answering driver highest in the queue is highlighted, but any answering driver can be assigned. **Assigning finishes the call**: the taxi moves to the back and every card slides back into line.
4. If something happens before the trip is done, **Reopen** the dispatch: the driver gets their place back and the call returns, ready to assign to someone else. **Undo** takes back a mistaken assignment.
5. A **suspended** driver (misconduct, unpaid fees) shows a red card: they keep their place but can't take rides until the admin lifts it.

The **Map** fills the screen and opens where you are. Taxis drive on real roads (center taxis are **simulated** until a driver GPS app exists; private vehicles use their owner's real GPS). It shows house names for Kulhudhuffushi and Malé, Malé postcodes, and the council's plot chart, and lets you pin a pickup and destination.

**Management** (admins) has Users (roles, who's online), Taxis (register, suspend, remove) and Vehicles (approve private vehicles).

v2 is a rewrite of the Angular 15 v1 (`v1` branch) in React + TypeScript + Vite + Tailwind CSS.

## What works in v2

v2 has **no server of its own**: the browser and the Firebase rules (`firestore.rules`) do all the work. Anything that must keep running while nobody has the app open, or needs a trusted referee, is limited until v3.

### Works (live)

- **Accounts and roles:** Google sign-in (an MDS exception to eFaas, see `SECURITY.md`); roles admin, operator, driver, Private driver and developer, or none (citizen). Management → Users lists everyone who has signed in, who's online, and changes roles. Developers have a **View as** switch.
- **Taxi center:** the queue (answer, Assign, Undo, Reopen, suspend, lift); reorder and shuffle with a reason, logged; register, suspend and remove taxis; call details, the dispatch log and Share pickup.
- **Several taxi centers:** each with its own queue, taxis, fares, requests and staff; platform admins create centers, center admins run theirs.
- **My account:** who you are, a **Can I take rides?** checklist, your bookings, trips and a 90-day activity log; admins see any person's and can fix stuck rides.
- **One vehicle, two roles:** a private vehicle can also run as a center taxi, one at a time.
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

eFaas login and identity checks, driver documents and permits, real driver GPS over a live connection, push notifications, payments, a server-run game and ledger, and hiring any land vehicle. See `plans/v2-features-to-port.md` on the `v3` branch.

## Develop

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # type-check + production build to docs/ (published by GitHub Pages)
pnpm lint
pnpm test        # unit tests (Vitest)
pnpm test:rules  # Firestore rules checks on the local emulator (needs Java)
pnpm deploy      # site only
pnpm rules       # Firestore rules + indexes only
pnpm release     # site + rules + indexes together (use when code needs new rules)
```

The live site keeps its data in Firebase (Firestore, Singapore), and access is enforced by `firestore.rules`. The GitHub Pages copy is a demo that keeps everything in the browser. See [SECURITY.md](SECURITY.md).

Live at **https://kd-taxiq.web.app** (Firebase Hosting, `pnpm deploy` or `pnpm release`) and https://kudadonbe.github.io/TaxiQ/ (GitHub Pages). GitHub Pages serves the committed `docs/` folder on `v2`, so run `pnpm build` and commit `docs/` to publish changes.

## Credits

- House, road and place names, and the plot chart layer: the official **Kulhudhuffushi City Map** by the Secretariat of the Kulhudhuffushi City Council (chart by Adam Mohamed and Hussain Ali), via [mapkf.vercel.app](https://mapkf.vercel.app) by emjey. Used with permission.
- Malé house, place and road names: **Malé City Council** (public Malé lots data). Hulhumalé buildings and lots: **Housing Development Corporation (HDC)**, [gis.hdc.mv](https://gis.hdc.mv/). Used with permission; rebuilt with `scripts/import-male.py`.
- Malé postcodes: the **Maldives Post** [postcode finder](https://maldivespost.com/post-code), matched to houses by name (`scripts/import-postcodes.py`). Used with permission.
- Live bus positions and routes (Greater Malé): **RTL / MTCC** public feed.
- Map tiles and road network: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
