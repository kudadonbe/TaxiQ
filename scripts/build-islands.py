#!/usr/bin/env python3
"""Build src/data/islands.json: Maldivian island and settlement names for the map labels.

Source: OpenStreetMap (c) OpenStreetMap contributors, ODbL. Fetch:

  curl -s --data-urlencode 'data=[out:json][timeout:110];(node["place"~"^(island|islet|town|village|city)$"]["name"](-0.8,72.4,7.2,73.9);way["place"~"^(island|islet)$"]["name"](-0.8,72.4,7.2,73.9);relation["place"~"^(island|islet)$"]["name"](-0.8,72.4,7.2,73.9););out center tags;' \
    https://overpass-api.de/api/interpreter -o islands-osm.json
  python3 scripts/build-islands.py islands-osm.json

Output: [{"e": English, "d": Dhivehi, "r": rank, "p": [lat, lng]}]
  r = 1 city/town (shown from far out), 2 island or village, 3 islet (shown close in)
"""

import json
import math
import re
import sys
from pathlib import Path

THAANA = re.compile(r"[ހ-޿]")
src = json.load(open(sys.argv[1], encoding="utf-8"))["elements"]


def point(e):
    if e["type"] == "node":
        return e["lat"], e["lon"]
    c = e.get("center")
    return (c["lat"], c["lon"]) if c else None


def names(tags):
    name = tags.get("name", "").strip()
    en = tags.get("name:en", "").strip() or ("" if THAANA.search(name) else name)
    dv = tags.get("name:dv", "").strip() or (name if THAANA.search(name) else "")
    return en, dv


# Known fixes where OSM lacks a Dhivehi name or uses an odd spelling (keyed by OSM English name).
FIXES = {
    "Vilimale'": ("Villimalé", "ވިލިމާލެ"),
}

RANK = {"city": 1, "town": 1, "village": 2, "island": 2, "islet": 3}
items = []
for e in src:
    p = point(e)
    en, dv = names(e.get("tags", {}))
    if en in FIXES:
        en, dv = FIXES[en][0], dv or FIXES[en][1]
    if not p or not (en or dv):
        continue
    items.append({"e": en, "d": dv, "r": RANK.get(e["tags"].get("place"), 3), "p": [round(p[0], 5), round(p[1], 5)]})


def metres(a, b):
    k = math.cos(math.radians(a[0]))
    return math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * k)


# An island and the town on it are often both mapped: keep one label, the higher-ranked one,
# filling in whichever name the other has.
items.sort(key=lambda x: x["r"])
kept = []
for it in items:
    dup = next((k for k in kept if metres(k["p"], it["p"]) < 1500 and ((it["e"] and it["e"] == k["e"]) or (it["d"] and it["d"] == k["d"]))), None)
    if dup:
        dup["e"] = dup["e"] or it["e"]
        dup["d"] = dup["d"] or it["d"]
        continue
    kept.append(it)

dest = Path(__file__).resolve().parent.parent / "src" / "data" / "islands.json"
dest.write_text(json.dumps(kept, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
by = {r: sum(1 for k in kept if k["r"] == r) for r in (1, 2, 3)}
print(f"{len(kept)} labels (towns {by[1]}, islands {by[2]}, islets {by[3]}) -> {dest}")
