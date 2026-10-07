// Forms that post through the dashboard to the chat service (spec 010, R-30): credentials, process
// scope, amendments, re-apply, dismiss, withdraw. The browser only ever calls this dashboard's own
// `/chat/...` routes. Everything shown comes in through textContent. Secret values are read from
// password inputs, sent once, and cleared; they are never written to the page, storage or console.
(() => {
  const MAX_ATTACHMENT = 8 * 1024 * 1024;

  // A live region that holds a form skips its refresh while the form has unsaved input.
  window.formsDirty = () => !!document.querySelector('[data-json-form][data-dirty="1"]');
  document.addEventListener("input", (e) => {
    const form = e.target.closest?.("[data-json-form]");
    if (form) form.dataset.dirty = "1";
  });
  // An opened re-apply panel counts as unsaved too, so a refresh does not fold it away.
  document.addEventListener(
    "toggle",
    (e) => {
      const form = e.target.querySelector?.("[data-json-form]");
      if (!form) return;
      if (e.target.open) form.dataset.dirty = "1";
      else delete form.dataset.dirty;
    },
    true,
  );

  const refresh = () => window.htmx?.trigger(document.body, "store-changed");

  // The result line: the label is text, colour only reinforces it (Principle II).
  const show = (where, ok, message, ref) => {
    where.className = `form-result ${ok ? "form-ok" : "form-fail"}`;
    where.replaceChildren();
    const tag = document.createElement("span");
    tag.className = `st ${ok ? "st-ok" : "st-fail"}`;
    tag.textContent = ok ? "[ OK ]" : "[FAIL]";
    where.append(tag, ` ${message}`);
    if (ref) {
      const link = document.createElement("a");
      link.href = `/chat/errors/${encodeURIComponent(ref)}`;
      const code = document.createElement("code");
      code.textContent = ref;
      link.append(code);
      where.append(" reference ", link);
    }
  };

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
        // not JSON: the generic message below covers it
      }
      return { status: response.status, ok: response.ok, body };
    } catch {
      return {
        status: 0,
        ok: false,
        body: { message: "The dashboard could not be reached. Is it still running?" },
      };
    }
  };

  const fail = (where, result, fallback) =>
    show(where, false, result.body.message ?? fallback, result.body.ref);

  const base64 = async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  };

  const handlers = {
    async credentials(form, where) {
      const values = {};
      for (const input of form.querySelectorAll('input[name^="ref:"]')) {
        if (input.value) values[input.name.slice(4)] = input.value;
      }
      const extra = form.elements.extra_ref.value.trim();
      if (extra && form.elements.extra_value.value) values[extra] = form.elements.extra_value.value;
      const wipe = () => {
        for (const input of form.querySelectorAll('input[type="password"]')) input.value = "";
        form.elements.extra_ref.value = "";
      };
      if (!Object.keys(values).length) {
        show(where, false, "Type at least one value.");
        return;
      }
      const result = await send("POST", form.action, {
        portal: form.elements.portal.value,
        environment: form.elements.environment.value,
        values,
      });
      wipe(); // cleared after every submit, whatever the answer
      delete form.dataset.dirty;
      if (result.ok && result.body.stored) {
        show(where, true, `Credentials stored for ${(result.body.refs ?? []).join(", ")}.`);
      } else if (result.status === 409) {
        show(
          where,
          false,
          `The vault is not ready: ${result.body.message ?? "its key is missing"}. Set the vault key, then type the values again.`,
          result.body.ref,
        );
      } else fail(where, result, "The credentials could not be stored.");
    },

    async scope(form, where) {
      const included = [...form.querySelectorAll('input[name="include"]:checked')].map(
        (i) => i.value,
      );
      const comments = {};
      for (const input of form.querySelectorAll('input[name^="comment:"]')) {
        if (!input.closest("[hidden]") && input.value.trim()) {
          comments[input.name.slice("comment:".length)] = input.value.trim();
        }
      }
      const result = await send("POST", form.action, {
        portal: form.elements.portal.value,
        process_name: form.elements.process_name.value,
        persona: form.elements.persona.value,
        start_state_id: form.elements.start_state_id.value,
        end_state_id: form.elements.end_state_id.value,
        selected_state_ids: included,
        comments,
        source: "ba_description",
      });
      if (result.status === 201) {
        delete form.dataset.dirty;
        const n = new Set([
          form.elements.start_state_id.value,
          form.elements.end_state_id.value,
          ...included,
        ]).size;
        show(where, true, `Scope saved: “${result.body.process_name ?? ""}”, ${n} screens.`);
      } else fail(where, result, "The scope could not be saved.");
    },

    async amendment(form, where) {
      const state = form.dataset.state;
      const element = form.elements.element.value;
      const text = form.elements.text.value.trim();
      const file = form.elements.attachment.files[0];
      if (!text && !file) {
        show(where, false, "Write a note or attach a file.");
        return;
      }
      if (file && file.size > MAX_ATTACHMENT) {
        show(where, false, "The attachment is larger than 8 MB.");
        return;
      }
      const kind = file && !text ? "attachment" : element ? "element_ref" : "note";
      const payload = element
        ? { kind, target_kind: "wireframe_element", target_id: `${state}#${element}` }
        : { kind, target_kind: "state", target_id: state };
      if (text) payload.text = text;
      if (file) payload.attachment = { name: file.name, content_base64: await base64(file) };
      const result = await send("POST", form.action, payload);
      if (result.status === 201) {
        form.reset();
        delete form.dataset.dirty;
        show(where, true, `Amendment ${result.body.key ?? ""} added.`);
        refresh();
      } else fail(where, result, "The amendment could not be added.");
    },

    async reapply(form, where) {
      const state = form.elements.state_id.value.trim();
      const element = form.elements.element.value.trim();
      const text = form.elements.text.value.trim();
      const payload = element
        ? { target_kind: "wireframe_element", target_id: `${state}#${element}` }
        : { target_kind: "state", target_id: state };
      if (text) payload.text = text;
      const result = await send("POST", form.action, payload);
      if (result.status === 201) {
        delete form.dataset.dirty;
        show(where, true, `Re-applied as ${result.body.key ?? "a new amendment"}.`);
        refresh();
      } else fail(where, result, "The amendment could not be re-applied.");
    },
  };

  document.addEventListener("submit", async (e) => {
    const form = e.target.closest?.("[data-json-form]");
    if (!form) return;
    e.preventDefault();
    const handler = handlers[form.dataset.jsonForm];
    const where = form.querySelector("[data-result]");
    const button = form.querySelector('button[type="submit"]');
    if (!handler || !where || form.dataset.busy) return;
    form.dataset.busy = "1";
    if (button) button.disabled = true;
    where.textContent = "Sending…";
    try {
      await handler(form, where);
    } finally {
      delete form.dataset.busy;
      if (button) button.disabled = false;
    }
  });

  // One-click actions on a row: withdraw (DELETE), dismiss (POST), stop a scan (POST, T041).
  document.addEventListener("click", async (e) => {
    const button = e.target.closest?.("[data-withdraw], [data-dismiss], [data-stop-run]");
    if (!button || button.disabled) return;
    const withdraw = "withdraw" in button.dataset;
    const stop = "stopRun" in button.dataset;
    const url = withdraw
      ? button.dataset.withdraw
      : stop
        ? button.dataset.stopRun
        : button.dataset.dismiss;
    const label = button.dataset.label ?? "this amendment";
    const question = withdraw
      ? `Withdraw ${label}? It stays in the list as withdrawn.`
      : stop
        ? `Stop ${label}? Pages already recorded are kept, and the assistant can resume it later.`
        : `Dismiss ${label}? It leaves the review list.`;
    if (!window.confirm(question)) return;
    let note = button.parentElement.querySelector(".form-result");
    if (!note) {
      note = document.createElement("p");
      note.setAttribute("role", "status");
      button.after(note);
    }
    button.disabled = true;
    const result = await send(withdraw ? "DELETE" : "POST", url, withdraw ? undefined : {});
    if (result.ok) {
      show(note, true, withdraw ? "Withdrawn." : stop ? "Stopped." : "Dismissed.");
      refresh();
    } else {
      button.disabled = false;
      fail(note, result, "That did not work.");
    }
  });

  // Scope checklist: a note box appears for every screen that is ticked, start or end.
  const syncComment = (row) => {
    const on =
      row.querySelector('input[name="include"]').checked ||
      row.querySelector('input[name="start_state_id"]').checked ||
      row.querySelector('input[name="end_state_id"]').checked;
    row.querySelector(".scope-comment").hidden = !on;
  };
  document.addEventListener("change", (e) => {
    const form = e.target.closest?.('[data-json-form="scope"]');
    if (!form) return;
    for (const row of form.querySelectorAll(".scope-row")) syncComment(row);
  });
})();
