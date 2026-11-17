# House designs

TaxiQ's own houses: `src/data/houses-<area>.json`, built by `scripts/build-houses.py <area>` from
public references (`plans/plot-sources.md`). Each house has a footprint we drew ourselves and a
`design` record. Nothing here is wired into the app yet; the 3D map is the next step.

## House types in the Maldives, and our type codes

| Code | Type | Where | What it looks like | How we pick it |
|---|---|---|---|---|
| `ih` | Island house | Every inhabited island; low houses in Malé | 1-2 storeys, rendered block walls, sloped corrugated tin roof (gable or hipped) or a flat concrete roof when a floor is planned on top; a yard (*gifili* and garden) behind; a 1.5-2 m boundary wall with a gate on the road (*goalhi* / *magu*) | Kulhudhuffushi default; Malé houses under 3 floors |
| `ch` | Coral-stone house | Older parts of island towns | One storey, thick white limewashed coral-stone walls, hipped tin roof, small windows, low wall | ~7% of one-storey Kulhudhuffushi houses (hash) |
| `mh` | Town house | Malé, Villimalé | 3-12 storeys on the whole lot, flat concrete roof (often a water tank or shade on top), shop or parking on the ground floor, balconies on the road side, no yard | Malé residential lots of 3+ floors |
| `fl` | Flats | Malé public / commercial housing | Larger blocks, flat roof, repeated balconies | Malé lots marked Commercial Housing or Public Housing |
| `hb` | Hulhumalé block | Hulhumalé | Planned apartment blocks (HDC), 4-25 storeys, flat roof, set in lots with landscaping | HDC buildings |

## Fields

```
"d": {"t": "ih", "fl": 1, "rf": "g", "wc": 2, "bw": 1, "yd": 4, "bc": 0, "h": 3.0}
```

| Field | Meaning | From |
|---|---|---|
| `t` | type (above) | reference land use and floors |
| `fl` | floors | Malé: council `Elevation` / 3.2 m; Hulhumalé: HDC `HEIGHT_M` / 3.2 m; Kulhudhuffushi: repeatable estimate (82% one storey, 16% two, 2% three; small plots more often two) |
| `rf` | roof: `g` sloped tin gable, `h` hipped tin, `f` flat concrete | one storey: 60% gable, 25% hipped, 15% flat; two+: 70% flat; Malé and Hulhumalé always flat |
| `wc` | wall colour, index into the file's `palette` | weighted pick: white and cream most, then pale yellow, mint, sky blue, pink, peach, lilac, grey, turquoise; coral-stone houses are white |
| `bw` | boundary wall (1/0) | island houses 95%; town houses and blocks none |
| `yd` | yard depth behind the house, m | island houses: what is left of the plot after the house and a ~1 m front setback; town 0 |
| `bc` | balcony on the front (1/0) | 2+ floors: 60% island, 80% town house, 50% blocks |
| `h` | height to the roof edge, m | reference height, else floors x 3.2 (sloped roofs start 0.2 m lower) |

The house also carries `fr`, the bearing its front (door and gate) faces, towards the nearest road,
and `r`, that road's name. Every estimated value is a hash of the house id and a salt
(`rand(hid, 'roof')`), so rebuilding gives the same houses; change a rule in `build-houses.py` and
every house that depends on it changes in a predictable way.

Footprints (`f`) are corners in decimetres east and north of `c`. Island houses: the plot's oriented
rectangle (a shared plot is split into strips, one per house, in the order the house points lie),
house set back from the front, side gaps of 0.3-0.6 m, yard behind, then drawn smaller if needed so
it stays inside an irregular plot. Town houses: the lot's rectangle when the lot is nearly one, else
its outline simplified to ~1 m and squared to the lot's main axis, set back 0.3 m.

## How the 3D map should draw them (later)

Keep it procedural: one small builder per type that turns `f` + `d` into parts, so a house costs a
few dozen triangles and the file stays small.

- **Walls:** extrude `f` to `h` in the palette colour (fill-extrusion is enough for this part). Add a
  thin darker band per floor for `fl` > 1 and a door on the `fr` side.
- **Roof:** `f` = a 0.3 m parapet and a slab (optionally a water tank box for `mh`); `g` = two
  sloped planes along the long axis, ridge 1.2-1.8 m above the walls, tin grey or rust red; `h` = four
  planes to a short ridge. Sloped roofs need the three.js figures layer (fill-extrusion can't slope);
  flat roofs can stay as fill-extrusion.
- **Boundary wall:** for `bw`, a 1.8 m wall on the plot edge (the footprint grown by the setback and
  `yd` behind), white or the house colour, with a 1.2 m gate gap on the `fr` side.
- **Yard:** a sand-coloured ground patch of depth `yd` behind the house; maybe one tree (coconut or
  breadfruit, reuse the trees layer) per yard over ~4 m.
- **Balcony:** for `bc`, a 1 m slab with a rail on the front face of each upper floor.
- **Level of detail:** below zoom 16 just the footprint extrusion; from 17 the roof shapes; from 18
  walls, gates and balconies, only for houses in view (like the 400-label limit today).
- **Hulhumalé blocks and flats:** walls with repeated window bands and balconies; no boundary wall.
