// Our CSS (skill frontend-architecture § 4, spec 076): role tokens only, class names as BEM
// component classes (`sy-block__element--modifier`) or token utilities (`u-…`). The designer's
// copy in `src/design-system/assets/` is theirs and not linted.

/** The raw palette: components use the roles that point at it (tokens.css, layer 2). */
const RAW_PALETTE =
  /var\(--sy-(steel-\d+|line|strong|edge|chalk|ash|ink|marker(-hi)?|manila|inspected|coolant|blueprint|failure|paper(-ink|-link)?)\)/;

/** @type {import('stylelint').Config} */
export default {
  ignoreFiles: ['src/design-system/assets/**', 'dist/**', 'storybook-static/**', 'node_modules/**'],
  rules: {
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklch'],
    'selector-class-pattern': [
      '^(sy|u)-[a-z0-9]+(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$',
      { message: 'a class is sy-block, sy-block__element, sy-block--modifier or a u- utility' },
    ],
    'selector-max-id': 0,
    'declaration-no-important': true,
    'declaration-property-value-disallowed-list': [
      {
        // a length that has a token is the token, not the number
        '/^(margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left)/': ['/\\b[1-9]\\d*px\\b/'],
        '/^(font-size|font-family|border-radius|box-shadow)$/': ['/^(?!var\\().*/'],
        '/.*/': [RAW_PALETTE],
      },
      { message: 'use a role token (var(--sy-…)), never a literal or the raw palette' },
    ],
  },
};
