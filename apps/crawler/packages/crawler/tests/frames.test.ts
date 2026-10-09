import { describe, expect, it } from 'vitest';
import { frameLabel, withFrameSnapshots } from '../src/frames.js';

describe('frameLabel', () => {
  it('uses the name, else the path', () => {
    expect(frameLabel({ name: 'menu', path: '0' })).toBe('menu');
    expect(frameLabel({ name: null, path: '0/1' })).toBe('0/1');
  });
});

describe('withFrameSnapshots', () => {
  const top = '- heading "Bank"\n- link "Home"';

  it('returns a page without frame parts byte-identical', () => {
    expect(withFrameSnapshots(top, [])).toBe(top);
  });

  it('leaves out empty frame snapshots', () => {
    expect(withFrameSnapshots(top, [{ label: 'a', snapshot: '  \n' }])).toBe(top);
  });

  it('appends indented blocks labelled by name or path, never by URL', () => {
    const out = withFrameSnapshots(top, [
      { label: 'menu', snapshot: '- link "A"\n- link "B"' },
      { label: '1/0', snapshot: '- text "x"' },
    ]);
    expect(out).toBe(
      [top, '- iframe "menu":\n  - link "A"\n  - link "B"', '- iframe "1/0":\n  - text "x"'].join(
        '\n',
      ),
    );
    expect(out).not.toContain('http');
  });
});
