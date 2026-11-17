#!/usr/bin/env python3
"""Build TaxiQ's own map data for one area: src/data/world-<area>.json (Greater Malé, Kulhudhuffushi).

Run from the repo root (standard library only; on a Mac use /usr/bin/python3, which has the
certificates):

    /usr/bin/python3 scripts/build-world.py            # area 'male'
    /usr/bin/python3 scripts/build-world.py male --cache /tmp/world-cache
    /usr/bin/python3 scripts/build-world.py kulhudhuffushi --cache /tmp/world-cache

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

  - Kulhudhuffushi (no download): the Kulhudhuffushi City Council plot chart redrawn as polygons
    (src/data/plots.json, scripts/build-plots.py; used with permission) gives every house its
    footprint and the chart's colours say what each plot is (wards, mosques, schools, offices,
    cemeteries, open space); the demo road graph (src/data/roads.json) adds any driving road OSM
    lacks; the place list (src/data/places.json) names landmarks, mosques and schools.

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
   "res": [[kind, x, y, en, dv]],           kind: mosque | school | hospital | clinic | harbour |
                                                   jetty | shop | fuel | gov | park | pitch | beach
   "bridge": [{"en", "dv", "w": deck width m, "line": shape (deck centre, a point every ~10 m),
               "h": [deck top, dm above the sea, per point], "d": [girder depth dm, per point],
               "piers": [[kind, base_dm, top_dm, shape]],   kind: pier | cap
               "lamps": [x0, y0, dx, dy, ...]}]}            lamp posts on the footpaths
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
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
COUNCIL_LOTS = 'https://services8.arcgis.com/X5BMOMb5BwtyTn3H/arcgis/rest/services/Male_Lots_28sep25_Public/FeatureServer/0'
HDC_BUILDINGS = 'https://gis.hdc.mv/server/rest/services/DBO_Property_Public/FeatureServer/0'
HDC_LOTS = 'https://gis.hdc.mv/server/rest/services/DBO_Property_Public/FeatureServer/1'

# south, west, north, east. Keep in step with WORLD_AREAS in src/worldStyle.ts.
AREAS = {
    # Malé, Villimalé, Hulhulé (the airport) and Hulhumalé phases 1 and 2.
    'male': {'box': (4.158, 73.478, 4.252, 73.556), 'lots': True},
    # Kulhudhuffushi, Haa Dhaalu Atoll (the home island and the TaxiQ World game's island).
    'kulhudhuffushi': {'box': (6.600, 73.050, 6.645, 73.085), 'plots': True},
}
ROOT = Path(__file__).resolve().parent.parent

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


# ---- Kulhudhuffushi: the council plot chart ----
#
# Each plot in src/data/plots.json is a fill region of the council chart with its colour. The three
# ward colours are house plots; the chart's other colours mark mosques, schools, offices and
# utilities, cemeteries and open space. Chart lines and letters left over from the tracing are dark,
# and are not plots.
WARD_COLOURS = [(0xae, 0xdc, 0xbf), (0xfc, 0xdb, 0xb0), (0xf2, 0xa7, 0xe0)]
PLOT_COLOURS = [
    ((0xad, 0xca, 0xb8), 'mosque'),
    ((0xa7, 0xa7, 0xa7), 'cemetery'),
    ((0xa7, 0xa7, 0xff), 'school'),
    ((0xd3, 0xa7, 0xff), 'gov'),
    ((0xa7, 0xe9, 0xff), 'open'),
]
PLOT_NAME_KIND = [
    (re.compile(r'miskiy|mosque|masjid|masdhij|މިސްކިތް', re.I), 'mosque'),
    (re.compile(r'school|college|university|campus|ސްކޫލް', re.I), 'school'),
    (re.compile(r'hospital|clinic|health', re.I), 'health'),
    (re.compile(r'gaburusthaan|cemetery', re.I), 'cemetery'),
    (re.compile(r'bageecha|garden|\bpark\b(?! lane)', re.I), 'park'),
    (re.compile(r'stadium|futsal|football|sports', re.I), 'pitch'),
    (re.compile(r'parking', re.I), 'paved'),
]


def plot_kind(colour, label):
    """What a chart plot is: house | mosque | school | health | gov | other (built on), or
    cemetery | open | park | pitch | paved (flat), or None (not a plot)."""
    for rx, k in PLOT_NAME_KIND:
        if rx.search(label):
            return k
    c = tuple(int(colour[i:i + 2], 16) for i in (1, 3, 5))
    if sum(c) < 300:
        return None
    near = lambda ref: sum((a - b) ** 2 for a, b in zip(c, ref)) < 300
    if any(near(w) for w in WARD_COLOURS):
        return 'house'
    for ref, k in PLOT_COLOURS:
        if near(ref):
            return k
    if abs(c[0] - 0xa8) < 8 and c[1] > 0xe0 and c[2] > 0xf0:  # light blue variants of open space
        return 'open'
    if abs(c[0] - 0xd2) < 6 and abs(c[1] - 0xa7) < 6 and c[2] > 0xf0:
        return 'gov'
    return 'house'


# Kulhudhuffushi houses are mostly one or two storeys, a few three; the chart has no heights, so
# each plot gets a repeatable number of floors. OSM building:levels wins where mapped.
def kf_floors(key):
    return [1, 1, 1, 1, 2, 2, 2, 2, 2, 3][stable(10, 'plot', key)]


# Names in the place list (landmarks) and on chart plots, as places people go.
PLACE_NAME_RES = [
    (re.compile(r'miskiy|mosque|masjid|masdhij', re.I), 'mosque'),
    (re.compile(r'school|college|campus|education cent|tvet', re.I), 'school'),
    (re.compile(r'hospital', re.I), 'hospital'),
    (re.compile(r'clinic|health cent', re.I), 'clinic'),
    (re.compile(r'harbour', re.I), 'harbour'),
    (re.compile(r'jetty', re.I), 'jetty'),
    (re.compile(r'council|court|police|customs|secretariat|office complex|fire station', re.I), 'gov'),
    (re.compile(r'stadium|futsal|football', re.I), 'pitch'),
    (re.compile(r'\bpark\b(?! lane)|bageecha', re.I), 'park'),
    (re.compile(r'market', re.I), 'shop'),
    (re.compile(r'\bfuel\b', re.I), 'fuel'),
]


def place_res_kind(name):
    for rx, k in PLACE_NAME_RES:
        if rx.search(name or ''):
            return k
    return None


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


# ---- bridges (raised 3D decks) ----
#
# The Sinamalé Bridge (China-Maldives Friendship Bridge), Malé to Hulhulé. Facts and sources are in
# plans/own-map.md ("Sinamalé Bridge"). Its line comes from OpenStreetMap: the two one-way
# carriageways tagged bridge=viaduct, name:en "Sinamalé Bridge" (about 1.39 km, the part over the
# sea). The deck centre runs between them. Figures marked "assumed" are ours, not from a source.
BRIDGES = [{
    'match': lambda t: t.get('bridge') == 'viaduct' and 'sinamal' in (t.get('name:en') or '').lower(),
    'en': 'Sinamalé Bridge', 'dv': 'ސިނަމާލެ ބުރިޖު',
    'width': 20.3,  # m, deck (Wikipedia, local press)
    'top': 20.0,  # m above the sea at the crest (about 20 m high: Hakai Magazine; airport limit 45 m)
    'crest': (2, 90),  # level top: 90 m either side of main support 2 (the middle of the 180 m spans; assumed)
    'curve': 160,  # m, length of each parabolic vertical curve (assumed)
    # Main bridge: six spans (100 + 2 x 180 + 140 + 100 + 60) m = 760 m, a V-shaped pier rigid
    # frame (CCCC Highway Consultants' design paper), listed from the Malé end. Its place on the line
    # is fitted to the main pier footings mapped in OSM (bridge:support=pier), whose gaps are 179,
    # 138 and 99 m: the 180, 140 and 100 m spans in this order.
    'main': [100, 180, 180, 140, 100, 60],
    'v_piers': [1, 2, 3],  # V-shaped piers: the three either side of the 180 m spans (assumed)
    'approach_span': 32,  # m, approach girder spans (assumed; 26 piers in all per Hameed's book)
}]
STEP_M = 10  # deck samples along the line


def _metres(lat):
    return 111_320 * math.cos(math.radians(lat)), 111_320


def _resample(pts, step):
    """Points every `step` metres along a (lng, lat) line, ends included."""
    kx, ky = _metres(pts[0][1])
    seg = [math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * ky) for a, b in zip(pts, pts[1:])]
    total = sum(seg)
    n = max(2, round(total / step) + 1)
    out, i, run = [], 0, 0.0
    for j in range(n):
        d = total * j / (n - 1)
        while i < len(seg) - 1 and run + seg[i] < d:
            run += seg[i]
            i += 1
        f = 0 if seg[i] == 0 else min(1.0, (d - run) / seg[i])
        a, b = pts[i], pts[i + 1]
        out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
    return out, total


def _profile(x, length, top, c0, c1, lv):
    """Deck top above the sea at `x` metres along: 0 at each abutment, then a sag curve, a steady
    grade and a crest curve up to the level top between c0 and c1 (parabolic vertical curves, like a
    road design)."""
    if c0 <= x <= c1:
        return top
    run, u = (c0, x) if x < c0 else (length - c1, length - x)
    lv = min(lv, run / 3)
    g = top / (run - lv)  # the steady grade
    if u <= lv:
        return g * u * u / (2 * lv)
    if u <= run - lv:
        return g * (u - lv / 2)
    return top - g * (run - u) ** 2 / (2 * lv)


def build_bridge(cfg, ways, footings, enc):
    """One bridge's packed data: the deck centre line with heights, the piers and the lamp posts."""
    if len(ways) < 1:
        return None
    lines = [[(p['lon'], p['lat']) for p in way['geometry']] for way in ways]
    a = lines[0]
    if len(lines) > 1:  # the middle of the two carriageways, sampled at the same fractions
        b = lines[1]
        if math.dist(a[0], b[0]) > math.dist(a[0], b[-1]):
            b = b[::-1]
        ra, la = _resample(a, STEP_M)
        rb, _ = _resample(b, la / (len(ra) - 1))
        rb = (rb + [rb[-1]] * len(ra))[:len(ra)]
        centre = [((p[0] + q[0]) / 2, (p[1] + q[1]) / 2) for p, q in zip(ra, rb)]
    else:
        centre = a
    if centre[0][0] > centre[-1][0]:  # start at the west (Malé) end
        centre = centre[::-1]
    centre, length = _resample(centre, STEP_M)
    kx, ky = _metres(centre[0][1])
    xs = [length * i / (len(centre) - 1) for i in range(len(centre))]

    def along(pt):
        """Metres along the centre line to the point nearest `pt`."""
        best, bx = float('inf'), 0.0
        for i in range(len(centre) - 1):
            ax, ay = (centre[i][0] - pt[0]) * kx, (centre[i][1] - pt[1]) * ky
            bx_, by_ = (centre[i + 1][0] - pt[0]) * kx, (centre[i + 1][1] - pt[1]) * ky
            dx, dy = bx_ - ax, by_ - ay
            t = max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy or 1)))
            d = math.hypot(ax + t * dx, ay + t * dy)
            if d < best:
                best, bx = d, xs[i] + t * (xs[i + 1] - xs[i])
        return bx, best

    # Place the main bridge: fit its pier lines to the footings mapped in OSM, else centre it.
    rel = [sum(cfg['main'][:i]) for i in range(len(cfg['main']) + 1)]
    feet = [x for x, d in (along(f) for f in footings) if d < 150]
    m0 = (length - rel[-1]) / 2
    if feet:
        m0 = min((sum(min(abs(f - (m + r)) for r in rel) for f in feet), m) for m in range(0, int(length - rel[-1]) + 1))[1]
    main_x = [m0 + r for r in rel]
    print(f'  main bridge from {m0:.0f} m ({len(feet)} OSM footings, off by at most {max((min(abs(f - x) for x in main_x) for f in feet), default=0):.0f} m)')
    k_crest, half = cfg['crest']
    c0, c1 = main_x[k_crest] - half, main_x[k_crest] + half
    prof = lambda x: _profile(x, length, cfg['top'], c0, c1, cfg['curve'])
    tops = [prof(x) for x in xs]

    def at(x):
        """Point, unit direction (east, north in metres) and deck top at x metres along."""
        i = min(len(centre) - 2, max(0, int(x / (length / (len(centre) - 1)))))
        f = (x - xs[i]) / (xs[i + 1] - xs[i])
        p, q = centre[i], centre[i + 1]
        dx, dy = (q[0] - p[0]) * kx, (q[1] - p[1]) * ky
        d = math.hypot(dx, dy) or 1
        return (p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f), (dx / d, dy / d), prof(x)

    def box(x, along, across, off=0.0):
        """A rectangle centred `off` metres to the left of the line at x, `along` by `across` metres."""
        (px, py), (ux, uy), _ = at(x)
        nx, ny = -uy, ux
        pts = []
        for sa, sc in ((-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1)):
            ex = ux * sa * along / 2 + nx * (off + sc * across / 2)
            ey = uy * sa * along / 2 + ny * (off + sc * across / 2)
            pts.append((px + ex / kx, py + ey / ky))
        return enc.shape(pts)

    # Supports along the line: approach piers, then the main bridge's pier lines.
    n_w = max(0, round(main_x[0] / cfg['approach_span']) - 1)
    n_e = max(0, round((length - main_x[-1]) / cfg['approach_span']) - 1)
    west = [m0 * (i + 1) / (n_w + 1) for i in range(n_w)]
    east = [main_x[-1] + (length - main_x[-1]) * (i + 1) / (n_e + 1) for i in range(n_e)]

    def depth(x):
        """Girder depth: 2.4 m on the approaches; on the main bridge 3 m at mid-span, deepening to
        5 m over the V-piers (the concrete part of the hybrid girder; assumed sizes)."""
        if x < main_x[0] or x > main_x[-1]:
            return 2.4
        d = 3.0
        for i in cfg['v_piers']:
            k = abs(x - main_x[i])
            if k < 65:
                d = max(d, 3.0 + 2.0 * (1 - k / 65) ** 2)
        return d

    deps = [depth(x) for x in xs]
    piers = []  # [kind, base_dm, top_dm, shape]
    dm = lambda v: round(v * 10)

    def column_pier(x, main):
        (_, _, top) = at(x)
        under = top - depth(x)
        if under < 1.0:
            return
        cap = 1.6 if main else 1.2
        piers.append(['cap', dm(under - cap), dm(under), box(x, 3.2 if main else 2.4, 15.5)])
        for off in (-4.8, 4.8):
            piers.append(['pier', 0, dm(under - cap), box(x, 2.6 if main else 2.0, 2.6 if main else 2.0, off)])

    for x in west + east:
        column_pier(x, False)
    for i, x in enumerate(main_x):
        if i in cfg['v_piers']:
            # A V-shaped pier: a stem from the sea, then two legs leaning out along the bridge to
            # hold the girder about 22 m each side (drawn as stacked slabs, since extrusions stand
            # straight).
            stem = 8.0  # above the footing (OSM maps it as a 7 m block)
            piers.append(['pier', 0, dm(stem), box(x, 6.0, 12.0)])
            steps = 12
            for side in (-1, 1):
                for j in range(steps):
                    f0, f1 = j / steps, (j + 1) / steps
                    off = side * (3.0 + 19.0 * (f0 + f1) / 2)
                    _, _, top = at(x + side * 22.0)
                    leg_top = top - depth(x + side * 22.0)
                    z0, z1 = stem + (leg_top - stem) * f0, stem + (leg_top - stem) * f1 + 0.3
                    piers.append(['pier', dm(z0), dm(min(z1, leg_top)), box(x + off, 3.4, 11.0)])
        else:
            column_pier(x, True)

    # Lamp posts on both footpaths, every 36 m, staggered (assumed spacing).
    lamps = []
    x = 18.0
    side = 1
    while x < length - 10:
        (px, py), (ux, uy), top = at(x)
        if top > 0.5:
            off = side * (cfg['width'] / 2 - 0.9)
            lamps.append((px + (-uy * off) / kx, py + (ux * off) / ky))
        x += 18.0
        side = -side

    print(f'Bridge {cfg["en"]}: {length:.0f} m, {len(centre)} deck samples, {len(piers)} pier parts, {len(lamps)} lamp posts, top {max(tops):.1f} m')
    return {'en': cfg['en'], 'dv': cfg['dv'], 'w': cfg['width'], 'line': enc.shape(centre),
            'h': [dm(t) for t in tops], 'd': [dm(d) for d in deps], 'piers': piers, 'lamps': enc.shape(lamps)}


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
    plots, places, graph = [], [], None
    if cfg.get('plots'):
        plots = json.loads((ROOT / 'src' / 'data' / 'plots.json').read_text())
        places = json.loads((ROOT / 'src' / 'data' / 'places.json').read_text())
        graph = json.loads((ROOT / 'src' / 'data' / 'roads.json').read_text())
        print(f'Council plot chart: {len(plots)} plots; places: {len(places)}; road graph: {len(graph["n"])} nodes')

    enc = Enc(w, s)
    bridge_ids = set()
    bridges = []
    for cfg in BRIDGES:
        ways = [el for el in osm if el['type'] == 'way' and cfg['match'](el.get('tags', {})) and el.get('geometry')]
        bridge_ids |= {el['id'] for el in ways}
        footings = [centroid(way_ring(el)) for el in osm if el['type'] == 'way' and el.get('tags', {}).get('bridge:support') == 'pier' and ring_ok(way_ring(el))]
        b = build_bridge(cfg, ways, footings, enc)
        if b:
            bridges.append(b)
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
    road_pts = Grid(0.0002)  # OSM road lines, every ~3 m (to find roads only the road graph has)
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
        if el['type'] == 'way' and el['id'] in bridge_ids:
            pass  # drawn as a raised 3D deck (out['bridge']), not a flat line over the sea
        elif el['type'] == 'way' and (hw or t.get('aeroway') in ('runway', 'taxiway') or t.get('man_made') in ('pier', 'breakwater', 'groyne', 'quay')):
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
                    if c in ('main', 'street', 'path'):
                        for a, b in zip(line, line[1:]):
                            k = max(1, int(math.dist(a, b) / 0.000027))
                            for j in range(k + 1):
                                q = (a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k)
                                road_pts.cells.setdefault((int(q[0] / road_pts.cell), int(q[1] / road_pts.cell)), []).append(q)
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

    # Driving roads only our road graph has (src/data/roads.json): each graph edge whose middle is
    # more than ~5 m from every OSM road line is drawn as a street.
    if graph:
        def near_road(q, metres=5):
            lim = metres / 111_320
            gx, gy = int(q[0] / road_pts.cell), int(q[1] / road_pts.cell)
            return any(math.dist(q, r) < lim for dx in (-1, 0, 1) for dy in (-1, 0, 1) for r in road_pts.cells.get((gx + dx, gy + dy), []))
        nodes = [(lng, lat) for lat, lng in graph['n']]
        added, n_graph = set(), 0
        for i, nxt in enumerate(graph['a']):
            for j in nxt:
                key = (min(i, j), max(i, j))
                if key in added:
                    continue
                added.add(key)
                a, b = nodes[i], nodes[j]
                if not near_road(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)):
                    out['roads'].append(['street', enc.shape([a, b])])
                    n_graph += 1
        print(f'Road graph: {n_graph} of {len(added)} edges added where OSM has no road line')

    # Places from the place list (landmarks) and chart plots with a name that says what they are,
    # where OSM has no place of that kind within 40 m.
    def add_res(rk, pt, en, dv):
        if not (s <= pt[1] <= n and w <= pt[0] <= e):
            return
        lim = 40 / 111_320
        if any(k == rk and math.dist(pt, q) < lim for k, q, _, _ in out['res']):
            return
        out['res'].append([rk, pt, en[:60], dv[:60]])
    n_res0 = len(out['res'])
    for pl in places:
        if pl.get('t') != 'l':
            continue
        rk = place_res_kind(pl.get('e'))
        for lat, lng in pl.get('p', [])[:1]:
            if rk:
                add_res(rk, (lng, lat), pl.get('e', ''), pl.get('d', ''))
    for pl in plots:
        names_ = pl.get('h') or []
        label = ' '.join(f'{a} {b}' for a, b in names_)
        k = plot_kind(pl['c'], label)
        if not names_ or k is None:
            continue
        rk = place_res_kind(label) or {'mosque': 'mosque', 'school': 'school'}.get(k)
        if rk:
            r = [(lng, lat) for lat, lng in pl['p']] + [(pl['p'][0][1], pl['p'][0][0])]
            en_ = ' '.join(a for a, _ in names_).strip()
            dv_ = ' '.join(b for _, b in names_).strip()
            add_res(rk, centroid(r), en_, re.sub(r'\s+', ' ', dv_))
    if plots:
        print(f'Places from the place list and the plot chart: {len(out["res"]) - n_res0}')

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

    # Kulhudhuffushi: every plot of the council chart. House plots become house footprints (a
    # little smaller so neighbours read apart, 1 to 3 floors); mosque, school, office and utility
    # plots become their buildings, except big ones with OSM buildings inside, which are drawn as a
    # paved compound round those buildings; cemeteries, parks and open space lie flat.
    osm_centres = {}
    for r, kind, h, t in osm_buildings:
        c = centroid(r)
        osm_centres.setdefault((int(c[0] / 0.0005), int(c[1] / 0.0005)), []).append(c)

    def osm_inside(r):
        xs, ys = [p[0] for p in r], [p[1] for p in r]
        return sum(1 for gx in range(int(min(xs) / 0.0005), int(max(xs) / 0.0005) + 1)
                   for gy in range(int(min(ys) / 0.0005), int(max(ys) / 0.0005) + 1)
                   for c in osm_centres.get((gx, gy), []) if inside(c, r))

    compound_kind = Grid()
    n_plots = n_flat = n_compound = 0
    for pl in plots:
        r = [(lng, lat) for lat, lng in pl['p']]
        r.append(r[0])
        if not ring_ok(r) or area_m2(r) < 6:
            continue
        a = area_m2(r)
        label = ' '.join(f'{x} {y}' for x, y in pl.get('h') or [])
        k = plot_kind(pl['c'], label)
        if k is None:
            continue
        c = centroid(r)
        if k in ('cemetery', 'open', 'park', 'pitch', 'paved'):
            sh = enc.shape(simplify(r, T_SHAPE))
            if len(sh) < 8:
                continue
            if k == 'paved':
                out['paved'].append(sh)
            else:
                out['green'].append([{'cemetery': 'grass', 'open': 'grass'}.get(k, k), sh])
                if k in ('cemetery', 'park'):
                    greens.append(r)
            covered.add(r, 1)
            n_flat += 1
            continue
        k = RES_TO_B.get(res_inside(r) or '', None) or (osm_kind_at.find(c) if k == 'house' else None) or k
        if k != 'house' and a > 400 and osm_inside(r):
            sh = enc.shape(simplify(r, T_SHAPE))
            if len(sh) >= 8:
                out['paved'].append(sh)
            compound_kind.add(r, k)
            n_compound += 1
            continue
        lv = osm_levels.find(c)
        key = pl.get('pl') or ''
        if lv:
            h = lv[0]
        elif k == 'house':
            h = kf_floors(f'{key}|{c[0]:.5f},{c[1]:.5f}') * 3.2
        else:
            h = DEFAULT_H.get(k, 7) - (3 if k in ('gov', 'school', 'health') else 0) + (3 if a > 1500 else 0)
        if k != 'house' and a > 1500:
            # A big plot with nothing mapped on it: a building in the middle of a paved compound.
            sh = enc.shape(simplify(r, T_SHAPE))
            if len(sh) >= 8:
                out['paved'].append(sh)
            add_building(shrink(r, math.sqrt(a)), k, h)
        else:
            add_building(shrink(r, 0.35), k, h, 0.0000045)
        covered.add(r, 1)
        n_plots += 1
    if plots:
        print(f'Plot chart: {n_plots} plots built on, {n_compound} compounds round OSM buildings, {n_flat} flat (green, open, parking)')

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
        if kind in ('house', 'other'):
            kind = compound_kind.find(centroid(r)) or kind
        add_building(r, kind, h or DEFAULT_H[kind])
        n_osm += 1
    print(f'Buildings: {n_hdc} HDC, {n_lots} council lots, {n_plots} chart plots, {n_osm} OpenStreetMap; {len(out["b"])} shapes with domes')

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

    out['bridge'] = bridges
    dest = Path(__file__).resolve().parent.parent / 'src' / 'data' / f'world-{area_id}.json'
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    dest.write_text(text + '\n', encoding='utf-8')
    print(f'-> {dest}: {len(text) / 1024:.0f} KB, {len(gzip.compress(text.encode())) / 1024:.0f} KB gzipped')


if __name__ == '__main__':
    main()
