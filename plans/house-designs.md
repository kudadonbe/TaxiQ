# House designs

TaxiQ's own houses: `src/data/houses-<area>.json`, built by `scripts/build-houses.py <area>` from
public references (`plans/plot-sources.md`). Each house has a footprint we drew ourselves and a
`design` record. The 3D map draws them (below, branch `houses-3d`).

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

## How the 3D map draws them (built, branch `houses-3d`)

**Approach: three.js geometry in a custom layer, not stepped fill-extrusions.** Sloped roofs as
stepped extrusions need 5-10 thin slabs per roof to read as a slope, still look like stairs close
up, and multiply the GeoJSON features MapLibre has to tile (about 3,000 x 10 in Kulhudhuffushi).
three.js is already in the app (the 3D figures, its own lazy chunk), so the houses are a second
MapLibre custom layer (`src/houses3d/layer.ts`) in the map's WebGL context: real planes for gable
and hipped roofs, one merged mesh per tile (plus one for window glass), so a tile is one or two
draw calls however many houses it has. It shares the depth buffer with the world's buildings and the
3D figures, so walls hide figures behind them and figures stand in yards and streets.

- **Data:** `scripts/build-house-tiles.py <area>` splits `houses-<area>.json` into 0.0025-degree
  tiles (~280 m, like the place tiles) at `src/data/houses/<area>/<y>_<x>.json` (names dropped;
  one row per house: centre, seed, type, floors, roof, colour, wall, yard, balcony, height, front
  bearing, footprint). Kulhudhuffushi 3,199 houses in 33 tiles (211 KB, 81 KB gzipped); Malé area
  8,516 in 65 tiles (569 KB, 209 KB gzipped); the largest tile chunk is 53 KB (14 KB gzipped).
  Each is a lazy chunk (`import.meta.glob`), loaded the first time the view reaches it.
- **No double drawing:** the same script updates `world-<area>.json`: every plain block of kind
  house, flats or other that one of our houses stands in (or whose middle is inside one of ours)
  is removed (2,965 in Kulhudhuffushi, 9,200 in the Malé area), and each of our houses is added as a
  simple block `h0`..`h9` (its wall colour; palette in `hp`). Houses inside a building that is not
  a house (shop, office, mosque, school...) are left out and that building stays (28 and 387).
  `build-world.py` runs this at its end, so a rebuild keeps it. The world bundles got smaller
  (Malé 1,177 -> 985 KB, Kulhudhuffushi 276 -> 221 KB).
- **Level of detail:** below zoom 17, and always in 2D, the simple blocks (`world-<area>-homes`,
  fill-extrusion, flat in 2D). From 17 in 3D that layer stops (`maxzoom`) and the 3D houses draw:
  walls with a darker band at each floor line, flat roofs with a parapet (0.3-1 m by type) and slab,
  gable and hipped tin roofs (grey or rust, ridge 1.2-1.8 m, capped on narrow houses; 0.35 m
  overhang, eaves below the wall top). From 18.5, only for the tiles actually in view: boundary wall
  (1.8 m) round the yard with a gate gap and a coloured gate on the side facing `fr`, a sand yard,
  balconies (slab and rail) on every upper floor of the front, a door (a shutter on town houses),
  windows, and water tanks on some town-house roofs. Coral-stone houses get uneven limewash per wall
  and a stone plinth.
- **Day and night:** the same sun and moon as the figures layer; walls dimmed at night by the
  material colour; windows are a separate glass mesh (dark glass by day, about 40% lit warm at night).
- **Pure parts with tests:** `src/core/houseTiles.ts` (tiles in view, decoding) and
  `src/core/houseGeometry.ts` (triangulation, smallest rectangle, inset, front edge, gable and
  hipped roofs, the whole house).
- **Cost:** about 22 triangles per Kulhudhuffushi house at zoom 17 (102 close up), 84 per Malé
  house (239 close up). Measured in view (headless Chrome, 390 x 844 phone screen, tilt 55):
  Kulhudhuffushi 53k at zoom 18, 61k at 17.5, 104k at 19; central Malé 242k at zoom 18 and 17.5,
  287k at 19; Hulhumalé 52k at 18.5. Building a tile takes a few ms; at most ~10 ms of building per
  frame, the rest on the next frames.

Left:
- No tree per yard yet; no thin roof edges or ridge caps; windows are flat quads.
- Malé's ~240-290k triangles in view is fine on recent phones but the most expensive part of the
  map; if older phones struggle, drop the floor bands at zoom 17-18.5 or draw close-up detail only
  for the tile under the middle of the view.
- Houses aren't tappable yet (names stay the DOM labels).
