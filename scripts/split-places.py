#!/usr/bin/env python3
"""Split the place lists into small map tiles, so the app loads only the part it needs.

Input (built by the import scripts; kept out of src/ so it is never bundled):
  scripts/data/places-kdh.json   Kulhudhuffushi  (scripts/import-places.py)
  scripts/data/places-male.json  Malé area       (scripts/import-male.py, then scripts/import-postcodes.py)

Output, one folder per area (the folder name is the area id in src/places.ts):
  src/data/places/<area>/<y>_<x>.json        houses, landmarks and plots whose first point is in that
                                             tile: 0.0025 degrees (about 280 m) square
  src/data/places/<area>/roads_<y>_<x>.json  roads with a point in that cell: 0.01 degrees (about
                                             1.1 km) square; a road is whole in every cell it touches,
                                             and the app keeps one copy
  y, x: the south-west corner in tile units (floor of degrees * 1e6 / size).

Row format, decoded by src/core/placeTiles.ts (keep the two in step):
  [t, e, d, kx, pl, pc, dlat0, lng0, dlat1, dlng1, ...]
  kx: '' = the search key is fold(e + d); '+abc' = fold(e + d) + 'abc' (Malé: the ward); else the key
  pl, pc: '' when missing
  points: integers in millionths of a degree. Rows are sorted by their first point's latitude;
  dlat0 is from the previous row's first latitude (the first row: from the file's south edge), lng0
  from the file's west edge, and each later point from the point before it.

Run from the repo root after any import (standard library only):
    python3 scripts/split-places.py
It checks that every place decodes back exactly, then prints counts and sizes.
"""

import gzip
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AREAS = {'kdh': ROOT / 'scripts' / 'data' / 'places-kdh.json', 'male': ROOT / 'scripts' / 'data' / 'places-male.json'}
OUT = ROOT / 'src' / 'data' / 'places'
TILE = 2500  # house tile size, millionths of a degree (TILE_E6 in src/core/placeTiles.ts)
ROAD_CELL = 10000  # road cell size (ROAD_CELL_E6)


def fold(s):
    """Like fold in src/places.ts: lowercase letters, digits and Thaana only."""
    return re.sub('[^a-z0-9ހ-޿]', '', s.lower())


def e6(x):
    return round(x * 1e6)


def cell(pt, size):
    return e6(pt[0]) // size, e6(pt[1]) // size


def encode(places, origin):
    """Rows for one file (see the format above)."""
    rows, prev = [], origin[0]
    for p in sorted(places, key=lambda p: (e6(p['p'][0][0]), e6(p['p'][0][1]))):
        base = fold(p['e'] + p['d'])
        k = p['k']
        kx = '' if k == base else '+' + k[len(base):] if base and k.startswith(base) else k
        row = [p['t'], p['e'], p['d'], kx, p.get('pl', ''), p.get('pc', '')]
        pts = [(e6(a), e6(b)) for a, b in p['p']]
        row += [pts[0][0] - prev, pts[0][1] - origin[1]]
        for (a0, b0), (a1, b1) in zip(pts, pts[1:]):
            row += [a1 - a0, b1 - b0]
        prev = pts[0][0]
        rows.append(row)
    return rows


def decode(rows, origin):
    """The places in one file: the Python twin of decodeRows in src/core/placeTiles.ts."""
    out, prev = [], origin[0]
    for t, e, d, kx, pl, pc, *c in rows:
        base = fold(e + d)
        lat, lng = prev + c[0], origin[1] + c[1]
        prev = lat
        pts = [[lat / 1e6, lng / 1e6]]
        for i in range(2, len(c), 2):
            lat, lng = lat + c[i], lng + c[i + 1]
            pts.append([lat / 1e6, lng / 1e6])
        p = {'t': t, 'e': e, 'd': d, 'k': base if kx == '' else base + kx[1:] if kx.startswith('+') else kx, 'p': pts}
        if pl:
            p['pl'] = pl
        if pc:
            p['pc'] = pc
        out.append(p)
    return out


def place_id(p):
    """A road's identity across cells (placeId in src/core/placeTiles.ts)."""
    return f"{p['t']}|{p['e']}|{p['d']}|{p['p'][0][0]},{p['p'][0][1]}"


def dump(path, rows):
    text = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))
    path.write_text(text, encoding='utf-8')
    return len(gzip.compress(text.encode(), 9))


def split(area, src):
    places = json.load(open(src, encoding='utf-8'))
    for p in places:
        if p.get('pl') == '' or p.get('pc') == '' or not p['p']:
            raise SystemExit(f'{area}: empty pl, pc or points in {p}')
    files = defaultdict(list)  # (name, origin) -> places
    for p in places:
        if p['t'] == 'r':
            for y, x in {cell(pt, ROAD_CELL) for pt in p['p']}:
                files[(f'roads_{y}_{x}', (y * ROAD_CELL, x * ROAD_CELL))].append(p)
        else:
            y, x = cell(p['p'][0], TILE)
            files[(f'{y}_{x}', (y * TILE, x * TILE))].append(p)

    out = OUT / area
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('*.json'):
        old.unlink()
    back, seen, sizes = [], set(), {'tiles': 0, 'roads': 0}
    for (name, origin), ps in sorted(files.items()):
        rows = encode(ps, origin)
        sizes['roads' if name.startswith('roads') else 'tiles'] += dump(out / f'{name}.json', rows)
        for p in decode(rows, origin):
            if p['t'] == 'r':
                if place_id(p) in seen:
                    continue
                seen.add(place_id(p))
            back.append(p)

    # Every place must come back exactly as it went in (a road once, however many cells it crosses).
    canon = lambda ps: sorted(json.dumps(x, sort_keys=True, ensure_ascii=False) for x in ps)
    if canon(back) != canon(places):
        raise SystemExit(f'{area}: the tiles do not decode back to the source')
    tiles = sum(1 for name, _ in files if not name.startswith('roads'))
    print(f'{area}: {len(places)} places -> {tiles} tiles ({sizes["tiles"] // 1024} KB gzipped) and {len(files) - tiles} road cells ({sizes["roads"] // 1024} KB gzipped)')


def main():
    for area, src in AREAS.items():
        split(area, src)


if __name__ == '__main__':
    main()
