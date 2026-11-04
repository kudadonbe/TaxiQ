# TaxiQ v2

A visual model of the physical taxi queue at a call center, in English and Dhivehi.

1. The operator takes the customer's details (pickup from the house search, destination, phone, note) and calls the ride on the radio.
2. Drivers who want it answer with their center number; the operator taps each one and their row slides left, uncovering an **Assign** button.
3. The answering driver highest in the queue is highlighted, but any answering driver can be assigned. **Assigning finishes the call**: the taxi moves to the back and every card slides back into line.
4. If something happens before the trip is done, **Reopen** the dispatch: the driver gets their place back and the call returns, ready to assign to someone else. **Undo** takes back a mistaken assignment.
5. A **suspended** driver (misconduct, unpaid fees) shows a red card: they keep their place but can't take rides until the admin lifts it.

The **Map** view shows taxi cars on a live OpenStreetMap of Kulhudhuffushi, facing the way they drive and coloured by queue status. Positions are **simulated** on the island's real road network (OpenStreetMap data, ODbL) for now; live GPS will come from a driver app (see `src/positions.ts`).

The map can show the council's plot chart (house land areas) with house names when zoomed in. Search any Kulhudhuffushi house, road or landmark by English or Dhivehi name, or by plot number, to pin it and see the nearest taxis.

The **Admin** view registers new taxis (they join the back of the queue) and removes unsubscribed ones.

v2 is a rewrite of the Angular 15 v1 (`v1` branch) in React + TypeScript + Vite + Tailwind CSS.

## Develop

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # type-check + production build to docs/ (published by GitHub Pages)
pnpm lint
```

Taxis, suspensions, queue order and language are kept in the browser's localStorage; passenger details and the dispatch log stay in memory only. There is no backend yet, so the admin panel has no login and changes stay on that one device. See [SECURITY.md](SECURITY.md).

Live at https://kudadonbe.github.io/TaxiQ/. GitHub Pages serves the committed `docs/` folder on `v2`, so run `pnpm build` and commit `docs/` to publish changes.

## Credits

- House, road and place names, and the plot chart layer: the official **Kulhudhuffushi City Map** by the Secretariat of the Kulhudhuffushi City Council (chart by Adam Mohamed and Hussain Ali), via [mapkf.vercel.app](https://mapkf.vercel.app) by emjey. Used with permission.
- Map tiles and road network: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
