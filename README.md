# TaxiQ v2

A visual model of the physical taxi queue at a call center, in English and Dhivehi.

1. The operator calls a ride on the radio.
2. Drivers who want it answer with their center number; the operator taps each one and their row slides left, uncovering an **Assign** button.
3. The answering driver highest in the queue is highlighted, but any answering driver can be assigned. The assigned taxi moves to the back.
4. If the driver doesn't respond, **Reassign** another answering driver: the first one goes back to their old place. **Done** closes the call and everyone slides back into line.
5. **Undo** restores the driver's exact place and the drivers who had answered.

The **Map** view shows taxi cars on a live OpenStreetMap of Kulhudhuffushi, facing the way they drive and coloured by queue status. Positions are **simulated** on the island's real road network (OpenStreetMap data, ODbL) for now; live GPS will come from a driver app (see `src/positions.ts`).

The **Admin** view registers new taxis (they join the back of the queue) and removes unsubscribed ones.

v2 is a rewrite of the Angular 15 v1 (`v1` branch) in React + TypeScript + Vite + Tailwind CSS.

## Develop

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # type-check + production build to docs/ (published by GitHub Pages)
pnpm lint
```

Taxis, queue order and language are kept in the browser's localStorage. There is no backend yet, so the
admin panel has no login and changes stay on that one device.

Live at https://kudadonbe.github.io/TaxiQ/. GitHub Pages serves the committed `docs/` folder on `v2`, so run `pnpm build` and commit `docs/` to publish changes.
