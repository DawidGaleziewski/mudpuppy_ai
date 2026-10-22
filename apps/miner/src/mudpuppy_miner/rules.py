"""Decision mining (spec 039 design § 11.3): one decision point's observation table in, a DMN-shaped
decision table out. Deterministic: fixed random state, sorted features and values.

Input (JSON, built by the TypeScript side from attribute snapshots, F-15@039):
    {"decision_point": {"screen": "SC-0012", "action": "button|oblicz|main|"},
     "types": {"derived.age_years": "number", "persona.segment": "enum"},
     "rows": [{"features": {"derived.age_years": 17, "persona.segment": "standard"},
               "target": "SC-0040 ok"}]}
Output: the `DecisionTable` shape of `@mudpuppy/model` (`rules/boundary.ts`), or
    {"needs_data": true, "rows_per_target": {...}} when a target has fewer than 5 rows.
"""

from __future__ import annotations

import math
from collections import Counter
from typing import Any

import numpy as np
from sklearn.tree import DecisionTreeClassifier

MIN_ROWS_PER_TARGET = 5
MAX_DEPTH = 4
MAX_CONDITIONS = 7
MAX_TEXT_VALUES = 20


def _columns(
    rows: list[dict[str, Any]], types: dict[str, str]
) -> list[tuple[str, str, str | None]]:
    """Model columns: (feature, kind, category). Numbers stay one column; categories one-hot."""
    cols: list[tuple[str, str, str | None]] = []
    for name in sorted(types):
        values = [r["features"].get(name) for r in rows]
        present = [v for v in values if v is not None]
        if len({str(v) for v in values}) <= 1:
            continue  # constant across all rows (missing everywhere included)
        kind = types[name]
        if kind in ("number", "bool") and all(isinstance(v, (int, float)) for v in present):
            cols.append((name, "number", None))
            continue
        categories = sorted({str(v) for v in present})
        if kind == "text" and len(categories) > MAX_TEXT_VALUES:
            continue  # an identifier, not a decision input
        cols.extend((name, "category", c) for c in categories)
    return cols


def _matrix(rows: list[dict[str, Any]], cols: list[tuple[str, str, str | None]]) -> np.ndarray:
    x = np.full((len(rows), len(cols)), np.nan)
    for i, r in enumerate(rows):
        for j, (name, kind, cat) in enumerate(cols):
            v = r["features"].get(name)
            if v is None:
                continue  # missing stays missing (scikit-learn >= 1.3 trees accept NaN)
            x[i, j] = float(v) if kind == "number" else float(str(v) == cat)
    return x


def _integer_valued(rows: list[dict[str, Any]], name: str) -> bool:
    vals = [r["features"].get(name) for r in rows]
    return all(v is None or float(v).is_integer() for v in vals)


def _conditions(path: list[tuple[int, str, float]], cols, rows) -> dict[str, str]:
    """Fold a root-to-leaf path into one condition per feature."""
    lo: dict[str, float] = {}
    hi: dict[str, float] = {}
    eq: dict[str, str] = {}
    neq: dict[str, set[str]] = {}
    for j, op, t in path:
        name, kind, cat = cols[j]
        if kind == "number":
            if op == "<=":
                hi[name] = min(hi.get(name, math.inf), t)
            else:
                lo[name] = max(lo.get(name, -math.inf), t)
        elif op == ">":
            eq[name] = str(cat)
        else:
            neq.setdefault(name, set()).add(str(cat))
    out: dict[str, str] = {}
    for name in sorted(set(lo) | set(hi)):
        whole = _integer_valued(rows, name)
        parts = []
        if name in lo:
            parts.append(f">= {math.floor(lo[name]) + 1}" if whole else f"> {lo[name]:g}")
        if name in hi:
            parts.append(f"< {math.floor(hi[name]) + 1}" if whole else f"<= {hi[name]:g}")
        out[name] = " and ".join(parts)
    for name, value in eq.items():
        out[name] = f"= {value}"
    for name, values in neq.items():
        if name in eq:
            continue
        seen = sorted(
            {str(r["features"].get(name)) for r in rows if r["features"].get(name) is not None}
        )
        allowed = [v for v in seen if v not in values]
        out[name] = f"in [{', '.join(allowed)}]"
    return dict(list(sorted(out.items()))[:MAX_CONDITIONS])


def _values_of(cond: str) -> set[str] | None:
    """The category values a condition allows (`= a`, `in [a, b]`), None for numeric ones."""
    if cond.startswith("= "):
        return {cond[2:]}
    if cond.startswith("in ["):
        return {s.strip() for s in cond[4:-1].split(",") if s.strip()}
    return None


