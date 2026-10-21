// The Processes workspace (spec 022 M5, screens 04–07). Writes go to this dashboard's own
// /chat/portals/… routes, which sign them and forward them to the chat service; nothing here
// writes the store. Everything shown comes in through textContent.
//
// - [data-process="<url>"]: one click, one POST (optional data-body JSON, data-confirm text,
//   data-method). After it: data-open navigates to the process, else the page (or the editor
//   region) reloads.
// - form[data-process-form="new"]: a new process from ticked screens.
// - The to-be editor (#process-editor): step operations change the draft's steps and autosave it
//   (PUT …/draft); Save, Discard, Rebase act on the draft. A stale draft answers 409: the region
//   reloads and shows "Someone saved first".
(() => {
  const send = async (method, url, payload) => {
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      let body = {};
      try {
        body = await response.json();
      } catch {
        // not JSON: the generic message covers it
      }
      return { ok: response.ok, status: response.status, body };
    } catch {
      return {
        ok: false,
        status: 0,
        body: { message: "The dashboard could not be reached." },
      };
    }
  };

  const say = (where, ok, text) => {
    if (!where) return;
    where.replaceChildren();
    const tag = document.createElement("span");
    tag.className = "sy-status";
    tag.dataset.status = ok ? "ok" : "failed";
    tag.textContent = ok ? "Done" : "Failed";
    where.append(tag, ` ${text}`);
  };

  const editor = () => document.getElementById("process-editor");

  // The editor is a live region: reload just it, keeping the page and the scroll.
  const reloadEditor = () => {
    const region = editor();
    if (region && window.htmx)
      window.htmx.ajax("GET", region.dataset.self, {
        target: region,
        swap: "outerHTML",
      });
    else window.location.reload();
  };

  // --- one-click actions -------------------------------------------------------------------
  document.addEventListener("click", async (e) => {
    const button = e.target.closest?.("[data-process]");
    if (!button || button.disabled) return;
    if (button.dataset.confirm && !window.confirm(button.dataset.confirm))
      return;
    const where = button
      .closest("[data-actions], .sy-plate__foot, form, section")
      ?.querySelector("[data-result]");
    button.disabled = true;
    const body = button.dataset.body ? JSON.parse(button.dataset.body) : {};
    // data-from="#a #b": add the named fields' values (when not empty) to the body.
    for (const selector of (button.dataset.from ?? "").split(" ").filter(Boolean)) {
      const field = document.querySelector(selector);
      const value = field?.value.trim();
      if (value) body[field.name] = value;
    }
    const result = await send(
      button.dataset.method ?? "POST",
      button.dataset.process,
      body,
    );
    if (!result.ok) {
      button.disabled = false;
      say(where, false, result.body.message ?? "That did not work.");
      if (result.status === 409) reloadEditor();
      return;
    }
    const process = result.body.process;
    if (button.dataset.reload === "page") window.location.reload();
    else if (button.dataset.open && process) {
      const label = result.body.model?.label ?? "A";
      window.location.assign(
        `/processes/${encodeURIComponent(process.key)}?model=${label}`,
      );
    } else if (editor()) reloadEditor();
    else window.location.reload();
  });

  // --- the picker: ticked screens become numbered steps in tick order (spec 027 US1.3) -----
  const picked = []; // state ids in the order they were ticked, then moved
  const pickerForm = () =>
    document.querySelector('form[data-process-form="new"]');
  const box = (form, id) =>
    form.querySelector(`input[name="state_ids"][value="${CSS.escape(id)}"]`);
  const pickButton = (id, op, text, aria, disabled) => {
    const b = document.createElement("button");
    Object.assign(b, { type: "button", className: "sy-btn sy-btn--sm sy-btn--quiet", textContent: text, disabled });
    Object.assign(b.dataset, { pickOp: op, pick: id });
    b.setAttribute("aria-label", aria);
    return b;
  };
  const renderPicked = (focus) => {
    const form = pickerForm();
    if (!form) return;
    const rows = picked.map((id, i) => {
      const { title, route } = box(form, id).dataset;
      const li = document.createElement("li");
      li.className = "sy-cluster";
      li.style.setProperty("--sy-gap", "6px");
      const name = document.createElement("span");
      name.className = "sy-small sy-grow sy-case-normal";
      name.textContent = `${i + 1} · ${title}`;
      const where = document.createElement("span");
      where.className = "sy-route mp-break";
      where.textContent = route;
      li.append(
        name,
        where,
        pickButton(id, "up", "↑", `Move ${title} up`, i === 0),
        pickButton(id, "down", "↓", `Move ${title} down`, i === picked.length - 1),
        pickButton(id, "remove", "Remove", `Remove ${title}`, false),
      );
      return li;
    });
    form.querySelector("[data-picked]").replaceChildren(...rows);
    form.querySelector("[data-picked-count]").textContent = String(picked.length);
    form.querySelector("[data-picked-empty]").hidden = picked.length > 0;
    if (focus) {
      const same = form.querySelector(
        `[data-pick="${CSS.escape(focus.id)}"][data-pick-op="${focus.op}"]:not(:disabled)`,
      );
      (same ?? form.querySelector(`[data-pick="${CSS.escape(focus.id)}"]:not(:disabled)`) ?? form)?.focus?.();
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    const form = pickerForm();
    if (!form) return;
    // A restored page keeps its ticks: take them in page order.
    for (const input of form.querySelectorAll('input[name="state_ids"]:checked'))
      picked.push(input.value);
    renderPicked();
  });
  document.addEventListener("change", (e) => {
    const input = e.target.closest?.(
      'form[data-process-form="new"] input[name="state_ids"]',
    );
    if (!input) return;
    const i = picked.indexOf(input.value);
    if (input.checked && i < 0) picked.push(input.value);
    if (!input.checked && i >= 0) picked.splice(i, 1);
    renderPicked();
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-pick-op]");
    if (!b) return;
    const { pick: id, pickOp: op } = b.dataset;
    const i = picked.indexOf(id);
    if (op === "remove") {
      picked.splice(i, 1);
      const input = box(pickerForm(), id);
      input.checked = false;
      renderPicked();
      return input.focus();
    }
    const j = op === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < picked.length) [picked[i], picked[j]] = [picked[j], picked[i]];
    renderPicked({ id, op });
  });

  // --- a new process from ticked screens, in the picked order ------------------------------
  document.addEventListener("submit", async (e) => {
    const form = e.target.closest?.('form[data-process-form="new"]');
    if (!form) return;
    e.preventDefault();
    const where = form.querySelector("[data-result]");
    const state_ids = picked.length
      ? [...picked]
      : [...form.querySelectorAll('input[name="state_ids"]:checked')].map(
          (i) => i.value,
        );
    if (state_ids.length === 0)
      return say(where, false, "Tick at least one screen.");
    const result = await send("POST", form.action, {
      name: form.elements.name.value.trim(),
      persona: form.elements.persona.value.trim(),
      state_ids,
    });
    if (!result.ok)
      return say(
        where,
        false,
        result.body.message ?? "The process was not created.",
      );
    window.location.assign(
      `/processes/${encodeURIComponent(result.body.process.key)}`,
    );
  });

  // --- the change spec: every section, lists one item per line -----------------------------
  document.addEventListener("submit", async (e) => {
    const form = e.target.closest?.('form[data-process-form="spec"]');
    if (!form) return;
    e.preventDefault();
    const where = form.querySelector("[data-result]");
    const sections = {};
    for (const area of form.querySelectorAll("textarea[name]")) {
      const text = area.value.trim();
      sections[area.name] =
        area.dataset.list === "1"
          ? text
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
          : text;
    }
    const d = form.dataset;
    const payload = {
      left: { label: d.left, rev: Number(d.leftRev) },
      right: { label: d.right, rev: Number(d.rightRev) },
      sections,
      ...(d.baseRev ? { base_rev: Number(d.baseRev) } : {}),
    };
    const result = await send("POST", form.action, payload);
    if (!result.ok)
      return say(
        where,
        false,
        result.body.message ?? "The spec was not saved.",
      );
    window.location.reload();
  });

  // --- the to-be editor: pure step operations --------------------------------------------
  const freshId = (steps) => {
    const n = steps
      .map((s) => /^n(\d+)$/.exec(s.id))
      .filter(Boolean)
      .map((m) => Number(m[1]));
    return `n${Math.max(0, ...n) + 1}`;
  };
  const drawn = (steps, fields) => ({
    id: freshId(steps),
    title: fields.title,
    route: fields.route,
    state_id: null,
    screen_id: null,
    observed: false,
    from: fields.from ?? [],
    annotations: fields.annotations ?? [],
  });
  const at = (steps, id) => steps.findIndex((s) => s.id === id);
  const OPS = {
    remove: (steps, id) => steps.filter((s) => s.id !== id),
    up: (steps, id) => swap(steps, at(steps, id), at(steps, id) - 1),
    down: (steps, id) => swap(steps, at(steps, id), at(steps, id) + 1),
    merge: (steps, id) => {
      const i = at(steps, id);
      if (i < 0 || i >= steps.length - 1) return steps;
      const [a, b] = [steps[i], steps[i + 1]];
      const merged = drawn(steps, {
        title: a.title,
        route: a.route,
        from: [...a.from, ...b.from],
        annotations: [...a.annotations, ...b.annotations],
      });
      return [...steps.slice(0, i), merged, ...steps.slice(i + 2)];
    },
    add: (steps, id, fields) => {
      const i = id ? at(steps, id) : steps.length - 1;
      return [
        ...steps.slice(0, i + 1),
        drawn(steps, fields),
        ...steps.slice(i + 1),
      ];
    },
    edit: (steps, id, fields) =>
      steps.map((s) =>
        s.id !== id || (s.title === fields.title && s.route === fields.route)
          ? s
          : {
              ...s,
              title: fields.title,
              route: fields.route,
              state_id: null,
              screen_id: null,
              observed: false,
            },
      ),
    annotate: (steps, id, fields) =>
      steps.map((s) =>
        s.id !== id
          ? s
          : {
              ...s,
              annotations: [
                ...s.annotations,
                {
                  text: fields.text,
                  author: fields.author,
                  at: new Date().toISOString(),
                },
              ],
            },
      ),
  };
  function swap(steps, i, j) {
    if (i < 0 || j < 0 || j >= steps.length) return steps;
    const out = [...steps];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  }

  const draftOf = (region) =>
    JSON.parse(region.querySelector("#process-steps").textContent);

  async function autosave(region, steps, where) {
    const result = await send("PUT", region.dataset.draft, {
      base_rev: Number(region.dataset.baseRev),
      steps,
    });
    if (!result.ok)
      return say(
        where,
        false,
        result.body.message ?? "The draft was not saved.",
      );
    reloadEditor();
  }

  // --- editing A (spec 027 US4.2): the screens in their new order, one signed A revision -----
  async function editA(region, stateIds, where) {
    const result = await send("POST", region.dataset.edit, {
      base_rev: Number(region.dataset.baseRev),
      state_ids: stateIds,
    });
    if (!result.ok) {
      say(where, false, result.body.message ?? "The as-is was not changed.");
      if (result.status === 409) reloadEditor();
      return;
    }
    reloadEditor();
  }
  const A_OPS = {
    up: (steps, id) => swap(steps, at(steps, id), at(steps, id) - 1),
    down: (steps, id) => swap(steps, at(steps, id), at(steps, id) + 1),
    remove: (steps, id) => steps.filter((s) => s.id !== id),
  };
  document.addEventListener("click", (e) => {
    const button = e.target.closest?.("button[data-a-op]");
    const region = editor();
    if (!button || !region || button.disabled) return;
    if (button.dataset.confirm && !window.confirm(button.dataset.confirm))
      return;
    button.disabled = true;
    const steps = A_OPS[button.dataset.aOp](draftOf(region), button.dataset.step);
    editA(
      region,
      steps.map((s) => s.state_id),
      region.querySelector("[data-editor-result]"),
    );
  });
  document.addEventListener("submit", (e) => {
    const form = e.target.closest?.('form[data-a-op="add"]');
    const region = editor();
    if (!form || !region) return;
    e.preventDefault();
    const ids = draftOf(region).map((s) => s.state_id);
    editA(
      region,
      [...ids, form.elements.state_id.value],
      region.querySelector("[data-editor-result]"),
    );
  });

  // A step button or a step form: [data-step-op] on the button or the form.
  document.addEventListener("click", (e) => {
    const button = e.target.closest?.("button[data-step-op]");
    const region = editor();
    if (!button || !region || button.form) return;
    const where = region.querySelector("[data-editor-result]");
    autosave(
      region,
      OPS[button.dataset.stepOp](draftOf(region), button.dataset.step),
      where,
    );
  });
  document.addEventListener("submit", (e) => {
    const form = e.target.closest?.("form[data-step-op]");
    const region = editor();
    if (!form || !region) return;
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(form));
    fields.author = region.dataset.author;
    if (form.dataset.stepOp === "annotate" && !String(fields.text ?? "").trim())
      return;
    const where =
      form.querySelector("[data-result]") ??
      region.querySelector("[data-editor-result]");
    autosave(
      region,
      OPS[form.dataset.stepOp](draftOf(region), form.dataset.step, fields),
      where,
    );
  });
})();
