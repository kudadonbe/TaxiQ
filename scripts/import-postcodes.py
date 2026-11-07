#!/usr/bin/env python3
"""Add Maldives Post postcodes to Malé houses in src/data/places-male.json (field `pc`).

Source: the Maldives Post postcode finder (https://maldivespost.com/post-code), its public search
API, used with permission. Keep the credit in the app's map attribution and the README.

How: search the finder road by road (the 245 Malé roads in places-male.json), one request a second,
then match each address to a house by name. If a name has postcodes on more than one road, the road
nearest to the house on the map decides. Results are cached so a stopped run resumes:

    /usr/bin/python3 scripts/import-postcodes.py [cache.json]

Prints counts only. Run scripts/import-male.py first (it rebuilds places-male.json without postcodes).
"""

import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request

API = 'https://maldivespost.com/api/postcodes'
UA = 'Mozilla/5.0 (TaxiQ postcode import; taxi queue app for Maldivian call centers)'
PLACES = 'src/data/places-male.json'
CACHE = sys.argv[1] if len(sys.argv) > 1 else '/tmp/taxiq-postcodes-cache.json'


def fold(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def loose(s):
    """Spelling variants of Maldivian names in Latin letters folded together: ee/ii -> i, oo/uu -> u,
    aa -> a, dh -> d, th -> t, w -> v, ey -> e, and doubled letters as one."""
    s = fold(s)
    for a, b in (('ee', 'i'), ('ii', 'i'), ('oo', 'u'), ('uu', 'u'), ('aa', 'a'), ('dh', 'd'), ('th', 't'), ('w', 'v'), ('ey', 'e')):
        s = s.replace(a, b)
    return re.sub(r'(.)\1+', r'\1', s)


LOOSE_ROAD_M = 150  # a loose match counts only if its road runs within this of the house


def get(params):
    url = f'{API}?{urllib.parse.urlencode(params)}'
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('postcode finder not answering')


def addresses_on(road):
    """Every address the finder lists on a road: [(house, road, postcode)]."""
    rows, page = [], 1
    while True:
        d = get({'filter': 'road', 'island': 'Male', 'term': road, 'page': page})
        for x in d.get('data', []):
            parts = [p.strip() for p in (x.get('formatted_address') or '').split(',')]
            if len(parts) >= 3 and parts[-2].lower().startswith('male'):
                rows.append((parts[0], parts[1], str(x.get('code') or parts[-1])))
        time.sleep(1)
        if page >= (d.get('last_page') or 1):
            return rows
        page += 1


def metres(a, b):
    k = math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * k)


def main():
    places = json.load(open(PLACES, encoding='utf8'))
    roads = [p for p in places if p['t'] == 'r']
    try:
        cache = json.load(open(CACHE))
    except (OSError, ValueError):
        cache = {}
    for i, r in enumerate(roads):
        if r['e'] in cache:
            continue
        cache[r['e']] = addresses_on(r['e'])
        json.dump(cache, open(CACHE, 'w'))
        if (i + 1) % 25 == 0:
            print(f'{i + 1}/{len(roads)} roads searched')

    # house name -> {road (folded): postcode}
    by_name, by_loose = {}, {}
    for rows in cache.values():
        for house, road, code in rows:
            by_name.setdefault(fold(house), {})[fold(road)] = code
            by_loose.setdefault(loose(house), {})[fold(road)] = code
    road_pts = [(fold(r['e']), pt) for r in roads for pt in r['p']]

    matched = loose_matched = 0
    for p in places:
        p.pop('pc', None)
        if p['t'] not in ('h', 'l') or not p['e']:
            continue
        codes = by_name.get(fold(p['e']))
        if not codes:
            # Loose spelling: only if that postcode's road runs near the house.
            codes = by_loose.get(loose(p['e']))
            if not codes:
                continue
            near = {name for name, pt in road_pts if metres(p['p'][0], pt) <= LOOSE_ROAD_M}
            close = {road: code for road, code in codes.items() if road in near}
            if len(set(close.values())) != 1:
                continue
            p['pc'] = next(iter(close.values()))
            matched += 1
            loose_matched += 1
            continue
        if len(set(codes.values())) == 1:
            p['pc'] = next(iter(codes.values()))
        else:
            # Same name on several roads: the road nearest to the house decides.
            near = sorted(road_pts, key=lambda x: metres(p['p'][0], x[1]))
            pick = next((codes[name] for name, _ in near[:200] if name in codes), None)
            if not pick:
                continue
            p['pc'] = pick
        matched += 1

    json.dump(places, open(PLACES, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
    addresses = sum(len(v) for v in cache.values())
    houses = sum(1 for p in places if p['t'] in ('h', 'l') and p['e'])
    print(f'Postcode finder: {addresses} addresses on {len(cache)} roads. Matched {matched} of {houses} named places ({matched - loose_matched} exact, {loose_matched} by loose spelling near their road).')


if __name__ == '__main__':
    main()
