import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { MountContext } from "./context";
import { Ctx } from "./support";

export type { MountContext };

export function mount(el: HTMLElement, ctx: MountContext): () => void {
  const root = createRoot(el);
  root.render(
    <Ctx.Provider value={ctx}>
      <App />
    </Ctx.Provider>,
  );
  return () => root.unmount();
}
