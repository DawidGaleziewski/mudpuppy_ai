// What the live Workbench's components share beyond their own data (spec 075): the whole state
// (the selection, the portal and its environment for the vault form) and the conversation's id.
// A component's own data comes bound from the A2UI data model; this is the frame's.

import { createContext, useContext } from 'react';
import type { LiveState } from './protocol';

export interface LiveFrame {
  conversation: string;
  state: LiveState | null;
}

export const LiveContext = createContext<LiveFrame>({ conversation: '', state: null });

export const useLiveFrame = (): LiveFrame => useContext(LiveContext);
