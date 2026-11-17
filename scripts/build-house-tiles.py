#!/usr/bin/env python3
"""Split our own house dataset into small map tiles for the 3D map, and put the houses into the
area's world bundle in place of the plain plot blocks.

Input (both already in the repo):
  src/data/houses-<area>.json   our houses (scripts/build-houses.py, plans/house-designs.md)
  src/data/world-<area>.json    TaxiQ's own map for the area (scripts/build-world.py)

Output:
  src/data/houses/<area>/<y>_<x>.json   the houses whose centre is in that 0.0025-degree tile (about
                                        280 m), drawn by src/houses3d/ from zoom 17 in 3D. y, x: the
                                        tile's south-west corner in tile units (floor(deg * 1e6 / 2500)),
                                        like the place tiles (src/core/placeTiles.ts).
  src/data/world-<area>.json            updated in place: every plain house block (kinds house, flats,
                                        other) that one of our houses stands in, or whose middle is
                                        inside one of our houses, is taken out, and each of our houses
                                        is added as a simple block of kind "h<colour>" (h0..h9, the
                                        wall colour), drawn by src/worldStyle.ts below zoom 17 and in
                                        2D; "hp" holds the wall palette. Houses inside a building that
                                        isn't a house (a shop, office, mosque, school...) are left out:
                                        that building stays as it is.

Tile format, decoded by src/core/houseTiles.ts (keep the two in step):
  {"v": 1, "p": [palette], "h": [[dlat, dlng, seed, t, fl, rf, wc, bw, yd, bc, h10, fr, x0, y0, ...]]}
  dlat, dlng   the house centre in millionths of a degree from the tile's south-west corner
  seed         0..65535 from the house id (repeatable looks: roof colour, ridge height, windows)
  t            0 ih island house, 1 ch coral-stone house, 2 mh town house, 3 fl flats, 4 hb Hulhumalé block
  rf           0 flat, 1 gable, 2 hipped
  h10          height to the roof edge in decimetres
  fr           the bearing the front faces (degrees), -1 when unknown
  x0, y0, ...  the footprint, decimetres east and north of the centre (as in houses-<area>.json)

Run from the repo root after scripts/build-houses.py or scripts/build-world.py (standard library):
    python3 scripts/build-house-tiles.py kulhudhuffushi
    python3 scripts/build-house-tiles.py male
Running it again is safe: it first removes the "h<colour>" blocks it added before. A plain block it
took out stays out until build-world.py is run again (which calls this script at its end).
"""

import gzip
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TILE = 2500  # millionths of a degree (HOUSE_TILE_E6 in src/core/houseTiles.ts)
TYPES = ['ih', 'ch', 'mh', 'fl', 'hb']
ROOFS = ['f', 'g', 'h']
REPLACE = {'house', 'flats', 'other'}  # plain blocks our houses replace
KY = 110574.0  # metres per degree of latitude (as scripts/build-houses.py)
RIDGE = 1.5  # m, a sloped roof's rough height above the walls, for the simple block
PARAPET = 0.6  # m, a flat roof's parapet


def decode(o, s):
    x = y = 0
    pts = []
    for i in range(0, len(s) - 1, 2):
        x += s[i]
        y += s[i + 1]
        pts.append((o[0] + x / 1e6, o[1] + y / 1e6))
    return pts


def inside(pt, r):
    x, y = pt
    c = False
    j = len(r) - 1
    for i in range(len(r)):
        xi, yi = r[i]
        xj, yj = r[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def centroid(r):
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]):
        k = x1 * y2 - x2 * y1
        a += k
        cx += (x1 + x2) * k
        cy += (y1 + y2) * k
    if abs(a) < 1e-18:
        return (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))
    return (cx / (3 * a), cy / (3 * a))


def footprint_ll(h):
    """The house footprint as (lng, lat) points."""
    lat, lng = h['c']
    kx = 111320.0 * math.cos(math.radians(lat))
    f = h['f']
    return [(lng + f[i] / 10 / kx, lat + f[i + 1] / 10 / KY) for i in range(0, len(f) - 1, 2)]


class Grid:
    """Items by 0.0005-degree cell of their bounding box."""

    def __init__(self, cell=0.0005):
        self.cell, self.cells = cell, {}

    def add(self, ring, value):
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        for gx in range(int(min(xs) / self.cell), int(max(xs) / self.cell) + 1):
            for gy in range(int(min(ys) / self.cell), int(max(ys) / self.cell) + 1):
                self.cells.setdefault((gx, gy), []).append((ring, value))

    def all_at(self, pt):
        return [v for r, v in self.cells.get((int(pt[0] / self.cell), int(pt[1] / self.cell)), []) if inside(pt, r)]


