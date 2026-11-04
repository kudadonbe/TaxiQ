#!/usr/bin/env python3
"""Redraw the Kulhudhuffushi City Council plot chart as vector polygons -> src/data/plots.json.

Source: the council chart published as tiles on https://mapkf.vercel.app (by emjey; chart by the
Secretariat of the Kulhudhuffushi City Council, drawn by Adam Mohamed and Hussain Ali). Used with
permission. Tracing the chart gives one polygon per plot, so the map stays sharp at any zoom and
each plot can carry its house names.

Needs (dev only, not app dependencies): numpy, opencv-python-headless, shapely, pillow.

  python3 -m venv /tmp/plots-venv && /tmp/plots-venv/bin/pip install numpy opencv-python-headless shapely pillow
  # zoom-6 tiles (46 x 31), into an empty folder:
  for y in $(seq 0 30); do for x in $(seq 0 45); do
    echo "url = \"https://mapkf.vercel.app/tiles/6/$x/$y.jpg\""; echo "output = \"6_${x}_${y}.jpg\""; done; done > list.txt
  (mkdir tiles && cd tiles && curl -s --parallel -K ../list.txt)
  /tmp/plots-venv/bin/python scripts/build-plots.py tiles

How it works: pixels are classed as white (roads, sea), dark (boundary lines) or fill (coloured or
grey plot areas). Letters are small dark blobs and are treated as fill so text doesn't cut plots.
Each connected fill region becomes a plot polygon (outer contour, simplified), coloured with its
median fill colour, converted to lat/lng with the same georeference as places.json, and given the
names of the houses whose points fall inside it.

Output: [{"c": "#rrggbb", "p": [[lat, lng], ...], "h"?: [[English, Dhivehi], ...], "pl"?: "117"}]
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from shapely.geometry import Point, Polygon
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
W, H = 47016 // 4, 31080 // 4  # chart size at zoom 6 (native zoom 8)
COLS, ROWS = 46, 31

GEO = dict(
    lat0=6.6308, lon0=73.0678, mx=110575.362, my=110574.0,
    a=0.0017065886, b=0.3313243388, tx=918.6410384, ty=373.7425223,
    cx=132.5, cy=104.0, cw=979.5, ch=647.5,
)


def px_to_geo(x: float, y: float) -> list[float]:
    g = GEO
    X = (x / W) * g["cw"] + g["cx"] - g["tx"]
    Y = (y / H) * g["ch"] + g["cy"] - g["ty"]
    s = g["a"] ** 2 + g["b"] ** 2
    dx = (g["a"] * X + g["b"] * Y) / s
    dy = (g["b"] * X - g["a"] * Y) / s
    return [round(g["lat0"] + dy / g["my"], 6), round(g["lon0"] + dx / g["mx"], 6)]


def stitch(tiles: Path) -> np.ndarray:
    img = Image.new("RGB", (W, H), "white")
    for y in range(ROWS):
        for x in range(COLS):
            f = tiles / f"6_{x}_{y}.jpg"
            if f.exists():
                img.paste(Image.open(f).convert("RGB"), (x * 256, y * 256))
    return cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)


def trace(bgr: np.ndarray) -> list[tuple[Polygon, str]]:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    s = hsv[:, :, 1].astype(np.int16)
    v = hsv[:, :, 2].astype(np.int16)
    white = (s < 28) & (v > 225)
    dark = v < 120
    dn, dlab, dstats, _ = cv2.connectedComponentsWithStats(dark.astype(np.uint8), connectivity=8)
    small = (np.maximum(dstats[:, 2], dstats[:, 3]) < 34) & (dstats[:, 4] < 500)
    small[0] = False
    dark &= ~small[dlab]
    mask = ((~white & ~dark).astype(np.uint8)) * 255
    mask = cv2.erode(mask, np.ones((3, 3), np.uint8), iterations=1)

    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=4)
    out = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < 120 or w > 4000 or h > 4000:
            continue
        comp = (labels[y:y + h, x:x + w] == i).astype(np.uint8)
        contours, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        c = max(contours, key=cv2.contourArea)
        if len(c) < 3:
            continue
        poly = Polygon((c[:, 0, :] + [x, y]).tolist())
        if not poly.is_valid:
            poly = poly.buffer(0)
        poly = poly.buffer(1.6, join_style=2).simplify(1.2, preserve_topology=True)
        if poly.is_empty or poly.geom_type != "Polygon" or poly.area < 150:
            continue
        b, g, r = np.median(bgr[y:y + h, x:x + w][comp.astype(bool)], axis=0).astype(int)
        out.append((poly, f"#{r:02x}{g:02x}{b:02x}"))
    return out


def main() -> None:
    plots = trace(stitch(Path(sys.argv[1])))
    geo = [(Polygon([px_to_geo(x, y) for x, y in p.exterior.coords]), c) for p, c in plots]
    tree = STRtree([g for g, _ in geo])

    places = json.load(open(ROOT / "src" / "data" / "places.json", encoding="utf-8"))
    names: dict[int, list] = {}
    numbers: dict[int, str] = {}
    for place in places:
        if place["t"] != "h":
            continue
        pt = Point(place["p"][0])
        for idx in tree.query(pt, predicate="within"):
            names.setdefault(int(idx), []).append([place["e"], place["d"]])
            if place.get("pl"):
                numbers.setdefault(int(idx), place["pl"])
            break

    out = []
    for i, (poly, colour) in enumerate(geo):
        item = {"c": colour, "p": [list(xy) for xy in poly.exterior.coords][:-1]}
        if i in names:
            item["h"] = names[i]
        if i in numbers:
            item["pl"] = numbers[i]
        out.append(item)

    dest = ROOT / "src" / "data" / "plots.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    named = sum(1 for x in out if "h" in x)
    houses = sum(1 for p in places if p["t"] == "h")
    matched = sum(len(x.get("h", [])) for x in out)
    print(f"{len(out)} plots ({named} with house names; {matched} of {houses} houses matched) -> {dest}")


main()
