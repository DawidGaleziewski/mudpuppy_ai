// Renders `pre.mermaid` blocks in the Docs templates (spec 004 T060, research §9).
// Mermaid (2.5 MB, vendored, see vendor/README.md) is fetched only when a page actually holds a
// diagram, so Docs pages without one stay light. The colours come from the Console tokens at
// runtime (tokens.css stays the only file with literal values). Without JS, the Mermaid source in
// the <pre> is the readable fallback.
(() => {
  const SRC = "/static/vendor/mermaid.min.js";
  let loading = null;

  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const load = () => {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = SRC;
        script.onload = () => resolve(window.mermaid);
        script.onerror = () => reject(new Error("mermaid failed to load"));
        document.head.appendChild(script);
      });
    }
    return loading;
  };

  let configured = false;
  const configure = (mermaid) => {
    if (configured) return;
    configured = true;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: token("--font-mono"),
      themeVariables: {
        darkMode: true,
        background: token("--surface-0"),
        primaryColor: token("--surface-200"),
        primaryTextColor: token("--ink-100"),
        primaryBorderColor: token("--brand"),
        lineColor: token("--ink-500"),
        secondaryColor: token("--surface-100"),
        tertiaryColor: token("--surface-100"),
        edgeLabelBackground: token("--surface-0"),
        clusterBkg: token("--surface-100"),
        clusterBorder: token("--border"),
        textColor: token("--ink-100"),
        fontSize: token("--text-body"),
      },
    });
  };

  const render = async () => {
    const nodes = [...document.querySelectorAll("pre.mermaid:not([data-processed])")];
    if (!nodes.length) return;
    try {
      const mermaid = await load();
      configure(mermaid);
      await mermaid.run({ nodes });
    } catch (err) {
      // leave the source text in place: it is still a readable description of the diagram
      console.warn("diagram not rendered:", err);
    }
  };

  document.addEventListener("htmx:after:swap", render);
  document.addEventListener("htmx:after:settle", render);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
