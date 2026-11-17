#!/usr/bin/env python3
"""Build TaxiQ's own house dataset for one area: src/data/houses-<area>.json.

Public plot charts and lot layers are used only as REFERENCES (where a house is, its plot number,
its name, which road it is on, how tall it is). The footprints are redrawn by this script, not
copied vertex by vertex: each plot is reduced to an oriented rectangle (or, for irregular Malé lots,
a squared outline snapped to the plot's main axis and simplified to about a metre), the house is set
back from the plot edge, and every house gets a design of our own (floors, roof, colour, gate side,
boundary wall, yard, balcony). See plans/house-designs.md and plans/plot-sources.md.

Run from the repo root (standard library only; on a Mac use /usr/bin/python3, which has the
certificates):

    /usr/bin/python3 scripts/build-houses.py kulhudhuffushi --cache /tmp/houses-cache
    /usr/bin/python3 scripts/build-houses.py male --cache /tmp/houses-cache
    # Kulhudhuffushi from the council's vector lots instead of our traced chart:
    /usr/bin/python3 scripts/build-houses.py kulhudhuffushi --ref council --out /tmp/houses-kf-council.json

References per area (downloads are asked once, one request at a time, small pages, and kept in
--cache so a rebuild doesn't ask again; only the fields listed below are requested, never owner or
ID-card fields):

  kulhudhuffushi
    - src/data/places.json   house points, English and Dhivehi names, plot numbers (council chart,
                             via mapkf.vercel.app by emjey, used with permission)
    - src/data/plots.json    our tracing of the council plot chart (scripts/build-plots.py)
    - council residential lots, vector (KC_Basemap_WFL1 layer 0, hosted by charretteGIS on ArcGIS
                             Online, made for Kulhudhuffushi City Council): always compared with
                             plots.json (printed); with --ref council it is the plot outline, after
                             moving each house point by the local gap between the two references
    - src/data/roads.json    road graph, for the side of the house that faces a road
  male
    - Malé City Council lots (Male_Lots_28sep25_Public): outline, name EN/DV, ward, block, road,
                             land use, Elevation (building height in metres)
    - Malé City Council road centre lines (Male_Roads): the road the house faces
    - HDC Hulhumalé buildings (DBO_Property_Public layer 0): named blocks with heights

Output (compact; coordinates rounded to 6 decimals, footprints as decimetre offsets):

  {"v": 1, "area": "kulhudhuffushi", "palette": ["#f7f4ec", ...],
   "roads": [[English, Dhivehi], ...],
   "houses": [{
     "id": "kf-1a2b3c4d",          stable: hash of area + plot number + name (+ a counter on repeats)
     "n": [English, Dhivehi],      house name (facts from the references)
     "pl": "312",                  plot or block number, when known
     "c": [lat, lng],              centre of the footprint
     "f": [x0, y0, x1, y1, ...],   footprint corners, decimetres east / north of "c", counter-clockwise
     "r": 3,                       index into "roads": the road the front faces (absent if none near)
     "fr": 135,                    bearing (degrees from north) the front faces, towards that road
     "d": {                        our own design
       "t": "ih",                  type: ih island house | ch coral-stone house | mh multi-storey
                                   town house | fl flats | hb Hulhumalé block
       "fl": 1,                    floors
       "rf": "g",                  roof: g sloped tin (gable) | h hipped tin | f flat concrete
       "wc": 2,                    wall colour: index into "palette"
       "bw": 1,                    boundary wall (1/0)
       "yd": 4,                    yard depth behind the house, metres
       "bc": 0,                    balcony on the front (1/0)
       "h": 3.2                    height in metres to the roof edge (from the reference or floors)
     }}]}

The design is repeatable: every estimated choice comes from a hash of the house id, so the same
references always give the same houses.
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

ROOT = Path(__file__).resolve().parent.parent
UA = 'TaxiQ data import (taxi queue app for Maldivian call centers)'
CHARRETTE = 'https://services8.arcgis.com/X5BMOMb5BwtyTn3H/arcgis/rest/services'
KF_LOTS = f'{CHARRETTE}/KC_Basemap_WFL1/FeatureServer/0'
MALE_LOTS = f'{CHARRETTE}/Male_Lots_28sep25_Public/FeatureServer/0'
MALE_ROADS = f'{CHARRETTE}/Male_Roads/FeatureServer/0'
HDC_BUILDINGS = 'https://gis.hdc.mv/server/rest/services/DBO_Property_Public/FeatureServer/0'

# Wall colours seen on Maldivian houses: white and cream first, then the pastel washes.
PALETTE = ['#f7f4ec', '#efe6cf', '#f3e7a8', '#cfe8d2', '#bfdcec', '#f2c9cf',
           '#f4cfae', '#d9cdea', '#d8d8d4', '#a9dcd6']
PALETTE_WEIGHTS = [26, 18, 10, 9, 9, 7, 7, 5, 5, 4]
STOREY_M = 3.2  # floor to floor


# ---------------------------------------------------------------- downloads

def fetch_layer(url, fields, cache, name, order='FID'):
    """All features of an ArcGIS layer as GeoJSON in lat/lng, page by page, with only `fields`."""
    if cache:
        p = Path(cache) / f'{name}.json'
        if p.exists():
            return json.loads(p.read_text())
    out, offset = [], 0
    while True:
        q = urllib.parse.urlencode({
            'where': '1=1', 'outFields': fields, 'outSR': 4326, 'f': 'geojson',
            'resultOffset': offset, 'resultRecordCount': 1000, 'orderByFields': order,
        })
        req = urllib.request.Request(f'{url}/query?{q}', headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=120) as r:
            page = json.load(r)
        feats = page.get('features', [])
        out += feats
        print(f'  {name}: {len(out)}', file=sys.stderr)
        if len(feats) < 1000:
            break
        offset += len(feats)
        time.sleep(1)
    if cache:
        Path(cache).mkdir(parents=True, exist_ok=True)
        (Path(cache) / f'{name}.json').write_text(json.dumps(out))
    return out


# ---------------------------------------------------------------- geometry (local metres)

class Frame:
    """Equirectangular projection around an origin: good to centimetres over an island."""

    def __init__(self, lat0, lng0):
        self.lat0, self.lng0 = lat0, lng0
        self.kx = 111320.0 * math.cos(math.radians(lat0))
        self.ky = 110574.0

    def xy(self, lat, lng):
        return ((lng - self.lng0) * self.kx, (lat - self.lat0) * self.ky)

    def ll(self, x, y):
        return [round(self.lat0 + y / self.ky, 6), round(self.lng0 + x / self.kx, 6)]


def area(ring):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        a += x1 * y2 - x2 * y1
    return a / 2


def centroid(ring):
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        f = x1 * y2 - x2 * y1
        a += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(a) < 1e-9:
        return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
    return (cx / (3 * a), cy / (3 * a))


def inside(pt, ring):
    x, y = pt
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def min_rect(ring):
    """Smallest-area oriented rectangle: (centre x, y, angle of the long side, length, width)."""
    h = hull(ring)
    if len(h) < 3:
        return None
    best = None
    for (x1, y1), (x2, y2) in zip(h, h[1:] + h[:1]):
        t = math.atan2(y2 - y1, x2 - x1)
        c, s = math.cos(t), math.sin(t)
        us = [x * c + y * s for x, y in h]
        vs = [-x * s + y * c for x, y in h]
        a = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or a < best[0]:
            best = (a, t, min(us), max(us), min(vs), max(vs))
    _, t, u0, u1, v0, v1 = best
    c, s = math.cos(t), math.sin(t)
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    L, W = u1 - u0, v1 - v0
    if W > L:
        t, L, W = t + math.pi / 2, W, L
    return (uc * c - vc * s, uc * s + vc * c, t, L, W)


def rect_corners(cx, cy, t, L, W):
    c, s = math.cos(t), math.sin(t)
    out = []
    for u, v in ((-L / 2, -W / 2), (L / 2, -W / 2), (L / 2, W / 2), (-L / 2, W / 2)):
        out.append((cx + u * c - v * s, cy + u * s + v * c))
    return out


def seg_dist(p, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2))
    qx, qy = ax + t * dx, ay + t * dy
    return math.hypot(p[0] - qx, p[1] - qy), (qx, qy)


def ring_dist(p, ring):
    return min(seg_dist(p, a, b)[0] for a, b in zip(ring, ring[1:] + ring[:1]))


def simplify(ring, tol):
    """Douglas-Peucker on a closed ring."""
    if len(ring) < 5:
        return ring

    def dp(pts):
        if len(pts) < 3:
            return pts
        d, i = max((seg_dist(p, pts[0], pts[-1])[0], i) for i, p in enumerate(pts[1:-1], 1))
        if d <= tol:
            return [pts[0], pts[-1]]
        return dp(pts[:i + 1])[:-1] + dp(pts[i:])
    far = max(range(len(ring)), key=lambda i: math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]))
    a = dp(ring[:far + 1])
    b = dp(ring[far:] + ring[:1])
    return a[:-1] + b[:-1]


def square_up(ring, t):
    """Snap a simplified ring to the axis at angle t: near-axis edges become exactly parallel or
    perpendicular to it, and corners land where those lines cross. Diagonal edges stay."""
    c, s = math.cos(t), math.sin(t)
    loc = [(x * c + y * s, -x * s + y * c) for x, y in ring]
    n = len(loc)
    kinds = []
    for i in range(n):
        (u1, v1), (u2, v2) = loc[i], loc[(i + 1) % n]
        a = abs(math.degrees(math.atan2(v2 - v1, u2 - u1))) % 180
        if a < 15 or a > 165:
            kinds.append(('h', (v1 + v2) / 2))
        elif 75 < a < 105:
            kinds.append(('v', (u1 + u2) / 2))
        else:
            kinds.append(('d', None))
    out = []
    for i in range(n):
        pk, pv = kinds[i - 1]   # edge ending here
        nk, nv = kinds[i]       # edge starting here
        u, v = loc[i]
        if pk == nk and pk != 'd':
            continue            # straight run: drop the middle point
        if pk == 'h':
            v = pv
        if nk == 'h':
            v = nv
        if pk == 'v':
            u = pv
        if nk == 'v':
            u = nv
        out.append((u, v))
    if len(out) < 3:
        return None
    return [(u * c - v * s, u * s + v * c) for u, v in out]


def shrink(ring, m):
    """Pull every corner towards the centre by about m metres (a setback; fine for compact shapes)."""
    cx, cy = centroid(ring)
    out = []
    for x, y in ring:
        d = math.hypot(x - cx, y - cy)
        k = max(0.0, (d - m) / d) if d > 0 else 0
        out.append((cx + (x - cx) * k, cy + (y - cy) * k))
    return out


class Grid:
    """Bucket index for nearest / containing lookups."""

    def __init__(self, cell=40.0):
        self.cell, self.b = cell, {}

    def add(self, item, x0, y0, x1, y1):
        c = self.cell
        for i in range(int(x0 // c), int(x1 // c) + 1):
            for j in range(int(y0 // c), int(y1 // c) + 1):
                self.b.setdefault((i, j), []).append(item)

    def near(self, x, y, r=1):
        c = self.cell
        i0, j0 = int(x // c), int(y // c)
        seen = set()
        for i in range(i0 - r, i0 + r + 1):
            for j in range(j0 - r, j0 + r + 1):
                for it in self.b.get((i, j), ()):
                    if id(it) not in seen:
                        seen.add(id(it))
                        yield it


def bbox(ring):
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def outer_ring(geom, fr):
    if not geom:
        return None
    if geom['type'] == 'Polygon':
        ring = geom['coordinates'][0]
    elif geom['type'] == 'MultiPolygon':
        ring = max((p[0] for p in geom['coordinates']), key=len)
    else:
        return None
    pts = [fr.xy(lat, lng) for lng, lat in ring[:-1]]
    if len(pts) < 3:
        return None
    if area(pts) < 0:
        pts.reverse()
    return pts


# ---------------------------------------------------------------- design

def rand(hid, salt):
    """A repeatable number in [0, 1) for this house and choice."""
    h = hashlib.sha1(f'{hid}:{salt}'.encode()).digest()
    return int.from_bytes(h[:4], 'big') / 2 ** 32


def pick_colour(hid):
    r = rand(hid, 'colour') * sum(PALETTE_WEIGHTS)
    for i, w in enumerate(PALETTE_WEIGHTS):
        r -= w
        if r < 0:
            return i
    return 0


def island_design(hid, lot_area, yard):
    """A Kulhudhuffushi house: mostly one storey with a yard and a boundary wall."""
    small = lot_area and lot_area < 220
    r = rand(hid, 'floors')
    floors = 3 if r < 0.02 else 2 if r < (0.30 if small else 0.18) else 1
    coral = floors == 1 and rand(hid, 'coral') < 0.07
    rr = rand(hid, 'roof')
    if floors >= 2:
        roof = 'f' if rr < 0.7 else 'g'
    else:
        roof = 'g' if rr < 0.6 else 'h' if rr < 0.85 else 'f'
    return {
        't': 'ch' if coral else 'ih', 'fl': floors, 'rf': roof,
        'wc': 0 if coral else pick_colour(hid),
        'bw': 0 if rand(hid, 'wall') < 0.05 else 1,
        'yd': yard,
        'bc': 1 if floors >= 2 and rand(hid, 'balcony') < 0.6 else 0,
        'h': round(floors * STOREY_M - (0.2 if roof != 'f' else 0), 1),
    }


def town_design(hid, height, kind):
    """A Malé or Hulhumalé building: covers its lot, flat concrete roof, height from the reference."""
    if height and height > 2:
        floors = max(1, round(height / STOREY_M))
    else:
        r = rand(hid, 'floors')
        floors = 2 if r < 0.3 else 3 if r < 0.65 else 4 if r < 0.85 else 5
        height = floors * STOREY_M
    t = kind if kind in ('fl', 'hb') else ('mh' if floors >= 3 else 'ih')
    return {
        't': t, 'fl': floors, 'rf': 'f',
        'wc': pick_colour(hid),
        'bw': 1 if t == 'ih' else 0,
        'yd': 0,
        'bc': 1 if floors >= 2 and rand(hid, 'balcony') < (0.8 if t == 'mh' else 0.5) else 0,
        'h': round(height, 1),
    }


# ---------------------------------------------------------------- roads

class Roads:
    def __init__(self):
        self.grid = Grid(30.0)
        self.names = []
        self.index = {}

    def name_id(self, en, dv):
        k = (en or '', dv or '')
        if not k[0] and not k[1]:
            return None
        if k not in self.index:
            self.index[k] = len(self.names)
            self.names.append([k[0], k[1]])
        return self.index[k]

    def add(self, a, b, name=None):
        x0, y0 = min(a[0], b[0]), min(a[1], b[1])
        x1, y1 = max(a[0], b[0]), max(a[1], b[1])
        self.grid.add((a, b, name), x0, y0, x1, y1)

    def nearest(self, p, prefer=None, r=2):
        """(distance, closest point, name id) of the nearest road segment within about r cells."""
        best = None
        for a, b, name in self.grid.near(p[0], p[1], r):
            d, q = seg_dist(p, a, b)
            if prefer is not None and name == prefer:
                d -= 15  # the lot's own road wins unless another is much closer
            if best is None or d < best[0]:
                best = (d, q, name)
        return best


def bearing(frm, to):
    return round(math.degrees(math.atan2(to[0] - frm[0], to[1] - frm[1]))) % 360


# ---------------------------------------------------------------- footprints

def island_footprint(lot, toward):
    """House inside an island plot: an oriented rectangle, set back from the front, yard behind.
    `toward` is a point on the road the house faces. Returns (corners, yard depth, front bearing)."""
    mr = min_rect(lot)
    if not mr:
        return None
    cx, cy, t, L, W = mr
    # Which side of the rectangle faces the road: the axis whose direction points most at it.
    dx, dy = toward[0] - cx, toward[1] - cy
    ax = [(math.cos(t), math.sin(t), L, W), (-math.sin(t), math.cos(t), W, L)]
    fx, fy, depth, width = max(((a, b, d, w) for a, b, d, w in ax), key=lambda a: abs(a[0] * dx + a[1] * dy))
    if fx * dx + fy * dy < 0:
        fx, fy = -fx, -fy
    side = 0.6 if width > 7 else 0.3
    front = 1.2 if depth > 10 else 0.5
    hw = max(3.5, width - 2 * side)
    hd = max(4.0, min(14.0, depth - front - max(1.5, depth * 0.3)))
    hd = min(hd, max(3.0, depth - front - 0.5))
    yard = max(0, round(depth - front - hd))
    # Rectangle from the front line inwards.
    ox, oy = cx + fx * (depth / 2 - front - hd / 2), cy + fy * (depth / 2 - front - hd / 2)
    px, py = -fy, fx
    pts = []
    for u, v in ((hd / 2, -hw / 2), (hd / 2, hw / 2), (-hd / 2, hw / 2), (-hd / 2, -hw / 2)):
        pts.append((ox + fx * u + px * v, oy + fy * u + py * v))
    if area(pts) < 0:
        pts.reverse()
    return pts, yard, bearing((cx, cy), (cx + fx, cy + fy))


def split_lot(lot, pts):
    """Split a plot shared by several houses into strips across its long side, one per house,
    in the order the house points lie along it. Returns one rectangle per point (same order)."""
    mr = min_rect(lot)
    if not mr:
        return [lot] * len(pts)
    cx, cy, t, L, W = mr
    c, s = math.cos(t), math.sin(t)
    order = sorted(range(len(pts)), key=lambda i: (pts[i][0] - cx) * c + (pts[i][1] - cy) * s)
    n = len(pts)
    out = [None] * n
    for k, i in enumerate(order):
        u = -L / 2 + L * (k + 0.5) / n
        out[i] = rect_corners(cx + u * c, cy + u * s, t, L / n, W)
    return out


def town_footprint(lot):
    """A Malé lot redrawn: an oriented rectangle when the lot is close to one, otherwise its outline
    simplified to ~1 m and squared to the lot's main axis; then set back 0.3 m."""
    mr = min_rect(lot)
    if not mr:
        return None
    cx, cy, t, L, W = mr
    a = area(lot)
    if a <= 0:
        return None
    if a / (L * W) > 0.88:
        shape = rect_corners(cx, cy, t, L, W)
    else:
        shape = square_up(simplify(lot, 1.0), t) or rect_corners(cx, cy, t, L, W)
        if len(shape) > 12 or area(shape) <= 0 or abs(area(shape) - a) / a > 0.25:
            shape = rect_corners(cx, cy, t, L, W)
    if area(shape) < 0:
        shape.reverse()
    return shrink(shape, 0.3)


