"""Spec → HTML. Python builds a small view-model per component; Jinja templates only display it.

- Placement comes from catalogue.place(spec, layout); the model never picks where things go.
- Frame ids are `t{turn}-{component id}` (e.g. `t3-map`), so cards from different turns never collide.
- Live regions are Jinja blocks named `live_<name>` around an element with id `<frame id>-<name>`. The stream re-renders
  just those blocks and sends them as htmx out-of-band swaps (innerHTML), so scroll and focus stay put.
- Why this view? and Right view? appear once per view, on its lead frame (the spec's first component).
- Autoescape is on. Nothing from a spec is ever marked safe.
"""
import json
from pathlib import Path
from urllib.parse import urlencode

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup

import catalogue as cat
import fixture as fx
from events import scan_state

env = Environment(loader=FileSystemLoader(Path(__file__).parent / "templates"),
                  autoescape=select_autoescape(["html", "j2"], default=True), trim_blocks=True, lstrip_blocks=True)
env.filters["tojson_attr"] = lambda v: json.dumps(v, ensure_ascii=False)   # used inside "…" attributes; autoescaped
env.filters["short_id"] = fx.short_id                                        # scan ids: 13-character short form for display

TITLES = {"LiveMap": "Live map", "ScanMeter": "Scan", "Narration": "What it did", "EventTail": "Last events",
          "FixChoices": "Try next", "AttemptList": "Attempts", "Compare": "Before / after"}
EDGES = {2: (1, 2), 3: (2, 3), 4: (3, 4), 5: (1, 5), 6: (5, 6)}
GRID = {1: (0, 100), 2: (160, 0), 3: (320, 0), 4: (480, 0), 5: (160, 205), 6: (320, 205), "q": (480, 205)}
STATUS_WORD = {"running": "Crawler here", "failed": "Failed here", "ok": "Visited"}
# A stopped scan is ash (stopped); only the stop REASON is red (docs/03 §4 rule 5).
SCAN_WORD = {"waiting": ("queued", "Waiting to start"), "running": ("running", "Running"), "stopped": ("stopped", "Stopped")}
LIVE_BLOCKS = {"ScanMeter": ["meter"], "PageDetail": ["detail"], "Narration": ["lines"], "ErrorCard": ["error"],
               "EventTail": ["tail"], "AttemptList": ["attempts"], "FixChoices": ["fix"]}