def seed_of(hid):
    try:
        return int(hid[-4:], 16)
    except ValueError:
        return sum(map(ord, hid)) % 65536


def apply(area, quiet=False):
    """Tile the houses and update the world bundle (see the module docstring). Returns the bundle."""
    houses_doc = json.loads((ROOT / 'src' / 'data' / f'houses-{area}.json').read_text(encoding='utf-8'))
    world_path = ROOT / 'src' / 'data' / f'world-{area}.json'
    world = json.loads(world_path.read_text(encoding='utf-8'))
    houses = houses_doc['houses']
    palette = houses_doc['palette']
    o = world['o']
    blocks = [b for b in world['b'] if not (isinstance(b[0], str) and len(b[0]) == 2 and b[0][0] == 'h' and b[0][1].isdigit())]

    # Which plain blocks our houses replace, and which houses stand in a building that stays.
    rings = [decode(o, b[3]) for b in blocks]
    grid = Grid()
    for i, r in enumerate(rings):
        grid.add(r, i)
    drop = set()
    kept = []
    skipped = 0
    for h in houses:
        pt = (h['c'][1], h['c'][0])
        hits = grid.all_at(pt)
        other = [i for i in hits if blocks[i][0] not in REPLACE and blocks[i][0] != 'dome']
        if other:
            skipped += 1
            continue
        drop.update(i for i in hits if blocks[i][0] in REPLACE)
        kept.append(h)
    # Plain blocks whose middle is inside one of our houses (an OSM building on the same spot).
    hgrid = Grid()
    for h in kept:
        hgrid.add(footprint_ll(h), 1)
    for i, b in enumerate(blocks):
        if b[0] in REPLACE and i not in drop and hgrid.all_at(centroid(rings[i])):
            drop.add(i)

    new_b = [b for i, b in enumerate(blocks) if i not in drop]

    def enc(pts):
        out, px, py = [], 0, 0
        for i, (x, y) in enumerate(pts):
            ix, iy = round((x - o[0]) * 1e6), round((y - o[1]) * 1e6)
            if i and ix == px and iy == py:
                continue
            out += [ix - px, iy - py] if i else [ix, iy]
            px, py = ix, iy
        return out

    tiles = {}
    for h in kept:
        d = h['d']
        top = d['h'] + (PARAPET if d['rf'] == 'f' else RIDGE)
        new_b.append([f'h{d["wc"]}', round(top, 1), 0, enc(footprint_ll(h))])
        lat6, lng6 = round(h['c'][0] * 1e6), round(h['c'][1] * 1e6)
        ty, tx = lat6 // TILE, lng6 // TILE
        row = [lat6 - ty * TILE, lng6 - tx * TILE, seed_of(h['id']), TYPES.index(d['t']), d['fl'], ROOFS.index(d['rf']), d['wc'], d['bw'], d['yd'], d['bc'], round(d['h'] * 10), h.get('fr', -1)] + h['f']
        tiles.setdefault((ty, tx), []).append(row)

    world['b'] = new_b
    world['hp'] = palette
    text = json.dumps(world, ensure_ascii=False, separators=(',', ':'))
    world_path.write_text(text + '\n', encoding='utf-8')

    out_dir = ROOT / 'src' / 'data' / 'houses' / area
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob('*.json'):
        old.unlink()
    raw = gz = 0
    for (ty, tx), rows in sorted(tiles.items()):
        rows.sort()
        t = json.dumps({'v': 1, 'p': palette, 'h': rows}, separators=(',', ':'))
        (out_dir / f'{ty}_{tx}.json').write_text(t + '\n', encoding='utf-8')
        raw += len(t)
        gz += len(gzip.compress(t.encode()))
    if not quiet:
        print(f'{area}: {len(kept)} houses in {len(tiles)} tiles ({raw / 1024:.0f} KB, {gz / 1024:.0f} KB gzipped); '
              f'{len(drop)} plain blocks replaced; {skipped} houses inside other buildings left out')
        print(f'-> {world_path}: {len(text) / 1024:.0f} KB, {len(gzip.compress(text.encode())) / 1024:.0f} KB gzipped')
    return world


def main():
    areas = sys.argv[1:] or ['kulhudhuffushi', 'male']
    for a in areas:
        apply(a)


if __name__ == '__main__':
    main()
