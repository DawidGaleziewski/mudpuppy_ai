// What a page can ask of the assistant (spec 070): open the drawer, and say something there. A
// message waits in this browser's session until the drawer's conversation is ready, also across a
// page change, so it is never dropped while the assistant is busy or the drawer was closed.
import { createContext, useContext } from 'react';

const SAY_KEY = 'mudpuppy.assistant.say';

export interface AssistantHandle {
  /** Open the drawer; with `text`, send it there once the conversation is ready. */
  ask: (text?: string) => void;
}

export const AssistantContext = createContext<AssistantHandle>({ ask: () => undefined });

export const useAssistantHandle = () => useContext(AssistantContext);

/** Keep a message for the drawer to send. */
export function keepSay(text: string) {
  try {
    sessionStorage.setItem(SAY_KEY, text);
  } catch {
    // storage blocked: the drawer opens and the person types it again
  }
}

/** The message waiting for the drawer, taken (so it is sent once). */
export function takeSay(): string | null {
  try {
    const text = sessionStorage.getItem(SAY_KEY);
    if (text !== null) sessionStorage.removeItem(SAY_KEY);
    return text;
  } catch {
    return null;
  }
}
