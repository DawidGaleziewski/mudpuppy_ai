/**
 * Preformatted text exactly as stored: a JSON shape, a config snapshot. Long lines scroll inside
 * it, so a keyboard can reach it (it takes focus) and a screen reader hears its `label` when given.
 */
export function Code({ children, label }: { children: string; label?: string }) {
  return (
    <pre className="sy-code" tabIndex={0} {...(label ? { role: 'region', 'aria-label': label } : {})}>
      {children}
    </pre>
  );
}
