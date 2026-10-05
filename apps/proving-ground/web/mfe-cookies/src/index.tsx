import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { MountContext } from "./context";

export type { MountContext };

export function mount(el: HTMLElement, _ctx: MountContext): () => void {
  const root = createRoot(el);
  root.render(<App />);
  return () => root.unmount();
}
