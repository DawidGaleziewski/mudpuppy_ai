// Spec 076 T030: Box and the layout components space and tone through the token utility classes
// only: each prop is one generated class, and every class they name exists in utilities.css.

import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Box, Stack } from '../src/design-system';

const utilities = readFileSync(join(import.meta.dirname, '..', 'src', 'design-system', 'styles', 'utilities.css'), 'utf8');

describe('Box', () => {
  it('turns typed props into utility classes, nothing else', () => {
    const { container } = render(
      <Box mt={4} px={2} tone="fail" surface="well" display="flex" align="center" justify="between" grow>
        x
      </Box>,
    );
    const classes = (container.firstElementChild as HTMLElement).className.split(' ');
    expect(classes).toEqual(['u-mt-4', 'u-px-2', 'u-text-fail', 'u-bg-well', 'u-flex', 'u-items-center', 'u-justify-between', 'u-grow', 'u-min-w-0']);
    for (const c of classes) expect(utilities).toContain(`.${c} {`);
    expect((container.firstElementChild as HTMLElement).getAttribute('style')).toBeNull();
  });

  it('a layout component keeps its own class and adds the gap', () => {
    const { container } = render(<Stack gap={1}>x</Stack>);
    expect((container.firstElementChild as HTMLElement).className).toBe('sy-stack u-gap-1');
  });
});
