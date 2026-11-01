#!/usr/bin/env python3
"""Build src/data/roads.json (the demo map's road graph, Kulhudhuffushi) from an OpenStreetMap Overpass export.

Fetch the export (OSM data is (c) OpenStreetMap contributors, ODbL):

  curl -s --data-urlencode 'data=[out:json][timeout:60];way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|service|track)$"]["access"!~"no|private"]["service"!~"parking_aisle|driveway"](6.6080,73.0590,6.6380,73.0790);(._;>;);out body;' \
    https://overpass-api.de/api/interpreter -o roads-osm.json

Then: python3 scripts/build-roads.py roads-osm.json

Output: {"n": [[lat, lng], ...], "a": [[next node indexes], ...]} — a directed graph that honours
one-way streets, reduced to its largest strongly connected component so a car can always keep driving.
"""

import json
import sys
from pathlib import Path

src = json.load(open(sys.argv[1]))
nodes = {e["id"]: (e["lat"], e["lon"]) for e in src["elements"] if e["type"] == "node"}
adj: dict[int, set[int]] = {}

for way in (e for e in src["elements"] if e["type"] == "way"):
    tags = way.get("tags", {})
    ids = [i for i in way["nodes"] if i in nodes]
    oneway = tags.get("oneway")
    if tags.get("junction") == "roundabout" and oneway is None:
        oneway = "yes"
    for a, b in zip(ids, ids[1:]):
        if oneway == "-1":
            adj.setdefault(b, set()).add(a)
        else:
            adj.setdefault(a, set()).add(b)
            if oneway not in ("yes", "true", "1"):
                adj.setdefault(b, set()).add(a)
        adj.setdefault(a, set())
        adj.setdefault(b, set())

# Largest strongly connected component (iterative Tarjan).
index, low, on_stack, stack, comps = {}, {}, set(), [], []
counter = 0
for root in adj:
    if root in index:
        continue
    work = [(root, iter(adj[root]))]
    index[root] = low[root] = counter
    counter += 1
    stack.append(root)
    on_stack.add(root)
    while work:
        v, it = work[-1]
        advanced = False
        for w in it:
            if w not in index:
                index[w] = low[w] = counter
                counter += 1
                stack.append(w)
                on_stack.add(w)
                work.append((w, iter(adj[w])))
                advanced = True
                break
            if w in on_stack:
                low[v] = min(low[v], index[w])
        if advanced:
            continue
        work.pop()
        if work:
            low[work[-1][0]] = min(low[work[-1][0]], low[v])
        if low[v] == index[v]:
            comp = []
            while True:
                w = stack.pop()
                on_stack.discard(w)
                comp.append(w)
                if w == v:
                    break
            comps.append(comp)

keep = max(comps, key=len)
order = {osm_id: i for i, osm_id in enumerate(keep)}
out = {
    "n": [[round(nodes[i][0], 6), round(nodes[i][1], 6)] for i in keep],
    "a": [sorted(order[w] for w in adj[i] if w in order) for i in keep],
}
dest = Path(__file__).resolve().parent.parent / "src" / "data" / "roads.json"
dest.write_text(json.dumps(out, separators=(",", ":")) + "\n")
print(f"{len(keep)} nodes kept of {len(adj)} ({len(comps)} components); edges: {sum(map(len, out['a']))}; -> {dest}")
