/* Minimal offline renderer for the *.dc.html wireframes in this folder.
   Open any wireframe in a browser: this file unwraps <helmet>, runs the
   component's renderVals(), fills {{holes}}, resolves <sc-if> and wires
   onClick handlers so the interactive toggles work. Preview only. */
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(s) { Object.assign(this.state, typeof s === "function" ? s(this.state) : s); if (window.__dcRender) window.__dcRender(); }
  }
  window.DCLogic = DCLogic;

  function lookup(vals, path) {
    path = path.trim();
    if (path === "true") return true;
    if (path === "false") return false;
    return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, vals);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("x-dc");
    if (!root) return;
    var st = document.createElement("style");
    st.textContent = "x-dc{display:block}";
    document.head.appendChild(st);
    var helmet = root.querySelector("helmet");
    if (helmet) { Array.from(helmet.childNodes).forEach(function (n) { document.head.appendChild(n); }); helmet.remove(); }
    var tpl = root.innerHTML;
    var scr = document.querySelector('script[type="text/x-dc"]');
    var Comp = null;
    if (scr) {
      try { Comp = new Function("DCLogic", scr.textContent + "\n;return typeof Component !== 'undefined' ? Component : null;")(DCLogic); }
      catch (e) { console.error("wireframe script", e); }
    }
    var props = {};
    try { props = scr && scr.dataset.props ? JSON.parse(scr.dataset.props) : {}; } catch (e) {}
    var inst = Comp ? new Comp(props) : null;

    function render() {
      var vals = inst && inst.renderVals ? inst.renderVals() : {};
      var handlers = {};
      var n = 0;
      var html = tpl.replace(/\bon([A-Z][a-zA-Z]*)="\{\{([^}]+)\}\}"/g, function (m, ev, k) {
        var id = "h" + (n++); handlers[id] = lookup(vals, k);
        return 'data-dc-on="' + ev.toLowerCase() + ":" + id + '"';
      });
      html = html.replace(/\{\{([^}]+)\}\}/g, function (m, k) { var v = lookup(vals, k); return v == null ? "" : String(v); });
      var holder = document.createElement("div");
      holder.innerHTML = html;
      Array.from(holder.querySelectorAll("sc-if")).forEach(function (el) {
        var v = el.getAttribute("value");
        var keep = v && v !== "false" && v !== "0" && v !== "undefined" && v !== "null";
        if (keep) el.replaceWith.apply(el, Array.from(el.childNodes)); else el.remove();
      });
      Array.from(holder.querySelectorAll("[data-dc-on]")).forEach(function (el) {
        var parts = el.getAttribute("data-dc-on").split(":");
        var fn = handlers[parts[1]];
        if (typeof fn === "function") el.addEventListener(parts[0], function (e) { e.preventDefault(); fn(e); });
      });
      root.replaceChildren.apply(root, Array.from(holder.childNodes));
    }
    window.__dcRender = render;
    render();
  });
})();
