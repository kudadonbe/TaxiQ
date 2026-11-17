#!/usr/bin/env python3
"""Build TaxiQ's own map data for one area: src/data/world-<area>.json (phase 1: Greater Malé).

Run from the repo root (standard library only; on a Mac use /usr/bin/python3, which has the
certificates):

    /usr/bin/python3 scripts/build-world.py            # area 'male'
    /usr/bin/python3 scripts/build-world.py male --cache /tmp/world-cache

It asks each source once, politely, one at a time (add --cache DIR to keep the downloads and rebuild
without asking again):

  - OpenStreetMap through the Overpass API (main server, then a mirror): coastline and islands,
    reef, water, beach, parks, trees, roads, buildings, harbours, jetties and places people go.
    (c) OpenStreetMap contributors, ODbL: the published map file is a Derivative Database, so it
    stays under the ODbL and the app keeps "(c) OpenStreetMap contributors" in the attribution.
    The same query by hand (BOX is south,west,north,east, see AREAS):

      curl -s -A 'TaxiQ map build' --data-urlencode "data=$(python3 scripts/build-world.py --query)" \
        https://overpass-api.de/api/interpreter -o world-osm.json

  - Malé City Council lots (house footprints in Malé, Villimalé) and HDC Hulhumalé buildings (with
    their heights) and lots (green spaces, sports), the same public services as
    scripts/import-male.py, used with permission.

Output (compact, read by src/worldStyle.ts). Coordinates are whole millionths of a degree
(6 decimals) from the origin `o` = [west, south]; every shape is a flat list [x0, y0, dx1, dy1, ...]
where each point after the first is the difference from the one before (lng then lat):

  {"v": 1, "o": [lng, lat], "box": [s, w, n, e],
   "land": [shape], "reef": [shape], "water": [shape], "sand": [shape], "paved": [shape],
   "green": [[kind, shape]],                kind: park | wood | grass | pitch
   "roads": [[class, shape]],               class: main | street | path | runway | taxiway | pier
   "b": [[kind, height_m, base_m, shape]],  kind: house | flats | shop | mosque | dome | school |
                                                   health | gov | industry | hotel | airport | other
   "trees": [x0, y0, dx, dy, ...],
   "res": [[kind, x, y, en, dv]]}           kind: mosque | school | hospital | clinic | harbour |
                                                   jetty | shop | fuel | gov | park | pitch | beach
"""

import gzip
import hashlib
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = 'TaxiQ map build (taxi queue app for Maldivian call centers)'
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
COUNCIL_LOTS = 'https://services8.arcgis.com/X5BMOMb5BwtyTn3H/arcgis/rest/services/Male_Lots_28sep25_Public/FeatureServer/0'
HDC_BUILDINGS = 'https://gis.hdc.mv/server/rest/services/DBO_Property_Public/FeatureServer/0'
HDC_LOTS = 'https://gis.hdc.mv/server/rest/services/DBO_Property_Public/FeatureServer/1'

# south, west, north, east. Keep in step with WORLD_AREAS in src/worldStyle.ts.
AREAS = {
    # Malé, Villimalé, Hulhulé (the airport) and Hulhumalé phases 1 and 2.
    'male': {'box': (4.158, 73.478, 4.252, 73.556), 'lots': True},
}

THAANA = re.compile(r'[ހ-޿]')


