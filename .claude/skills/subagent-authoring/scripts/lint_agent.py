#!/usr/bin/env python3
"""Deterministic checks for a Claude Code subagent file. Stdlib only.

Usage: lint_agent.py <agent.md> [--root <repo>] [--json]
Exit code 1 if any error-level finding, else 0.
"""
import argparse, json, re, sys
from pathlib import Path

KNOWN = {"name", "description", "tools", "disallowedTools", "model", "permissionMode", "maxTurns",
         "skills", "mcpServers", "hooks", "memory", "background", "omitClaudeMd", "effort",
         "isolation", "color", "initialPrompt", "experimental"}
BODY_WARN, BODY_ERROR = 400, 800
DESC_WARN, DESC_ERROR = 60, 100
NGRAM = 8


def split_frontmatter(text):
    m = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n?(.*)$", text, re.S)
    return (m.group(1), m.group(2)) if m else (None, text)


def parse_fm(raw):
    """Top-level keys only; nested/indented content is kept as the raw value string."""
    fm, key = {}, None
    for line in raw.splitlines():
        m = re.match(r"^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$", line)
        if m:
            key = m.group(1)
            fm[key] = m.group(2).strip()
        elif key and line.strip():
            fm[key] = (fm[key] + " " + line.strip()).strip()
    for k, v in fm.items():
        if len(v) > 1 and v[0] == v[-1] and v[0] in "\"'":
            fm[k] = v[1:-1]
        elif v in (">", "|", ">-", "|-"):
            fm[k] = ""
        else:
            fm[k] = re.sub(r"^[>|]-?\s*", "", v)
    return fm


def items(v):
    return [x.strip().lstrip("- ").strip() for x in re.split(r"[,\n]| - ", v.strip("[]")) if x.strip().lstrip("- ").strip()]


def words(s):
    return re.findall(r"\S+", s)