# ---------------------------------------------------------------- output

def encode(fr, ring):
    cx, cy = centroid(ring)
    c = fr.ll(cx, cy)
    # Re-project the centre so the decimetre offsets are relative to the rounded centre.
    rx, ry = fr.xy(*c)
    f = []
    for x, y in ring:
        f += [round((x - rx) * 10), round((y - ry) * 10)]
    return c, f


def make_id(prefix, used, *parts):
    base = '|'.join(str(p or '') for p in parts)
    k = 0
    while True:
        hid = f'{prefix}-' + hashlib.sha1(f'{base}|{k}'.encode()).hexdigest()[:8]
        if hid not in used:
            used.add(hid)
            return hid
        k += 1


def stats(name, offs):
    if not offs:
        return f'{name}: none'
    offs = sorted(offs)
    return (f'{name}: n={len(offs)} mean={sum(offs) / len(offs):.2f} m '
            f'median={offs[len(offs) // 2]:.2f} m p90={offs[int(len(offs) * 0.9)]:.2f} m')


# ---------------------------------------------------------------- areas

def build_kulhudhuffushi(cache, ref):
    fr = Frame(6.62, 73.07)
    places = json.loads((ROOT / 'src/data/places.json').read_text())
    plots = json.loads((ROOT / 'src/data/plots.json').read_text())
    graph = json.loads((ROOT / 'src/data/roads.json').read_text())
    council = fetch_layer(KF_LOTS, 'OBJECTID,Goathi_Name,Survey_Zoning', cache, 'kf-council-lots', 'OBJECTID')

    traced = []
    for p in plots:
        ring = [fr.xy(lat, lng) for lat, lng in p['p']]
        if area(ring) < 0:
            ring.reverse()
        traced.append({'ring': ring, 'pl': p.get('pl')})
    lots = []
    for f in council:
        ring = outer_ring(f.get('geometry'), fr)
        if ring and area(ring) > 15:
            lots.append({'ring': ring, 'name': (f['properties'].get('Goathi_Name') or '').strip()})

    tgrid, lgrid = Grid(), Grid()
    for t in traced:
        tgrid.add(t, *bbox(t['ring']))
    for lt in lots:
        lgrid.add(lt, *bbox(lt['ring']))

    def containing(grid, p):
        for it in grid.near(p[0], p[1], 0):
            if inside(p, it['ring']):
                return it
        return None

    report = {}
    if True:  # always compare the two references
        # Council vector lots against our traced chart: centre offset of the traced plot that holds
        # each council lot's centre, and the boundary distance (council corners to traced outline).
        offs, edge, matched = [], [], 0
        for lt in lots:
            c = centroid(lt['ring'])
            t = containing(tgrid, c)
            if not t:
                continue
            matched += 1
            tc = centroid(t['ring'])
            offs.append(math.hypot(c[0] - tc[0], c[1] - tc[1]))
            edge += [ring_dist(p, t['ring']) for p in simplify(lt['ring'], 0.5)]
        report['compare'] = {
            'council_lots': len(lots), 'traced_plots': len(traced), 'matched': matched,
            'centre_offset': stats('centre offset', offs), 'boundary': stats('boundary distance', edge),
        }
        # Name check: a council lot holding a house point with the same English name.
        hits = tried = 0
        for pl in places:
            if pl['t'] != 'h':
                continue
            p = fr.xy(*pl['p'][0])
            lt = containing(lgrid, p)
            if lt and lt['name']:
                tried += 1
                hits += re.sub(r'[^a-z]', '', lt['name'].lower()) == re.sub(r'[^a-z]', '', pl['e'].lower())
        report['compare']['names'] = f'{hits} of {tried} house points sit in a council lot of the same name'

    roads = Roads()
    pts = [fr.xy(lat, lng) for lat, lng in graph['n']]
    for i, adj in enumerate(graph['a']):
        for j in adj:
            if i < j or i not in graph['a'][j]:
                roads.add(pts[i], pts[j])
    # Road names from the chart's road lines (places.json), matched to the nearest named line.
    named = Roads()
    for pl in places:
        if pl['t'] == 'r' and len(pl['p']) >= 2:
            nid = roads.name_id(pl['e'], pl['d'])
            line = [fr.xy(lat, lng) for lat, lng in pl['p']]
            for a, b in zip(line, line[1:]):
                named.add(a, b, nid)
    named.names = roads.names

    houses_pts = [pl for pl in places if pl['t'] == 'h']

    # The council lots and the chart (house points, traced plots) don't line up exactly: the gap
    # is 1-11 m and changes across the island. In council mode each house point is moved by the
    # median gap of its 8 nearest pairs (a house and a council lot with the same, unique name).
    def fold(s):
        return re.sub(r'[^a-z]', '', (s or '').lower())
    pairs = []
    if ref == 'council':
        byname = {}
        for lt in lots:
            if lt['name']:
                byname.setdefault(fold(lt['name']), []).append(lt)
        for pl in houses_pts:
            c = byname.get(fold(pl['e']))
            if c and len(c) == 1:
                x, y = fr.xy(*pl['p'][0])
                cx, cy = centroid(c[0]['ring'])
                if math.hypot(cx - x, cy - y) < 80:
                    pairs.append((x, y, cx - x, cy - y))

    def gap(p):
        if not pairs:
            return (0.0, 0.0)
        near = sorted(pairs, key=lambda q: (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2)[:8]
        dx = sorted(q[2] for q in near)
        dy = sorted(q[3] for q in near)
        return (dx[len(dx) // 2], dy[len(dy) // 2])

    # Group house points by the plot that holds them: council mode takes the council lot (after
    # the gap), else our traced plot (moved by the same gap, so one area stays in one frame).
    groups = {}
    for pl in houses_pts:
        p = fr.xy(*pl['p'][0])
        lot, src = None, 'traced'
        if ref == 'council':
            g = gap(p)
            p = (p[0] + g[0], p[1] + g[1])
            lot, src = containing(lgrid, p), 'council'
            if not lot:
                t = containing(tgrid, (p[0] - g[0], p[1] - g[1]))
                if t:
                    lot = t.setdefault('moved', {'ring': [(x + g[0], y + g[1]) for x, y in t['ring']]})
                src = 'traced'
        else:
            lot = containing(tgrid, p)
        key = id(lot) if lot else ('none', pl['k'])
        groups.setdefault(key, {'lot': lot, 'src': src, 'items': []})['items'].append((pl, p))

    used, out = set(), []
    offs, inlot, srcs = [], 0, {'council': 0, 'traced': 0, 'none': 0}
    for g in groups.values():
        lot, items = g['lot'], g['items']
        rings = split_lot(lot['ring'], [p for _, p in items]) if lot and len(items) > 1 else \
            [lot['ring'] if lot else None] * len(items)
        for (pl, p), ring in zip(items, rings):
            hid = make_id('kf', used, 'kulhudhuffushi', pl.get('pl'), pl['e'])
            if ring is None:
                srcs['none'] += 1
                near = roads.nearest(p, r=2)
                to = near[1] if near else (p[0], p[1] + 1)
                ring = rect_corners(p[0], p[1], math.atan2(to[1] - p[1], to[0] - p[0]), 13, 10)
            else:
                srcs[g['src']] += 1
            mc = centroid(ring)
            near = roads.nearest(mc, r=2)
            to = near[1] if near else (mc[0], mc[1] + 1)
            fp = island_footprint(ring, to)
            if not fp:
                continue
            corners, yard, front = fp
            if lot:
                # Irregular plots: draw the house smaller until it sits inside the plot (at most
                # four steps of 10%, about its own centre).
                for _ in range(4):
                    if all(inside(q, ring) or ring_dist(q, ring) < 0.5 for q in corners):
                        break
                    fx_, fy_ = centroid(corners)
                    corners = [(fx_ + (x - fx_) * 0.9, fy_ + (y - fy_) * 0.9) for x, y in corners]
            lot_area = area(ring) if lot else None
            c, f = encode(fr, corners)
            h = {'id': hid, 'n': [pl['e'], pl['d']]}
            if pl.get('pl'):
                h['pl'] = pl['pl']
            h['c'], h['f'] = c, f
            nm = named.nearest(mc, r=1)
            if nm and nm[0] < 30 and nm[2] is not None:
                h['r'] = nm[2]
            if near and near[0] < 40:
                h['fr'] = front
            h['d'] = island_design(hid, lot_area, yard)
            out.append(h)
            if lot:
                fc = centroid(corners)
                offs.append(math.hypot(fc[0] - mc[0], fc[1] - mc[1]))
                inlot += all(inside(q, ring) or ring_dist(q, ring) < 0.5 for q in corners)
    report['houses'] = len(out)
    report['ref'] = ref
    report['name_pairs'] = len(pairs)
    report['plot_source'] = srcs
    report['offset_from_plot_centre'] = stats('footprint centre to plot centre', offs)
    report['inside_plot'] = f'{inlot} of {len(offs)} footprints inside their plot'
    return out, roads.names, report


def build_male(cache):
    fr = Frame(4.175, 73.51)
    lots = fetch_layer(MALE_LOTS, 'FID,Name,Name_Dhiv,Ward,Landuse,Elevation,Road_Eng,Road_Dhiv,BlockNo',
                       cache, 'male-council-lots', 'FID')
    rds = fetch_layer(MALE_ROADS, 'FID,Name', cache, 'male-council-roads', 'FID')
    hdc = fetch_layer(HDC_BUILDINGS, 'OBJECTID,NAME,HEIGHT_M,LOT_NO,PHASE_NO', cache, 'hdc-buildings', 'OBJECTID')

    roads = Roads()
    road_dv = {}
    for f in lots:
        pr = f['properties']
        if (pr.get('Road_Eng') or '').strip() and (pr.get('Road_Dhiv') or '').strip():
            road_dv.setdefault(pr['Road_Eng'].strip().lower(), pr['Road_Dhiv'].strip())
    for f in rds:
        g = f.get('geometry') or {}
        en = (f['properties'].get('Name') or '').strip()
        nid = roads.name_id(en, road_dv.get(en.lower(), '')) if en else None
        lines = g.get('coordinates', []) if g.get('type') == 'MultiLineString' else \
            [g.get('coordinates', [])] if g.get('type') == 'LineString' else []
        for line in lines:
            pts = [fr.xy(lat, lng) for lng, lat in line]
            for a, b in zip(pts, pts[1:]):
                roads.add(a, b, nid)

    def clean(s):
        return re.sub(r'\s+', ' ', (s or '').strip())

    used, out, offs, edge = set(), [], [], []
    kinds = {}
    for f in lots:
        pr = f['properties']
        lu = pr.get('Landuse') or ''
        if lu.startswith('Residential'):
            kind = 'house'
        elif lu in ('Commercial Housing', 'Public Housing Units (Existing)'):
            kind = 'fl'
        else:
            continue
        en, dv = clean(pr.get('Name')), clean(pr.get('Name_Dhiv'))
        if not en and not dv:
            continue
        ring = outer_ring(f.get('geometry'), fr)
        if not ring or area(ring) < 20:
            continue
        fp = town_footprint(ring)
        if not fp:
            continue
        hid = make_id('ml', used, 'male', clean(pr.get('Ward')), pr.get('BlockNo'), en or dv)
        c, enc = encode(fr, fp)
        h = {'id': hid, 'n': [en, dv]}
        if pr.get('BlockNo'):
            h['pl'] = str(pr['BlockNo']).strip()
        h['c'], h['f'] = c, enc
        own = roads.index.get((clean(pr.get('Road_Eng')), road_dv.get(clean(pr.get('Road_Eng')).lower(), '')))
        mc = centroid(fp)
        near = roads.nearest(mc, prefer=own, r=1)
        if near and near[0] < 40:
            if near[2] is not None:
                h['r'] = near[2]
            h['fr'] = bearing(mc, near[1])
        h['d'] = town_design(hid, pr.get('Elevation'), kind)
        kinds[h['d']['t']] = kinds.get(h['d']['t'], 0) + 1
        out.append(h)
        lc = centroid(ring)
        offs.append(math.hypot(mc[0] - lc[0], mc[1] - lc[1]))
        edge += [ring_dist(p, ring) for p in fp]

    hb = 0
    for f in hdc:
        pr = f['properties']
        en = clean(pr.get('NAME'))
        if not en:
            continue
        ring = outer_ring(f.get('geometry'), fr)
        if not ring or area(ring) < 20:
            continue
        fp = town_footprint(ring)
        if not fp:
            continue
        hid = make_id('hm', used, 'hulhumale', pr.get('PHASE_NO'), pr.get('LOT_NO'), en)
        c, enc = encode(fr, fp)
        # Some HDC names are only a lot number: keep it as the plot number, not as a name.
        h = {'id': hid, 'n': ['' if en.isdigit() else en, '']}
        if pr.get('LOT_NO') or en.isdigit():
            h['pl'] = str(pr.get('LOT_NO') or en).strip()
        h['c'], h['f'] = c, enc
        h['d'] = town_design(hid, pr.get('HEIGHT_M'), 'hb')
        out.append(h)
        hb += 1
        mc, lc = centroid(fp), centroid(ring)
        offs.append(math.hypot(mc[0] - lc[0], mc[1] - lc[1]))
        edge += [ring_dist(p, ring) for p in fp]
    kinds['hb'] = hb
    report = {
        'houses': len(out), 'types': kinds,
        'offset_from_lot_centre': stats('footprint centre to lot centre', offs),
        'boundary': stats('footprint corner to lot outline', edge),
    }
    return out, roads.names, report


def main():
    args = sys.argv[1:]
    cache = None
    if '--cache' in args:
        i = args.index('--cache')
        cache = args[i + 1]
        del args[i:i + 2]
    out_path = None
    if '--out' in args:
        i = args.index('--out')
        out_path = args[i + 1]
        del args[i:i + 2]
    ref = 'traced'
    if '--ref' in args:
        i = args.index('--ref')
        ref = args[i + 1]
        del args[i:i + 2]
    area_name = args[0] if args else 'kulhudhuffushi'
    if area_name == 'kulhudhuffushi':
        houses, names, report = build_kulhudhuffushi(cache, ref)
    elif area_name == 'male':
        houses, names, report = build_male(cache)
    else:
        sys.exit(f'unknown area {area_name!r}: kulhudhuffushi | male')
    houses.sort(key=lambda h: h['id'])
    doc = {'v': 1, 'area': area_name, 'palette': PALETTE, 'roads': names, 'houses': houses}
    text = json.dumps(doc, ensure_ascii=False, separators=(',', ':'))
    path = Path(out_path) if out_path else ROOT / f'src/data/houses-{area_name}.json'
    path.write_text(text)
    report['size'] = f'{len(text.encode()) / 1024:.0f} KB, {len(gzip.compress(text.encode(), 9)) / 1024:.0f} KB gzipped'
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
