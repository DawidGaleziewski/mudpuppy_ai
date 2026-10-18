"""Process boundary communities (spec 039 design § 13.3): Leiden on the weighted screen graph the
reconciler computes, seed 0, resolution 1.0. Deterministic for the same graph.

Input:  {"nodes": ["SC-0001", ...], "edges": [{"a": "SC-0001", "b": "SC-0002", "w": 3.5}, ...]}
Output: {"communities": [["SC-0001", "SC-0002"], ...]}  (each sorted; communities by first node)
"""

from __future__ import annotations

from typing import Any

import igraph as ig
import leidenalg


def communities(graph: dict[str, Any]) -> dict[str, Any]:
    nodes = sorted(set(graph["nodes"]))
    index = {n: i for i, n in enumerate(nodes)}
    pairs: dict[tuple[int, int], float] = {}
    for e in graph["edges"]:
        a, b = index[e["a"]], index[e["b"]]
        if a == b:
            continue
        key = (min(a, b), max(a, b))
        pairs[key] = pairs.get(key, 0.0) + float(e["w"])
    g = ig.Graph(n=len(nodes), edges=sorted(pairs))
    weights = [pairs[k] for k in sorted(pairs)]
    if not nodes:
        return {"communities": []}
    part = leidenalg.find_partition(
        g,
        leidenalg.RBConfigurationVertexPartition,
        weights=weights if weights else None,
        resolution_parameter=1.0,
        seed=0,
    )
    groups = sorted((sorted(nodes[i] for i in c) for c in part), key=lambda c: c[0])
    return {"communities": groups}