def ngrams(s):
    w = re.findall(r"[a-z0-9]+", s.lower())
    return {" ".join(w[i:i + NGRAM]) for i in range(len(w) - NGRAM + 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--root", default=".")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    path, root = Path(a.file), Path(a.root).resolve()
    text = path.read_text(encoding="utf-8")
    out, metrics = [], {}

    def add(level, code, msg):
        out.append({"level": level, "code": code, "message": msg})

    raw, body = split_frontmatter(text)
    if raw is None:
        add("error", "no-frontmatter", "missing --- frontmatter block")
        fm = {}
    else:
        fm = parse_fm(raw)

    name, desc = fm.get("name", ""), fm.get("description", "")
    if not name:
        add("error", "name-missing", "name is required")
    elif not re.fullmatch(r"[a-z][a-z0-9-]*", name):
        add("error", "name-format", f"name '{name}' must be lowercase letters/hyphens (no ':')")
    elif name != path.stem:
        add("warn", "name-filename", f"name '{name}' differs from filename '{path.stem}'")
    for k in fm:
        if k not in KNOWN:
            add("error", "unknown-field", f"unknown frontmatter field '{k}' (typo?)")

    dw = len(words(desc))
    metrics["description_words"] = dw
    if not desc:
        add("error", "description-missing", "description is required")
    elif dw > DESC_ERROR:
        add("error", "description-long", f"{dw} words; the description is a router, target ≤50")
    elif dw > DESC_WARN:
        add("warn", "description-long", f"{dw} words; target ≤50")
    if re.search(r"\bexamples?\s*:|<example>|e\.g\.", desc, re.I) or desc.count('"') >= 4:
        add("warn", "description-examples", "examples inside the description; move them to the body or drop them")
    if desc and not re.search(r"\b(use|when|for)\b", desc, re.I):
        add("warn", "description-trigger", "no trigger phrase ('Use when …'); delegation may be unreliable")

    bw = len(words(body))
    metrics["body_words"] = bw
    if bw > BODY_ERROR:
        add("error", "body-size", f"{bw} words in body (>{BODY_ERROR}); classify keep/move/delete and split")
    elif bw > BODY_WARN:
        add("warn", "body-size", f"{bw} words in body (>{BODY_WARN}); target ≤250")
    shouty = len(re.findall(r"\b(MUST|NEVER|ALWAYS|NON-NEGOTIABLE|CRITICAL)\b", body))
    metrics["shouty_terms"] = shouty
    if shouty > 5:
        add("warn", "shouty", f"{shouty} all-caps directives; give reasons instead, or enforce with a hook")
    if re.search(r"^\s*(you are|act as) an? .*(expert|world-class|senior)", body, re.I | re.M):
        add("note", "persona", "generic expert persona line; state the job instead")
    if not re.search(r"(?im)^#+\s*(return|output|report|final)|\breturn\b.{0,80}\b(summary|report|lines|json)\b", body):
        add("warn", "no-return-contract", "no obvious return/output contract; the parent sees only the final message")
    if re.search(r"(?i)\bask (the user|me)\b|\bask rather than guess\b|\bask clarifying", body):
        add("warn", "asks-user", "tells a subagent to ask the user; it cannot converse. Return open questions instead")

    tools, disallowed, skills = items(fm.get("tools", "")), items(fm.get("disallowedTools", "")), items(fm.get("skills", ""))
    metrics["tools"] = tools or "inherit-all"
    if "tools" not in fm and "disallowedTools" not in fm:
        add("warn", "tools-inherit-all", "no tools/disallowedTools: inherits every tool incl. MCP; prefer an explicit allowlist")
    if tools:
        if re.search(r"\bskills?\b", body, re.I) and "Skill" not in tools:
            add("warn", "skill-tool-missing", "body mentions skills but 'Skill' is not in tools; on-demand skills are unavailable")
        if any(t.startswith("Agent") for t in tools):
            add("note", "agent-tool", "Agent tool allows nesting; confirm the agent really delegates")
        if {"WebSearch", "WebFetch"} & set(tools):
            add("note", "web-tools", "web tools granted; confirm the job needs them")
    if re.search(r"(?i)read.?only|^(reviews?|audits?|inspects?|analy[sz]es?)\b", desc) and {"Write", "Edit"} & set(tools):
        add("warn", "readonly-with-write", "described as review/read-only but has Write/Edit")
    if fm.get("permissionMode") == "bypassPermissions":
        add("warn", "bypass-permissions", "bypassPermissions on a shared agent needs justification")
    for s in skills:
        sk = root / ".claude" / "skills" / s / "SKILL.md"
        if sk.exists():
            n = len(words(sk.read_text(encoding="utf-8")))
            add("note", "skill-preload", f"skills: '{s}' preloads full text (~{n} words) on every run")
        else:
            add("warn", "skill-missing", f"skills: '{s}' not found under .claude/skills")

    # dead paths: backticked repo-relative paths
    for p in sorted(set(re.findall(r"`([A-Za-z0-9_.\-]+(?:/[A-Za-z0-9_.\-]+)+/?)`", body))):
        if any(c in p for c in "<>*{}") or p.startswith(("http", "~")):
            continue
        if not (root / p).exists():
            add("note", "path-missing", f"`{p}` not found under {root} (may be planned/generated)")

    # duplication vs. files the agent already loads
    body_grams, dup_sources = ngrams(body), {}
    for rel in ("CLAUDE.md", ".specify/memory/constitution.md"):
        f = root / rel
        if f.exists() and body_grams:
            shared = body_grams & ngrams(f.read_text(encoding="utf-8"))
            if shared:
                dup_sources[rel] = len(shared)
    metrics["duplicated_8grams"] = dup_sources
    for rel, n in dup_sources.items():
        add("warn" if n >= 5 else "note", "duplicates-loaded-file", f"{n} {NGRAM}-word runs also appear in {rel}; point to it instead of restating")

    if a.json:
        print(json.dumps({"file": str(path), "metrics": metrics, "findings": out}, indent=2))
    else:
        print(f"{path}  body={bw}w  description={dw}w  tools={metrics['tools']}  dup={dup_sources or 0}")
        for f in sorted(out, key=lambda x: ["error", "warn", "note"].index(x["level"])):
            print(f"  [{f['level']:5}] {f['code']}: {f['message']}")
        if not out:
            print("  clean")
    sys.exit(1 if any(f["level"] == "error" for f in out) else 0)


if __name__ == "__main__":
    main()