def overpass_query(box):
    b = '({},{},{},{})'.format(*box)
    parts = [
        f'way["natural"~"^(coastline|reef|water|beach|sand|wood|scrub|grassland|wetland|tree_row)$"]{b}',
        f'relation["natural"~"^(reef|water|beach|sand|wood|scrub|grassland)$"]{b}',
        f'way["place"~"^(island|islet)$"]{b}',
        f'relation["place"~"^(island|islet)$"]{b}',
        f'way["building"]{b}',
        f'relation["building"]{b}',
        f'way["highway"]{b}',
        f'way["aeroway"~"^(runway|taxiway|apron)$"]{b}',
        f'way["landuse"~"^(grass|recreation_ground|forest|cemetery|village_green|meadow|harbour|port)$"]{b}',
        f'way["leisure"~"^(park|pitch|stadium|garden|playground|sports_centre|marina|track)$"]{b}',
        f'nwr["amenity"~"^(place_of_worship|school|college|university|kindergarten|hospital|clinic|doctors|fuel|townhall|police|courthouse|ferry_terminal)$"]{b}',
        f'nwr["shop"]{b}',
        f'nwr["office"="government"]{b}',
        f'way["man_made"~"^(pier|breakwater|groyne|quay)$"]{b}',
        f'nwr["harbour"]{b}',
        f'node["natural"="tree"]{b}',
    ]
    return '[out:json][timeout:180];(' + ';'.join(parts) + ';);out body geom;'


def http(url, data=None, timeout=240):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def cached(cache, name, fetch):
    if cache:
        p = Path(cache) / name
        if p.exists():
            return json.loads(p.read_text())
    data = fetch()
    if cache:
        Path(cache).mkdir(parents=True, exist_ok=True)
        (Path(cache) / name).write_text(json.dumps(data))
    return data


def fetch_osm(box):
    body = urllib.parse.urlencode({'data': overpass_query(box)}).encode()
    for url in OVERPASS:
        try:
            print(f'Overpass: {url}')
            return http(url, body)
        except Exception as e:  # try the mirror once
            print(f'  failed: {e}')
            time.sleep(5)
    sys.exit('Overpass: no server answered')


def fetch_arcgis(url, fields, box):
    """All features of a layer inside the box, as GeoJSON in lat/lng, page by page."""
    s, w, n, e = box
    out, offset = [], 0
    while True:
        q = urllib.parse.urlencode({
            'where': '1=1', 'outFields': fields, 'outSR': 4326, 'f': 'geojson', 'geometryPrecision': 6,
            'geometry': f'{w},{s},{e},{n}', 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
            'spatialRel': 'esriSpatialRelIntersects',
            'resultOffset': offset, 'resultRecordCount': 2000, 'orderByFields': 'OBJECTID' if 'gis.hdc' in url else 'FID',
        })
        page = http(f'{url}/query?{q}')
        feats = page.get('features', [])
        out += feats
        if len(feats) < 2000:
            return out
        offset += len(feats)
        time.sleep(1)


# ---- geometry (lng, lat pairs) ----

