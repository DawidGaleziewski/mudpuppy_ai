/// <reference types="vite/client" />

import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      /** The header cart web component (minicart.ts). */
      "mk-mini-cart": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
