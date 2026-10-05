import { createRoot } from "react-dom/client";
import "./tokens.css";
import "./minicart";
import { Shell } from "./Shell";

export interface BootOptions {
  widgetOrigin: string;
}

/** Entry point called by the shell document the backend serves for every modern route. */
export function boot(el: HTMLElement, opts: BootOptions): void {
  createRoot(el).render(<Shell widgetOrigin={opts.widgetOrigin} />);
}
