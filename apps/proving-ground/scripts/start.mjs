#!/usr/bin/env node
// Start the proving ground: rebuild the front-end apps whose sources are newer than their bundle,
// then run the backend on both ports. Extra arguments go to the backend launcher
// (`--port`, `--widget-port`, `--session-timeout`, `--cms-delay-ms`, `--seed-users`).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "web");

function newest(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

/** Folders under web/ whose dist/index.js is missing or older than src/ or the vite config. */
export function staleApps() {
  return readdirSync(web, { withFileTypes: true })
    .filter(
      (e) => e.isDirectory() && existsSync(join(web, e.name, "package.json")),
    )
    .map((e) => e.name)
    .filter((name) => {
      const out = join(web, name, "dist", "index.js");
      if (!existsSync(out)) return true;
      const src = Math.max(
        newest(join(web, name, "src")),
        statSync(join(web, name, "vite.config.ts")).mtimeMs,
      );
      return src > statSync(out).mtimeMs;
    });
}

export function buildStale() {
  const stale = staleApps();
  for (const name of stale) {
    // Always a production build: started from vitest (gates), NODE_ENV=test would make Vite emit
    // dev JSX (`jsxDEV`) that the bundled production React lacks, and no app renders (F-19).
    const r = spawnSync("pnpm", ["--dir", join(web, name), "build"], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  return stale;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const built = buildStale();
  if (built.length > 0) console.log(`built: ${built.join(", ")}`);
  const child = spawn(
    "uv",
    [
      "run",
      "--project",
      join(root, "backend"),
      "proving-ground",
      ...process.argv.slice(2),
    ],
    {
      stdio: "inherit",
    },
  );
  const stop = () => child.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
}