def simplify(pts, tol):
    """Douglas-Peucker in degrees (iterative)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
                d = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def ring_ok(r):
    return len(r) >= 4 and r[0] == r[-1]


def area_m2(r):
    k = math.cos(math.radians(r[0][1])) * 111_320
    a = 0.0
    for (x1, y1), (x2, y2) in zip(r, r[1:]):
        a += (x1 * k) * (y2 * 111_320) - (x2 * k) * (y1 * 111_320)
    return abs(a) / 2


def centroid(r):
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(r, r[1:]):
        f = x1 * y2 - x2 * y1
        a += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(a) < 1e-14:
        return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)
    return cx / (3 * a), cy / (3 * a)


def shrink(r, metres):
    """Pull every corner towards the middle by about `metres` (gaps between neighbours)."""
    cx, cy = centroid(r)
    out = []
    k = math.cos(math.radians(cy))
    for x, y in r:
        dx, dy = (x - cx) * k * 111_320, (y - cy) * 111_320
        d = math.hypot(dx, dy)
        f = max(0.5, (d - metres) / d) if d > 0 else 1
        out.append((cx + (x - cx) * f, cy + (y - cy) * f))
    return out


def inside(pt, r):
    x, y = pt
    c = False
    for (x1, y1), (x2, y2) in zip(r, r[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


class Grid:
    """Polygons bucketed by their bounding boxes, for point-in-polygon lookups."""

    def __init__(self, cell=0.0005):
        self.cell, self.cells, self.items = cell, {}, []

    def add(self, ring, value):
        i = len(self.items)
        self.items.append((ring, value))
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        for gx in range(int(min(xs) / self.cell), int(max(xs) / self.cell) + 1):
            for gy in range(int(min(ys) / self.cell), int(max(ys) / self.cell) + 1):
                self.cells.setdefault((gx, gy), []).append(i)

    def find(self, pt):
        for i in self.cells.get((int(pt[0] / self.cell), int(pt[1] / self.cell)), []):
            ring, value = self.items[i]
            if inside(pt, ring):
                return value
        return None


def way_ring(el):
    g = el.get('geometry') or []
    return [(p['lon'], p['lat']) for p in g if p]


def rel_rings(el, role='outer'):
    """Outer rings of a multipolygon relation, joining member ways end to end."""
    lines = [[(p['lon'], p['lat']) for p in m.get('geometry') or [] if p] for m in el.get('members', []) if m.get('type') == 'way' and m.get('role', 'outer') in (role, '')]
    return join_lines([l for l in lines if len(l) > 1])


def join_lines(lines):
    """Join open lines that share end points into closed rings (coastlines, multipolygons)."""
    rings, open_ = [], []
    for l in lines:
        (rings if l[0] == l[-1] else open_).append(list(l))
    while open_:
        cur = open_.pop()
        grown = True
        while grown and cur[0] != cur[-1]:
            grown = False
            for i, l in enumerate(open_):
                if l[0] == cur[-1]:
                    cur += l[1:]
                elif l[-1] == cur[-1]:
                    cur += l[::-1][1:]
                elif l[-1] == cur[0]:
                    cur = l[:-1] + cur
                elif l[0] == cur[0]:
                    cur = l[::-1][:-1] + cur
                else:
                    continue
                open_.pop(i)
                grown = True
                break
        if cur[0] == cur[-1]:
            rings.append(cur)
    return rings


def el_point(el):
    if el['type'] == 'node':
        return el['lon'], el['lat']
    if el['type'] == 'way':
        r = way_ring(el)
        return centroid(r) if ring_ok(r) else (r[len(r) // 2] if r else None)
    rs = rel_rings(el)
    return centroid(max(rs, key=len)) if rs else None


def names(tags):
    name = (tags.get('name') or '').strip()
    en = (tags.get('name:en') or '').strip() or ('' if THAANA.search(name) else name)
    dv = (tags.get('name:dv') or '').strip() or (name if THAANA.search(name) else '')
    return en[:60], dv[:60]


def stable(n, *parts):
    """A repeatable number 0..n-1 from text (so a rebuild gives the same heights)."""
    return int(hashlib.md5('|'.join(map(str, parts)).encode()).hexdigest()[:8], 16) % n


# ---- what things are ----

def resource_kind(t):
    a = t.get('amenity')
    if a == 'place_of_worship':
        return 'mosque' if t.get('religion', 'muslim') == 'muslim' else None
    if a in ('school', 'college', 'university', 'kindergarten'):
        return 'school'
    if a == 'hospital':
        return 'hospital'
    if a in ('clinic', 'doctors'):
        return 'clinic'
    if a == 'fuel':
        return 'fuel'
    if a in ('townhall', 'police', 'courthouse') or t.get('office') == 'government':
        return 'gov'
    if a == 'ferry_terminal' or t.get('harbour') or t.get('leisure') == 'marina' or t.get('landuse') in ('harbour', 'port'):
        return 'harbour'
    if t.get('man_made') in ('pier', 'quay'):
        return 'jetty'
    if t.get('shop'):
        return 'shop'
    if t.get('leisure') in ('park', 'garden'):
        return 'park'
    if t.get('leisure') in ('pitch', 'stadium', 'sports_centre', 'track'):
        return 'pitch'
    if t.get('natural') == 'beach':
        return 'beach'
    return None


def building_kind(t):
    b = t.get('building', 'yes')
    a = t.get('amenity', '')
    if a == 'place_of_worship' or b in ('mosque', 'religious'):
        return 'mosque'
    if a in ('school', 'college', 'university', 'kindergarten') or b in ('school', 'college', 'university', 'kindergarten'):
        return 'school'
    if a in ('hospital', 'clinic', 'doctors') or b == 'hospital':
        return 'health'
    if t.get('office') == 'government' or a in ('townhall', 'police', 'courthouse') or b in ('government', 'public', 'civic'):
        return 'gov'
    if b in ('apartments', 'residential', 'dormitory'):
        return 'flats'
    if b in ('commercial', 'retail', 'office', 'supermarket', 'kiosk') or t.get('shop'):
        return 'shop'
    if b in ('industrial', 'warehouse', 'hangar', 'service', 'storage_tank', 'shed', 'garage', 'garages'):
        return 'industry'
    if b == 'hotel' or t.get('tourism') == 'hotel':
        return 'hotel'
    if t.get('aeroway') or b in ('terminal', 'airport', 'transportation'):
        return 'airport'
    if b in ('house', 'detached', 'semidetached_house', 'terrace', 'hut', 'bungalow'):
        return 'house'
    return 'other'


DEFAULT_H = {'house': 6, 'flats': 15, 'shop': 9, 'mosque': 9, 'school': 10, 'health': 12, 'gov': 12,
             'industry': 8, 'hotel': 18, 'airport': 12, 'other': 7}


def osm_height(t, kind):
    for key in ('height', 'building:height'):
        v = re.match(r'^\s*([0-9.]+)', t.get(key, ''))
        if v:
            return max(2.5, min(150, float(v.group(1))))
    v = re.match(r'^\s*([0-9]+)', t.get('building:levels', ''))
    if v:
        return max(3, min(150, int(v.group(1)) * 3 + (3 if kind == 'mosque' else 0)))
    return None


LOT_NAME_KIND = [
    (re.compile(r'miskiy|mosque|masjid| މިސްކިތް', re.I), 'mosque'),
    (re.compile(r'school|skool|madhrasa|college|university|ސްކޫލް', re.I), 'school'),
    (re.compile(r'hospital|clinic|health|igmh|ހޮސްޕިޓަލް', re.I), 'health'),
]


def lot_kind(name, landuse):
    for rx, k in LOT_NAME_KIND:
        if rx.search(name or ''):
            return k
    lu = (landuse or '').lower()
    if 'sports' in lu or 'open' in lu or 'green' in lu:
        return None  # flat: green / pitch
    if 'institution' in lu or 'civic' in lu or 'religious' in lu:
        return 'gov'
    if 'commercial' in lu or 'office' in lu:
        return 'shop'
    if 'utility' in lu or 'municipal' in lu or 'industrial' in lu or 'transport' in lu:
        return 'industry'
    if 'hotel' in lu or 'tourism' in lu:
        return 'hotel'
    return 'house'


# Malé houses are mostly 3 to 8 floors; the council lots carry no height, so the build gives each
# lot a repeatable one in that range (taller on big lots). OSM building:levels wins where mapped.
def male_floors(fid, sqm):
    base = [3, 4, 4, 5, 5, 5, 6, 6, 7, 8][stable(10, 'lot', fid)]
    if sqm and sqm > 400:
        base += 2
    if sqm and sqm < 60:
        base = min(base, 4)
    return base


# ---- encoding ----

class Enc:
    def __init__(self, ox, oy):
        self.ox, self.oy = ox, oy

    def shape(self, pts):
        out, px, py = [], 0, 0
        for i, (x, y) in enumerate(pts):
            ix, iy = round((x - self.ox) * 1e6), round((y - self.oy) * 1e6)
            if i and ix == px and iy == py:
                continue
            out += [ix - px, iy - py] if i else [ix, iy]
            px, py = ix, iy
        return out


def main():
    args = [a for a in sys.argv[1:]]
    cache = None
    if '--cache' in args:
        i = args.index('--cache')
        cache = args[i + 1]
        del args[i:i + 2]
    area_id = args[0] if args and not args[0].startswith('--') else 'male'
    cfg = AREAS[area_id]
    box = cfg['box']
    if '--query' in sys.argv:
        print(overpass_query(box))
        return
    s, w, n, e = box
    osm = cached(cache, f'{area_id}-osm.json', lambda: fetch_osm(box))['elements']
    print(f'OpenStreetMap: {len(osm)} elements')
    lots = hdc_b = hdc_l = []
    if cfg.get('lots'):
        lots = cached(cache, f'{area_id}-council.json', lambda: fetch_arcgis(COUNCIL_LOTS, 'FID,Name,Name_Dhiv,Landuse,Area_SQM', box))
        hdc_b = cached(cache, f'{area_id}-hdc-buildings.json', lambda: fetch_arcgis(HDC_BUILDINGS, 'OBJECTID,NAME,HEIGHT_M', box))
        hdc_l = cached(cache, f'{area_id}-hdc-lots.json', lambda: fetch_arcgis(HDC_LOTS, 'OBJECTID,LANDUSE', box))
        print(f'Council lots: {len(lots)}; HDC buildings: {len(hdc_b)}; HDC lots: {len(hdc_l)}')

    enc = Enc(w, s)
    T_LAND, T_SHAPE, T_ROAD = 0.000004, 0.0000035, 0.000003  # about 0.45, 0.4 and 0.35 m
    out = {'v': 1, 'o': [w, s], 'box': list(box), 'land': [], 'reef': [], 'water': [], 'sand': [], 'paved': [],
           'green': [], 'roads': [], 'b': [], 'trees': [], 'res': []}

    def poly_rings(el):
        if el['type'] == 'way':
            r = way_ring(el)
            return [r] if ring_ok(r) else []
        if el['type'] == 'relation':
            return rel_rings(el)
        return []

    def add_poly(layer, el, tol=T_SHAPE, kind=None, min_m2=4):
        for r in poly_rings(el):
            if area_m2(r) < min_m2:
                continue
            sh = enc.shape(simplify(r, tol))
            if len(sh) >= 8:
                out[layer].append([kind, sh] if kind else sh)

    coast = []
    greens = []  # rings to scatter trees in
    seen_res = set()
    osm_buildings = []
    for el in osm:
        t = el.get('tags', {})
        nat, lu, lei = t.get('natural'), t.get('landuse'), t.get('leisure')
        if nat == 'coastline' and el['type'] == 'way':
            coast.append(way_ring(el))
        if t.get('place') in ('island', 'islet'):
            add_poly('land', el, T_LAND, min_m2=50)
        if nat == 'reef':
            add_poly('reef', el, T_LAND, min_m2=50)
        if nat == 'water':
            add_poly('water', el, T_LAND)
        if nat in ('beach', 'sand'):
            add_poly('sand', el, T_LAND)
        if nat in ('wood', 'scrub', 'wetland') or lu == 'forest':
            add_poly('green', el, T_LAND, 'wood')
            greens += poly_rings(el)
        if nat in ('grassland',) or lu in ('grass', 'recreation_ground', 'village_green', 'meadow', 'cemetery'):
            add_poly('green', el, T_LAND, 'grass')
        if lei in ('park', 'garden', 'playground'):
            add_poly('green', el, T_LAND, 'park')
            greens += poly_rings(el)
        if lei in ('pitch', 'stadium', 'track', 'sports_centre'):
            add_poly('green', el, T_LAND, 'pitch')
        if t.get('aeroway') == 'apron' or lu in ('harbour', 'port'):
            add_poly('paved', el, T_LAND)
        hw = t.get('highway')
        if el['type'] == 'way' and (hw or t.get('aeroway') in ('runway', 'taxiway') or t.get('man_made') in ('pier', 'breakwater', 'groyne', 'quay')):
            line = way_ring(el)
            if t.get('area') == 'yes' and ring_ok(line):
                add_poly('paved', el, T_ROAD)
            elif len(line) > 1:
                if t.get('aeroway') in ('runway', 'taxiway'):
                    c = t['aeroway']
                elif t.get('man_made'):
                    c = 'pier'
                elif hw in ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'):
                    c = 'main'
                elif hw in ('residential', 'unclassified', 'living_street', 'service', 'road', 'track', 'busway'):
                    c = 'street'
                elif hw in ('pedestrian', 'footway', 'path', 'cycleway', 'steps', 'bridleway'):
                    c = 'path'
                else:
                    c = None
                if c:
                    out['roads'].append([c, enc.shape(simplify(line, T_ROAD))])
        if t.get('building') and t.get('building') != 'no' and el['type'] in ('way', 'relation'):
            kind = building_kind(t)
            for r in poly_rings(el):
                if area_m2(r) >= 6:
                    osm_buildings.append((r, kind, osm_height(t, kind), t))
        if nat == 'tree' and el['type'] == 'node':
            out['trees'].append((el['lon'], el['lat']))
        rk = resource_kind(t)
        if rk:
            pt = el_point(el)
            en, dv = names(t)
            if pt and s <= pt[1] <= n and w <= pt[0] <= e:
                key = (rk, round(pt[0], 4), round(pt[1], 4))
                if key not in seen_res:
                    seen_res.add(key)
                    out['res'].append([rk, pt, en, dv])

    land_rings = join_lines([c for c in coast if len(c) > 1])
    for r in land_rings:
        if area_m2(r) >= 50:
            out['land'].append(enc.shape(simplify(r, T_LAND)))
    print(f'Land: {len(land_rings)} coastline rings, {len(out["land"])} land shapes in all')

    # Buildings. Hulhumalé: HDC footprints (with their heights). Malé and Villimalé: council lots as
    # house footprints, a little smaller so neighbours read apart. Elsewhere, and where neither
    # covers, OpenStreetMap buildings.
    covered = Grid()
    n_hdc = n_lots = n_osm = 0
    osm_levels = Grid()
    for r, kind, h, t in osm_buildings:
        if h:
            osm_levels.add(r, (h, kind))
    osm_kind_at = Grid()
    for r, kind, h, t in osm_buildings:
        if kind != 'other' and kind != 'house':
            osm_kind_at.add(r, kind)
    res_kind_at = {}
    res_grid = {}
    for rk, pt, en, dv in out['res']:
        res_grid.setdefault((int(pt[0] / 0.0005), int(pt[1] / 0.0005)), []).append((rk, pt))

    def res_inside(r):
        xs, ys = [p[0] for p in r], [p[1] for p in r]
        for gx in range(int(min(xs) / 0.0005), int(max(xs) / 0.0005) + 1):
            for gy in range(int(min(ys) / 0.0005), int(max(ys) / 0.0005) + 1):
                for rk, pt in res_grid.get((gx, gy), []):
                    if inside(pt, r):
                        return rk
        return None

    RES_TO_B = {'mosque': 'mosque', 'school': 'school', 'hospital': 'health', 'clinic': 'health', 'gov': 'gov', 'fuel': 'shop', 'shop': 'shop'}

    def add_building(r, kind, h, tol=T_SHAPE):
        sh = enc.shape(simplify(r, tol))
        if len(sh) < 8:
            return
        h = round(h, 1)
        out['b'].append([kind, h, 0, sh])
        if kind == 'mosque' and area_m2(r) >= 40:
            dome = shrink(r, math.sqrt(area_m2(r)) * 0.32)
            out['b'].append(['dome', round(h + 3.5, 1), h, enc.shape(simplify(dome, tol))])

    for f in hdc_b:
        g = f.get('geometry')
        if not g:
            continue
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        p = f['properties']
        h = p.get('HEIGHT_M') or 0
        for poly in polys:
            r = [tuple(x) for x in poly[0]]
            if not ring_ok(r) or area_m2(r) < 6:
                continue
            kind = res_inside(r)
            kind = RES_TO_B.get(kind or '', None) or osm_kind_at.find(centroid(r)) or ('flats' if h >= 12 else 'house')
            add_building(r, kind, h if h >= 2.5 else DEFAULT_H[kind])
            covered.add(r, 1)
            n_hdc += 1

    for f in lots:
        g = f.get('geometry')
        if not g:
            continue
        p = f['properties']
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        name = p.get('Name') or ''
        kind = lot_kind(f'{name} {p.get("Name_Dhiv") or ""}', p.get('Landuse'))
        for poly in polys:
            r = [tuple(x) for x in poly[0]]
            if not ring_ok(r) or area_m2(r) < 6:
                continue
            c = centroid(r)
            if kind is None:
                sh = enc.shape(simplify(r, T_SHAPE))
                if len(sh) >= 8:
                    out['green'].append(['pitch' if 'sports' in (p.get('Landuse') or '').lower() else 'park', sh])
                continue
            k = RES_TO_B.get(res_inside(r) or '', None) or osm_kind_at.find(c) or kind
            lv = osm_levels.find(c)
            h = lv[0] if lv else (male_floors(p.get('FID'), p.get('Area_SQM')) * 3.2 if k in ('house', 'flats', 'shop') else DEFAULT_H[k] + (3 if area_m2(r) > 800 else 0))
            if k == 'house' and h >= 13:
                k = 'flats'
            add_building(shrink(r, 0.35), k, h)
            covered.add(r, 1)
            n_lots += 1

    for f in hdc_l:
        g = f.get('geometry')
        lu = ((f.get('properties') or {}).get('LANDUSE') or '').lower()
        if not g or not ('green' in lu or 'sports' in lu):
            continue
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        for poly in polys:
            r = [tuple(x) for x in poly[0]]
            if ring_ok(r):
                sh = enc.shape(simplify(r, T_SHAPE))
                if len(sh) >= 8:
                    out['green'].append(['pitch' if 'sports' in lu else 'park', sh])
                    greens.append(r)

    for r, kind, h, t in osm_buildings:
        if covered.find(centroid(r)):
            continue
        add_building(r, kind, h or DEFAULT_H[kind])
        n_osm += 1
    print(f'Buildings: {n_hdc} HDC, {n_lots} council lots, {n_osm} OpenStreetMap; {len(out["b"])} shapes with domes')

    # Trees: mapped trees, plus a repeatable scatter in woods and parks (about one per 90 m2).
    scattered = 0
    for r in greens:
        a = area_m2(r)
        if a < 30:
            continue
        xs, ys = [p[0] for p in r], [p[1] for p in r]
        step = 9.5 / 111_320
        y = min(ys)
        row = 0
        while y < max(ys) and scattered < 9000:
            x = min(xs) + (step / 2 if row % 2 else 0)
            while x < max(xs):
                jx = (stable(100, 'tx', round(x, 6), round(y, 6)) - 50) / 100 * step * 0.8
                jy = (stable(100, 'ty', round(x, 6), round(y, 6)) - 50) / 100 * step * 0.8
                pt = (x + jx, y + jy)
                if inside(pt, r):
                    out['trees'].append(pt)
                    scattered += 1
                x += step
            y += step * 0.87
            row += 1
    trees = out['trees']
    out['trees'] = enc.shape(sorted(trees))
    print(f'Trees: {len(trees)} ({scattered} scattered in woods and parks)')

    out['res'] = [[k, round((pt[0] - w) * 1e6), round((pt[1] - s) * 1e6), en, dv] for k, pt, en, dv in out['res']]
    from collections import Counter
    print('Resources:', dict(Counter(r[0] for r in out['res'])))
    print('Roads:', dict(Counter(r[0] for r in out['roads'])), '; green:', dict(Counter(g[0] for g in out['green'])))
    print(f'Reef {len(out["reef"])}, water {len(out["water"])}, sand {len(out["sand"])}, paved {len(out["paved"])}')

    dest = Path(__file__).resolve().parent.parent / 'src' / 'data' / f'world-{area_id}.json'
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    dest.write_text(text + '\n', encoding='utf-8')
    print(f'-> {dest}: {len(text) / 1024:.0f} KB, {len(gzip.compress(text.encode())) / 1024:.0f} KB gzipped')


if __name__ == '__main__':
    main()
