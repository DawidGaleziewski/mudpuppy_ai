import { createContext, useContext, type AnchorHTMLAttributes, type ReactNode } from 'react';

export type AnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** Draws one link; called as a function, so it must not use hooks itself (it returns elements). */
export type DrawLink = (props: AnchorProps) => ReactNode;

/** The plain link: used where no app gave a router link (Storybook, tests of one component). */
const plain: DrawLink = (props) => <a {...props} />;

const LinkContext = createContext<DrawLink>(plain);

/**
 * Gives every link the design system draws (`Text`, `Tag`, `LinkButton`, nav, tabs, …) the app's
 * way of drawing a link, so a move inside the app goes through its router (no page load). The
 * design system itself stays router-free.
 */
export function LinkProvider({ draw, children }: { draw: DrawLink; children: ReactNode }) {
  return <LinkContext.Provider value={draw}>{children}</LinkContext.Provider>;
}

/**
 * The one link element of the design system: every component with an `href` draws it, and pages
 * never draw a raw `<a>`. It renders the app's router link (`LinkProvider`) or a plain anchor.
 */
export function Anchor(props: AnchorProps) {
  return useContext(LinkContext)(props);
}
