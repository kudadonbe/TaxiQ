#!/usr/bin/env python3
"""Build src/data/places.json (Kulhudhuffushi house / road / landmark names) from the published
Kulhudhuffushi City Map search site.

Source: https://mapkf.vercel.app/data.json, made by emjey (t.me/emjeyy) from the official
Kulhudhuffushi City Map (Secretariat of the Kulhudhuffushi City Council; chart by Adam Mohamed and
Hussain Ali). Used with permission. Credit both in the app.

  curl -s https://mapkf.vercel.app/data.json -o mapkf-data.json
  python3 scripts/import-places.py mapkf-data.json

The source stores points as 0..1 positions on the scanned chart. They're converted to lat/lng with
the site's own georeference (GEO + normToGeo in its index.html); re-copy GEO if the site updates it.

Output: [{"t": "h|r|l|p", "e": English, "d": Dhivehi, "k": search key, "pl": plot no., "p": [[lat, lng], ...]}]
  t: h = house, r = road (several points along it), l = landmark, p = unnamed plot
"""

import json
import sys
from pathlib import Path

GEO = dict(
    lat0=6.6308, lon0=73.0678, mx=110575.362, my=110574.0,
    a=0.0017065886, b=0.3313243388, tx=918.6410384, ty=373.7425223,
    cx=132.5, cy=104.0, cw=979.5, ch=647.5,
)


def norm_to_geo(nx: float, ny: float) -> list[float]:
    g = GEO
    x = nx * g["cw"] + g["cx"] - g["tx"]
    y = ny * g["ch"] + g["cy"] - g["ty"]
    s = g["a"] ** 2 + g["b"] ** 2
    dx = (g["a"] * x + g["b"] * y) / s
    dy = (g["b"] * x - g["a"] * y) / s
    return [round(g["lat0"] + dy / g["my"], 6), round(g["lon0"] + dx / g["mx"], 6)]


src = json.load(open(sys.argv[1]))
out = []
for item in src:
    if item.get("t") not in ("h", "r", "l", "p") or not item.get("p"):
        continue
    place = {
        "t": item["t"],
        "e": str(item.get("e", "")).strip(),
        "d": str(item.get("d", "")).strip(),
        "k": str(item.get("k", "")).strip().lower(),
        "p": [norm_to_geo(*pt) for pt in item["p"]],
    }
    if item.get("pl"):
        place["pl"] = str(item["pl"]).strip()
    out.append(place)

dest = Path(__file__).resolve().parent.parent / "src" / "data" / "places.json"
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"{len(out)} places -> {dest}")
