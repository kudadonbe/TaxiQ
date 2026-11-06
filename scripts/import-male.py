#!/usr/bin/env python3
"""Build src/data/places-male.json: house, place and road names for the Malé area.

Sources (public ArcGIS feature services, used with permission; keep the credits in the app's map
attribution and the README):
  - Malé City Council: Malé lots, with house names in English and Dhivehi, ward, block and road
    https://services8.arcgis.com/X5BMOMb5BwtyTn3H/arcgis/rest/services/Male_Lots_28sep25_Public/FeatureServer/0
  - Housing Development Corporation (HDC): Hulhumalé lots and named buildings
    https://gis.hdc.mv/server/rest/services/DBO_Property_Public/FeatureServer/0 and /1

Output: the same Place shape as src/data/places.json (see src/places.ts):
  {t: 'h'|'r'|'l'|'p', e: English, d: Dhivehi, k: search key, pl?: block or lot, p: [[lat, lng], ...]}

Run from the repo root (standard library only):
    python3 scripts/import-male.py
It asks each service politely (one request at a time) and prints counts only.
"""

import json
import re
import time
import urllib.parse
import urllib.request

COUNCIL_LOTS = 'https://services8.arcgis.com/X5BMOMb5BwtyTn3H/arcgis/rest/services/Male_Lots_28sep25_Public/FeatureServer/0'
HDC_BUILDINGS = 'https://gis.hdc.mv/server/rest/services/DBO_Property_Public/FeatureServer/0'
HDC_LOTS = 'https://gis.hdc.mv/server/rest/services/DBO_Property_Public/FeatureServer/1'
OUT = 'src/data/places-male.json'
UA = 'TaxiQ data import (taxi queue app for Maldivian call centers)'

# Land uses that are places people go to, not homes (shown with the landmark icon).
LANDMARK = re.compile(r'institution|sports|tourism|transport|utility|industrial|community', re.I)


def fetch_all(url, fields):
    """All features of a layer as GeoJSON in lat/lng, page by page."""
    out, offset = [], 0
    while True:
        q = urllib.parse.urlencode({
            'where': '1=1', 'outFields': fields, 'outSR': 4326, 'f': 'geojson',
            'resultOffset': offset, 'resultRecordCount': 2000, 'orderByFields': 'OBJECTID' if 'gis.hdc' in url else 'FID',
        })
        req = urllib.request.Request(f'{url}/query?{q}', headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=120) as r:
            page = json.load(r)
        feats = page.get('features', [])
        out += feats
        if len(feats) < 2000:
            return out
        offset += len(feats)
        time.sleep(1)


def centre(geom):
    """A point inside the plot: the area-weighted centroid of its outer ring (lat, lng)."""
    if not geom:
        return None
    rings = geom['coordinates'] if geom['type'] == 'Polygon' else max(geom['coordinates'], key=lambda p: len(p[0]))
    ring = rings[0]
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        f = x1 * y2 - x2 * y1
        a += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(a) < 1e-14:
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        return [round(sum(ys) / len(ys), 6), round(sum(xs) / len(xs), 6)]
    return [round(cy / (3 * a), 6), round(cx / (3 * a), 6)]


def key(*names):
    """Search key, folded like src/places.ts: lowercase letters, digits and Thaana only."""
    return re.sub(r'[^a-z0-9\u0780-\u07bf]+', '', ''.join(n for n in names if n).lower())


def clean(s):
    return re.sub(r'\s+', ' ', (s or '').strip())


def main():
    places, roads = [], {}

    council = fetch_all(COUNCIL_LOTS, 'FID,Name,Name_Dhiv,Ward,Landuse,BlockNo,Road_Eng,Road_Dhiv')
    for f in council:
        a, at = f['properties'], centre(f.get('geometry'))
        if not at:
            continue
        name, dv = clean(a.get('Name')), clean(a.get('Name_Dhiv'))
        block = clean(a.get('BlockNo'))
        if name or dv:
            t = 'l' if LANDMARK.search(a.get('Landuse') or '') else 'h'
            places.append({'t': t, 'e': name, 'd': dv, 'k': key(name, dv, a.get('Ward')), **({'pl': block} if block else {}), 'p': [at]})
        road, road_dv = clean(a.get('Road_Eng')), clean(a.get('Road_Dhiv'))
        if road:
            r = roads.setdefault(road.lower(), {'e': road, 'd': road_dv, 'p': []})
            if len(r['p']) < 60:
                r['p'].append(at)
    print(f'Malé City Council: {len(council)} lots, {len(places)} named places, {len(roads)} roads')

    hdc_b = fetch_all(HDC_BUILDINGS, 'OBJECTID,NAME,LOT_NO')
    n0 = len(places)
    for f in hdc_b:
        a, at = f['properties'], centre(f.get('geometry'))
        name = clean(a.get('NAME'))
        if at and name:
            lot = clean(str(a.get('LOT_NO') or ''))
            places.append({'t': 'h', 'e': name, 'd': '', 'k': key(name, 'hulhumale', lot), **({'pl': lot} if lot else {}), 'p': [at]})
    print(f'HDC Hulhumalé: {len(hdc_b)} buildings, {len(places) - n0} named')

    hdc_l = fetch_all(HDC_LOTS, 'OBJECTID,LOT_NO,LANDUSE')
    n0 = len(places)
    for f in hdc_l:
        a, at = f['properties'], centre(f.get('geometry'))
        lot = clean(str(a.get('LOT_NO') or ''))
        if at and lot:
            places.append({'t': 'p', 'e': f'Hulhumalé lot {lot}', 'd': '', 'k': key('hulhumale lot', lot), 'pl': lot, 'p': [at]})
    print(f'HDC Hulhumalé: {len(hdc_l)} lots, {len(places) - n0} with a lot number')

    for r in roads.values():
        places.append({'t': 'r', 'e': r['e'], 'd': r['d'], 'k': key(r['e'], r['d']), 'p': r['p']})

    with open(OUT, 'w', encoding='utf8') as f:
        json.dump(places, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Wrote {OUT}: {len(places)} places')


if __name__ == '__main__':
    main()
