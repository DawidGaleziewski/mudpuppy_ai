import type { MountContext } from "./context";

/** `pg:<name>` CustomEvents on window: the only channel between the shell and its apps (LO-34). */
export function emit(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(`pg:${name}`, { detail }));
}

export function on(name: string, fn: (detail: unknown) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent).detail);
  window.addEventListener(`pg:${name}`, h);
  return () => window.removeEventListener(`pg:${name}`, h);
}

export const currentPath = (): string =>
  location.pathname + location.search + location.hash;

export function navigate(path: string): void {
  if (path === currentPath()) return;
  history.pushState(null, "", path);
  emit("route", { path });
}

window.addEventListener("popstate", () => emit("route", { path: currentPath() }));
window.addEventListener("hashchange", () => emit("route", { path: currentPath() }));

/** fetch with the session cookie; an expired session raises the shell's modal (LO-32). */
export async function api(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (res.status === 401) {
    const body = await res
      .clone()
      .json()
      .catch(() => null);
    if (body && body.error === "session_expired") emit("session-expired", { path: currentPath() });
  }
  return res;
}

export function contextFor(basePath: string, widgetOrigin: string): MountContext {
  return { basePath, path: currentPath, navigate, emit, on, widgetOrigin, api };
}
