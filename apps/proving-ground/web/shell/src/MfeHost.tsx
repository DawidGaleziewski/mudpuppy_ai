import { useEffect, useRef, useState } from "react";
import { contextFor } from "./bus";
import type { Mount } from "./context";
import s from "./Shell.module.css";

let importMap: Promise<Record<string, string>> | null = null;
const loadMap = (): Promise<Record<string, string>> =>
  (importMap ??= fetch("/mfe/import-map.json").then((r) => r.json()));

/**
 * Mounts one micro-frontend from the runtime import map (LO-01). Each bundle carries its own
 * React; the shell only knows the `mount(el, ctx)` contract. A bundle that fails to load leaves
 * an error area and the rest of the shell working (spec edge case).
 */
export function MfeHost(props: { name: string; basePath: string; widgetOrigin: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let unmount: (() => void) | null = null;
    let live = true;
    setFailed(false);
    loadMap()
      .then((map) => {
        const url = map[props.name];
        if (!url) throw new Error(`no app ${props.name}`);
        return import(/* @vite-ignore */ url) as Promise<{ mount: Mount }>;
      })
      .then((mod) => {
        if (!live || !ref.current) return;
        unmount = mod.mount(ref.current, contextFor(props.basePath, props.widgetOrigin));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      unmount?.();
    };
  }, [props.name, props.basePath, props.widgetOrigin]);

  return (
    <div className={`${s.mfe} mk-mfe-host__${props.name} _r9`} data-mfe={props.name}>
      {failed && <div className={s.mfeError}>Moduł chwilowo niedostępny.</div>}
      <div ref={ref} />
    </div>
  );
}
