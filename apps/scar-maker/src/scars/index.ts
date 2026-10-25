// Every scar module, in catalogue order. A new scar: a file `scNN-<name>.ts`, a line here and an entry
// in `scars.yaml` (the catalogue test keeps the two in agreement).

import type { Scar } from '../types.js';
import { sc01 } from './sc01-one-big-form.js';
import { sc02 } from './sc02-xhr-403.js';
import { sc03 } from './sc03-js-postback.js';
import { sc04 } from './sc04-select-label.js';
import { sc05 } from './sc05-german-submit.js';
import { sc06 } from './sc06-rerender-tiles.js';
import { sc07 } from './sc07-wedged-frontier.js';
import { sc08 } from './sc08-flag-cookie.js';
import { sc09 } from './sc09-collapsed.js';
import { sc10 } from './sc10-default-open.js';
import { sc11 } from './sc11-late-mount.js';
import { sc12 } from './sc12-blocked-assets.js';
import { sc13 } from './sc13-proxy-allowlist.js';
import { sc14 } from './sc14-bound-login.js';
import { sc15 } from './sc15-late-login.js';
import { sc16 } from './sc16-sso-hops.js';
import { sc17 } from './sc17-intermittent-errors.js';
import { sc18 } from './sc18-wizard-form.js';
import { sc19 } from './sc19-quote-wizard.js';
import { sc20 } from './sc20-sold-out-offer.js';
import { sc21 } from './sc21-unread-ping.js';
import { sc22 } from './sc22-hidden-box.js';
import { sc23 } from './sc23-blocked-submit.js';
import { sc24 } from './sc24-revealed-limits.js';
import { sc25 } from './sc25-date-window.js';

export const SCARS: readonly Scar[] = [
  sc01,
  sc02,
  sc03,
  sc04,
  sc05,
  sc06,
  sc07,
  sc08,
  sc09,
  sc10,
  sc11,
  sc12,
  sc13,
  sc14,
  sc15,
  sc16,
  sc17,
  sc18,
  sc19,
  sc20,
  sc21,
  sc22,
  sc23,
  sc24,
  sc25,
];
