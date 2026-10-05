import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Library mode emits dist/index.css next to dist/index.js. The estate wants ONE module per
// app, so fold the CSS into the JS: it injects a <style> tag when the module is evaluated.
function inlineCss(): Plugin {
  return {
    name: "inline-css",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const css: string[] = [];
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === "asset" && name.endsWith(".css")) {
          css.push(String(file.source));
          delete bundle[name];
        }
      }
      if (css.length === 0) return;
      const entry = Object.values(bundle).find((f) => f.type === "chunk" && f.isEntry);
      if (entry?.type !== "chunk") return;
      const inject =
        `(function(){var s=document.createElement("style");` +
        `s.textContent=${JSON.stringify(css.join("\n"))};document.head.appendChild(s);})();\n`;
      entry.code = inject + entry.code;
    },
  };
}

// One self-contained ES module per app. React is bundled on purpose (no externals):
// every micro-frontend ships its own React copy.
export default defineConfig({
  plugins: [react(), inlineCss()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  css: {
    modules: {
      // Ugly generated class names are a deliberate legacy obstacle (LO-13).
      generateScopedName: "[hash:base64:8]",
    },
  },
  build: {
    lib: { entry: "src/index.tsx", formats: ["es"], fileName: "index" },
    cssCodeSplit: false,
    emptyOutDir: true,
  },
});
