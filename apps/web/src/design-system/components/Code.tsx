/** Preformatted text exactly as stored: a JSON shape, a config snapshot. Long lines scroll inside it. */
export function Code({ children }: { children: string }) {
  return <pre className="sy-code">{children}</pre>;
}