def _merge_paths(rules: list[dict[str, Any]], rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge rules with the same outcome whose conditions differ only in one category feature
    and together allow every value seen: that feature does not matter for the outcome
    (design § 11.3 step 2)."""
    seen: dict[str, set[str]] = {}
    for r in rows:
        for k, v in r["features"].items():
            if v is not None:
                seen.setdefault(k, set()).add(str(v))
    changed = True
    while changed:
        changed = False
        for i, a in enumerate(rules):
            for j in range(i + 1, len(rules)):
                b = rules[j]
                if a["then"] != b["then"] or set(a["when"]) != set(b["when"]):
                    continue
                diff = [k for k in a["when"] if a["when"][k] != b["when"][k]]
                if len(diff) != 1:
                    continue
                k = diff[0]
                va, vb = _values_of(a["when"][k]), _values_of(b["when"][k])
                if va is None or vb is None:
                    continue
                union = va | vb
                when = {kk: vv for kk, vv in a["when"].items() if kk != k}
                if union != seen.get(k, set()):
                    when[k] = f"in [{', '.join(sorted(union))}]"
                rules = [
                    *rules[:i],
                    {"when": when, "then": a["then"]},
                    *rules[i + 1 : j],
                    *rules[j + 1 :],
                ]
                changed = True
                break
            if changed:
                break
    return rules


def _leaves(tree, cols) -> list[tuple[int, list[tuple[int, str, float]]]]:
    t = tree.tree_
    out: list[tuple[int, list[tuple[int, str, float]]]] = []

    def walk(node: int, path: list[tuple[int, str, float]]) -> None:
        if t.children_left[node] == -1:
            out.append((node, path))
            return
        j, thr = int(t.feature[node]), float(t.threshold[node])
        walk(int(t.children_left[node]), [*path, (j, "<=", thr)])
        walk(int(t.children_right[node]), [*path, (j, ">", thr)])

    walk(0, [])
    return out


def _holds(cond: str, v: Any) -> bool:
    if v is None:
        return False
    for part in cond.split(" and "):
        op, _, rhs = part.partition(" ")
        if op == "=":
            if str(v) != rhs:
                return False
        elif op == "in":
            if str(v) not in [s.strip() for s in rhs.strip("[]").split(",")]:
                return False
        else:
            x, t = float(v), float(rhs)
            if not {"<": x < t, "<=": x <= t, ">": x > t, ">=": x >= t}[op]:
                return False
    return True


def _allowed(rules: list[dict[str, Any]], features: dict[str, Any]) -> set[str]:
    return {
        r["then"] for r in rules if all(_holds(c, features.get(k)) for k, c in r["when"].items())
    }


def mine(table: dict[str, Any]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = table["rows"]
    types: dict[str, str] = table["types"]
    counts = Counter(r["target"] for r in rows)
    if len(counts) < 2 or min(counts.values()) < MIN_ROWS_PER_TARGET:
        return {"needs_data": True, "rows_per_target": dict(sorted(counts.items()))}
    cols = _columns(rows, types)
    targets = sorted(counts)
    y = np.array([targets.index(r["target"]) for r in rows])
    x = _matrix(rows, cols)
    leaf_min = max(2, math.ceil(0.02 * len(rows)))
    tree = DecisionTreeClassifier(
        criterion="entropy", max_depth=MAX_DEPTH, min_samples_leaf=leaf_min, random_state=0
    ).fit(x, y)
    leaf_of_row = tree.apply(x)
    rules: list[dict[str, Any]] = []
    for node, path in _leaves(tree, cols):
        here = [i for i in range(len(rows)) if leaf_of_row[i] == node]
        votes = Counter(int(y[i]) for i in here)
        majority, _ = sorted(votes.items(), key=lambda kv: (-kv[1], kv[0]))[0]
        when = _conditions(path, cols, rows)
        rules.append({"when": when, "then": targets[majority]})
        # Overlap step (Mannhardt et al.): misclassified rows mostly of one other target are an
        # alternative outcome under the same conditions.
        wrong = Counter(int(y[i]) for i in here if int(y[i]) != majority)
        if wrong:
            other, n = sorted(wrong.items(), key=lambda kv: (-kv[1], kv[0]))[0]
            if n >= leaf_min and n > sum(wrong.values()) / 2:
                rules.append({"when": when, "then": targets[other]})
    rules = _merge_paths(rules, rows)
    rules.sort(key=lambda r: (r["then"], sorted(r["when"].items())))
    allowed = [_allowed(rules, r["features"]) for r in rows]
    fitness = sum(r["target"] in a for r, a in zip(rows, allowed, strict=True)) / len(rows)
    precision = sum(1 / len(a) if a else 0 for a in allowed) / len(rows)
    overlap = any(len(a) > 1 for a in allowed)
    return {
        "decisionPoint": table["decision_point"],
        "hitPolicy": "C" if overlap else "U",
        "inputs": [{"name": n, "type": types[n]} for n in sorted({c[0] for c in cols})],
        "outputs": [{"name": "next", "type": "screen"}],
        "rules": rules,
        "fitness": round(fitness, 4),
        "precision": round(precision, 4),
        "rows": len(rows),
    }
