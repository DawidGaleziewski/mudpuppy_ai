/* eslint-disable no-restricted-syntax -- the token catalogue is the one place that paints tokens by hand */
// The role tokens of `assets/css/tokens.css`, shown live from the CSS (Storybook's Tokens page).
// Components and pages use roles only; the raw palette exists so roles can be re-pointed.

export const COLOUR_ROLES: readonly (readonly [string, string])[] = [
  ['--sy-bg-ground', 'Page ground (with the grid)'],
  ['--sy-bg-well', 'Wells: composer, plate feet, read-only'],
  ['--sy-bg-plate', 'Plates, header, nav, drawer'],
  ['--sy-bg-raised', 'Hover; your own chat messages'],
  ['--sy-bg-inverse', 'Selected nav item, pressed segment'],
  ['--sy-border-weld', 'Weld line inside a plate'],
  ['--sy-border-plate', 'Plate edge'],
  ['--sy-border-control', 'Control edge (inputs, buttons)'],
  ['--sy-text', 'Primary text'],
  ['--sy-text-muted', 'Secondary text'],
  ['--sy-intent', 'Intent: brand, the primary button, "needs you"'],
  ['--sy-tag', 'Tag card: records and human notes'],
  ['--sy-ok', 'Passed, settled, confirmed'],
  ['--sy-active', 'Active now: running, live'],
  ['--sy-tobe', 'Drawn, not built: to-be, drafts, inferred'],
  ['--sy-fail', 'Failure, and nothing else'],
  ['--sy-focus', 'Focus ring'],
];

export const TYPE_TOKENS = ['--sy-fs-display', '--sy-fs-h1', '--sy-fs-h2', '--sy-fs-h3', '--sy-fs-body', '--sy-fs-sm', '--sy-fs-label', '--sy-fs-mono', '--sy-fs-note'];

export const SPACE_TOKENS = ['--sy-space-1', '--sy-space-2', '--sy-space-3', '--sy-space-4', '--sy-space-5', '--sy-space-6', '--sy-space-7', '--sy-space-8', '--sy-space-9'];

export function ColourRoles() {
  return (
    <table className="sy-table">
      <caption className="sy-sr-only">Colour roles</caption>
      <thead>
        <tr>
          <th scope="col">Swatch</th>
          <th scope="col">Token</th>
          <th scope="col">What it is for</th>
        </tr>
      </thead>
      <tbody>
        {COLOUR_ROLES.map(([token, use]) => (
          <tr key={token}>
            <td>
              <span
                style={{
                  display: 'inline-block',
                  width: 48,
                  height: 24,
                  background: `var(${token})`,
                  border: '1px solid var(--sy-border-plate)',
                }}
              />
            </td>
            <th scope="row" className="sy-mono">
              {token}
            </th>
            <td>{use}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TypeScale() {
  return (
    <div className="sy-stack">
      {TYPE_TOKENS.map((t) => (
        <div key={t} style={{ fontSize: `var(${t})` }}>
          <span className="sy-mono sy-muted">{t}</span> Oblicz składkę OC/AC
        </div>
      ))}
    </div>
  );
}

export function SpaceScale() {
  return (
    <div className="sy-stack">
      {SPACE_TOKENS.map((t) => (
        <div key={t} className="sy-cluster">
          <span className="sy-mono sy-muted" style={{ minWidth: '9rem' }}>
            {t}
          </span>
          <span style={{ display: 'inline-block', height: 12, width: `var(${t})`, background: 'var(--sy-text-muted)' }} />
        </div>
      ))}
    </div>
  );
}