class Renderer:
    """Bundles what every template needs: the session, engine, commands, phase and layout."""

    def __init__(self, sess, engine, cmds, csrf=""):
        self.sess, self.engine, self.cmds, self.csrf = sess, engine, cmds, csrf

    # -- helpers -------------------------------------------------------------
    @property
    def view(self):
        return self.sess.views.get(self.sess.current)

    @property
    def phase(self):
        return self.sess.phase

    def layout_of(self, view):
        return cat.layout_for(view.path if view else "chat", self.sess.phase, self.sess.focus)

    def state(self, scan):
        return scan_state(self.engine, scan) if scan else None

    def url(self, view, **over):
        q = {"path": view.path if view else "chat", "scan": view.scan if view else None, "sel": view.sel if view else None}
        q.update(over)
        return "/workbench?" + urlencode({k: v for k, v in q.items() if v})

    def stream_url(self):
        """One stream per conversation; it starts where this page's render left off (outbox count | last event)."""
        v = self.view
        cursor = f"{len(self.sess.outbox)}|{self.engine.last_id(v.scan) if v and v.scan else ''}"
        return "/workbench/stream?" + urlencode({"c": self.sess.id, "last_event_id": cursor})

    def selected(self, view, st):
        if view.sel:
            return view.sel
        sel = view.spec.get("select") if view.spec else None
        if isinstance(sel, dict):
            p = fx.find_page(sel["route"], sel.get("state"))
            if p and st and any(v["key"] == fx.page_key(p) for v in st["visits"]):
                return fx.page_key(p)
        return st["visits"][-1]["key"] if st and st["visits"] else None

    def cid(self, view, c):
        return f"{view.tid}-{c['id']}"

    def is_lead(self, view, c):
        return bool(view.spec["components"]) and view.spec["components"][0]["id"] == c["id"]

    def ask(self, scan, v, step=None):
        label = fx.page_label(v) + (f" · step {step}" if step and not v.get("state") else "")
        failed = fx.SUGGESTIONS_FOR_FAILED if self.phase >= 2 else fx.SUGGESTIONS_FOR_FAILED_P1
        return {"kind": "page", "scan": scan, "route": v["route"], "state": v.get("state"), "label": label,
                "suggest": failed if v.get("status") == "failed" else fx.SUGGESTIONS_FOR_PAGE}

    # -- view-models ------------------------------------------------------------
    def vm(self, view, c, place):
        st = self.state(c["bind"].get("scan"))
        fn = getattr(self, "vm_" + c["type"], None)
        base = dict(type=c["type"], scan=st, props=c.get("props", {}), place=place)
        return dict(base, **(fn(view, c, place, st) if fn else {}))

    def map_mode(self, c, place):
        return "filmstrip" if place == "card" else c.get("props", {}).get("view", "graph")

    def vm_LiveMap(self, view, c, place, st):
        focus = self.layout_of(view) == "focus"
        scale, w, h, mh = (1.0, 130, 168, 56) if focus else (0.85, 122, 152, 42)
        pos = {k: (round(x * scale), round(y * scale)) for k, (x, y) in GRID.items()}
        sel = self.selected(view, st)
        nodes = []
        for v in st["visits"]:
            x, y = pos[v["k"]]
            page = fx.PAGES[v["k"] - 1]
            nodes.append(dict(v, x=x, y=y, mini=page["mini"], word=STATUS_WORD[v["status"]],
                              ds={"running": "here", "failed": "failed"}.get(v["status"], ""),
                              pressed="true" if v["key"] == sel else "false", label=fx.page_label(v),
                              ask=self.ask(st["id"], v, st["stop_step"] if v["status"] == "failed" else None),
                              select=f"/workbench/select?{urlencode({'view': view.id, 'sel': v['key']})}"))
        seen = {v["k"] for v in st["visits"]}
        edges = []
        for k, (a, b) in EDGES.items():
            if a in seen and b in seen:
                (ax, ay), (bx, by) = pos[a], pos[b]
                x1, y1, x2, y2 = ax + w, ay + h // 2, bx, by + h // 2
                mx = (x1 + x2) // 2
                last = st["visits"][-1]["k"] == b
                cls = "sy-edge" + (" sy-edge--process" if last and st["status"] == "running" else "") + \
                      (" sy-edge--failed" if last and st["visits"][-1]["status"] == "failed" else "")
                edges.append(dict(d=f"M{x1} {y1} C{mx} {y1} {mx} {y2} {x2} {y2}", cls=cls))
        qx, qy = pos["q"]
        return dict(mode=self.map_mode(c, place), nodes=nodes, edges=edges, w=w, h=h, mh=mh, q=dict(x=qx, y=qy),
                    cw=pos[4][0] + w + 10, ch=pos[6][1] + h + 10, follow=c.get("props", {}).get("follow", True),
                    meter=self.vm_ScanMeter(view, c, place, st))

    def vm_ScanMeter(self, view, c, place, st):
        return dict(pct=round(st["steps"] / st["limit"] * 100, 2), status=SCAN_WORD[st["status"]][0],
                    can_stop=st["status"] == "running")

    def vm_PageDetail(self, view, c, place, st):
        page = c["bind"].get("page")
        key = self.selected(view, st) if page == "@selected" else fx.page_key(fx.find_page(page["route"], page.get("state")))
        v = next((v for v in st["visits"] if v["key"] == key), None)
        if not v:
            return dict(page=None)
        failed = v["status"] == "failed"
        return dict(page=dict(v, word=STATUS_WORD[v["status"]], label=fx.page_label(v)), failed=failed,
                    ask=self.ask(st["id"], v, st["stop_step"] if failed else None),
                    troubleshoot=self.url(view, path="troubleshoot", sel=key) if failed and self.phase >= 2 else None,
                    can_mark=self.phase >= 2)

    def vm_Narration(self, view, c, place, st):
        lines = []
        by_ref = {ev.ref: ev for ev in st["events"]}
        for ln in st["narration"]:
            ev = by_ref.get(ln["cites"][0])
            lines.append(dict(ln, at=ev.data.get("at", "") if ev else "",
                              cites=[dict(ref=r, label="step " + r.split("#")[1], title=f"Event {fx.short_id(r.split('#')[0])}#{r.split('#')[1]}",
                                          href=f"/workbench/events/{r.replace('#', '/')}")
                                     for r in ln["cites"]]))
        return dict(lines=lines, live=st["status"] == "running")

    def vm_ErrorCard(self, view, c, place, st):
        return dict(stopped=st["status"] == "stopped", continued=st["continued_by"],
                    troubleshoot=self.url(view, path="troubleshoot") if self.phase >= 2 else None,
                    ask=self.ask(st["id"], st["visits"][-1], st["stop_step"]) if st["visits"] else None)

    def vm_StepShot(self, view, c, place, st):
        step = c["bind"]["step"]
        ev = next((e for e in st["events"] if e.step == step), None)
        return dict(step=step, at=ev.data.get("at") if ev else None, mark=c.get("props", {}).get("mark", "target"),
                    title=next((v["title"] for v in st["visits"] if v["status"] == "failed"), "Page"))

    def vm_EventTail(self, view, c, place, st):
        step, n = c["bind"].get("step"), c.get("props", {}).get("count", 10)
        evs = [e for e in st["events"] if step is None or e.step <= step][-n:]
        return dict(rows=[dict(at=e.data.get("at", ""), ref=e.ref, text=event_text(e),
                               failed=e.type == "scan.stopped" or e.data.get("failed")) for e in evs])

    def vm_FixChoices(self, view, c, place, st):
        tried = [a["variation"] for a in self.engine.attempts.get((st["id"], c["bind"]["step"]), [])]
        first = next((ch["variation"] for ch in fx.FIX_CHOICES if ch["variation"] not in tried), fx.FIX_CHOICES[0]["variation"])
        return dict(choices=[dict(ch, tried=ch["variation"] in tried) for ch in fx.FIX_CHOICES], step=c["bind"]["step"],
                    n=len(tried) + 2, default=first)

    def vm_AttemptList(self, view, c, place, st):
        step = c["bind"]["step"]
        labels = {x["variation"]: x["label"] for x in fx.FIX_CHOICES}
        first = dict(n=1, label="Original run", result="failed", note=st["reason"] or "",
                     at=st["stop_at"] if st["stop_step"] == step else "")
        return dict(rows=[first] + [dict(a, label=labels[a["variation"]]) for a in self.engine.attempts.get((st["id"], step), [])])

    def vm_Compare(self, view, c, place, st):
        return dict(ch=fx.CHANGES[c["bind"]["change"]])

    def vm_DecisionTable(self, view, c, place, st):
        r = c["bind"]["rule"]
        return dict(rule=fx.RECORDS[r], dt=fx.DECISION_TABLES.get(r))

    def vm_FindingCard(self, view, c, place, st):
        return dict(f=fx.FINDINGS[c["bind"]["finding"]])

    def vm_RecordCard(self, view, c, place, st):
        return dict(r=fx.RECORDS[c["bind"]["record"]])

    def vm_RecordList(self, view, c, place, st):
        return dict(rows=[fx.RECORDS[r] for r in c["bind"]["records"]], title=c.get("props", {}).get("title"))

    def vm_PageMiniature(self, view, c, place, st):
        p = c["bind"]["page"]
        key = self.selected(view, st) if p == "@selected" else fx.page_key(fx.find_page(p["route"], p.get("state")))
        v = next((v for v in st["visits"] if v["key"] == key), None)
        return dict(page=dict(v, mini=fx.PAGES[v["k"] - 1]["mini"], label=fx.page_label(v), word=STATUS_WORD[v["status"]],
                              ask=self.ask(st["id"], v)) if v else None,
                    size=c.get("props", {}).get("size", "md"))

    # -- frame text ------------------------------------------------------------
    def title(self, view, c, vm):
        t, st = c["type"], vm["scan"]
        if t in ("PageDetail", "PageMiniature"):
            return vm["page"]["label"] if vm.get("page") else "Page"
        if t == "ErrorCard":
            if st and st["status"] == "stopped" and st["error"]:
                return f"Next action failed at {st['cur']}"           # names the failure (red)
            return f"Stopped at {st['cur']}" if st and st["status"] == "stopped" else "Nothing has failed"
        if t == "StepShot":
            return f"{vm['title']} at step {vm['step']}"
        if t == "DecisionTable":
            return f"{c['bind']['rule']} · decision table"
        if t == "FindingCard":
            return f"Finding {c['bind']['finding']}"
        if t == "RecordCard":
            return vm["r"]["title"]
        if t == "RecordList":
            return vm["title"] or "Records"
        return TITLES.get(t, t)

    def source(self, c, st):
        if st:
            if not st["last_id"]:
                return f"Scan {st['id']} · waiting for the first event"
            return f"From events up to {st['at']} · {st['last_id']}"
        return "From the portal model · now"

    def status(self, c, st):
        if c["type"] in ("LiveMap", "ScanMeter") and st:
            if st["continued_by"]:
                return dict(status="stopped", word="Continued by", ref=st["continued_by"])
            s, w = SCAN_WORD[st["status"]]
            return dict(status=s, word=w)
        return None

    def failure(self, c, st):
        return c["type"] == "ErrorCard" and bool(st) and st["status"] == "stopped" and bool(st["error"]) and not st["continued_by"]

    # -- rendering ----------------------------------------------------------------
    def component(self, view, c, place, live=True, framed=True):
        """A component in its generated frame. framed=False: the person opened it (side sheet) → no generated mark."""
        vm = self.vm(view, c, place)
        return Markup(env.get_template("frames/genview.html.j2").render(
            r=self, view=view, c=c, cid=self.cid(view, c), vm=vm, place=place, live=live, framed=framed,
            lead=self.is_lead(view, c), title=self.title(view, c, vm), source=self.source(c, vm["scan"]),
            status=self.status(c, vm["scan"]), data=cat.CATALOGUE[c["type"]]["data"], failure=self.failure(c, vm["scan"]),
            paths=cat.paths_for(self.phase), PATH_LABEL=cat.PATH_LABEL))

    def live_blocks(self, c, place):
        if c["type"] == "LiveMap":
            return ["meter", "film"] if self.map_mode(c, place) == "filmstrip" else ["meter", "canvas"]
        return LIVE_BLOCKS.get(c["type"], [])

    def live_parts(self, view, c, place):
        """Out-of-band fragments for one component's live regions (what the stream sends)."""
        vm = self.vm(view, c, place)
        cid = self.cid(view, c)
        tmpl = env.get_template(f"components/{c['type']}.html.j2")
        ctx = tmpl.new_context(dict(r=self, view=view, c=c, cid=cid, vm=vm, place=place, live=True))
        out = [f'<div id="{cid}-{name}" hx-swap-oob="innerHTML">{"".join(tmpl.blocks["live_" + name](ctx))}</div>'
               for name in self.live_blocks(c, place)]
        frame = env.get_template("frames/genview.html.j2")
        fctx = frame.new_context(dict(r=self, view=view, c=c, cid=cid, vm=vm, title=self.title(view, c, vm),
                                      source=self.source(c, vm["scan"]), status=self.status(c, vm["scan"])))
        for name in ("title", "status", "source"):
            out.append(f'<div id="{cid}-{name}" hx-swap-oob="innerHTML">{"".join(frame.blocks["live_" + name](fctx))}</div>')
        return "".join(out)

    def slots(self, view):
        layout = self.layout_of(view)
        slots = cat.place(view.spec if view else None, layout)
        if layout == "inline" and not self.sess.sheet_open:
            slots["aside"] = []                       # side sheet closed (Esc / ×); a page click opens it again
        return slots, layout

    def summary(self, view, titles_only=False):
        """One line for a folded (older) view, and the 'This view' line in Why this view?."""
        names = [self.title(view, c, self.vm(view, c, "card")) for c in view.spec["components"]]
        line = ", ".join(names) or "Plain answer"
        if titles_only or not view.scan:
            return line
        st = self.state(view.scan)
        s = {"running": "running", "stopped": f"stopped at {st['cur']}", "waiting": "waiting"}[st["status"]]
        return f"{line} · scan {fx.short_id(view.scan)} {s}"

    def render(self, name, **kw):
        # Markup: our own templates' output (already escaped) can be nested in other templates without double-escaping.
        return Markup(env.get_template(name).render(r=self, sess=self.sess, view=self.view, **kw))

    def page(self, as_of="now"):
        slots, layout = self.slots(self.view)
        return self.render("workbench.html.j2", slots=slots, layout=layout, as_of=as_of, csrf=self.csrf,
                           paths=cat.paths_for(self.phase), PATH_LABEL=cat.PATH_LABEL)

    def layout_html(self, oob=False):
        slots, layout = self.slots(self.view)
        return self.render(f"layouts/{layout}.html.j2", slots=slots, layout=layout, oob=oob)

    def pathswitch(self, oob=False):
        return self.render("frames/pathswitch.html.j2", paths=cat.paths_for(self.phase), PATH_LABEL=cat.PATH_LABEL, oob=oob)

    def turn(self, t):
        return self.render("frames/turn.html.j2", t=t)

    def view_slot(self, t):
        """The part of a turn that holds its view's cards (inline placements). Older views fold to one line."""
        return self.render("frames/view_slot.html.j2", t=t)

    def command(self, cmd):
        return Markup(env.get_template("frames/cmd.html.j2").render(cmd=cmd))

    def feedback(self, view_id, cid, value=None, reason=None):
        return Markup(env.get_template("frames/feedback.html.j2").render(view_id=view_id, cid=cid, value=value, reason=reason))

    def livebar(self, view):
        return self.render("frames/livebar.html.j2", v=view)


def event_text(e):
    d = e.data
    if e.type == "scan.started":
        return f"scan started from {d['start']}"
    if e.type == "scan.resumed":
        return f"scan resumed from {d['start']} · continues {fx.short_id(d['continues'])}"
    if e.type == "page.visited":
        return f"GET {d['route']} 200 · {d['title']}"
    if e.type == "action":
        return d["text"]
    if e.type == "scan.stopped":
        return f"scan stopped · {d['error']}" if d.get("error") else "scan stopped by you"
    return e.type
