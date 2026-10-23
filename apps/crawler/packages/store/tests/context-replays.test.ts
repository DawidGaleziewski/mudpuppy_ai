import { describe, expect, it } from 'vitest';
import { separatingFlag, type ReplayLanding } from '../src/context-replays.js';

const at = (stateId: string | null, flags: Record<string, string>): ReplayLanding => ({
  stateId,
  flags,
});

describe('separatingFlag (rule R5, spec 046)', () => {
  it('names the cookie whose value follows the landing, not the session id', () => {
    const landings = [
      at('s-a', { 'cookie:sid': 'x1', 'cookie:ab_baner': 'A' }),
      at('s-b', { 'cookie:sid': 'x2', 'cookie:ab_baner': 'B' }),
      at('s-a', { 'cookie:sid': 'x3', 'cookie:ab_baner': 'A' }),
    ];
    expect(separatingFlag(landings)).toBe('cookie:ab_baner');
  });

  it('finds none when the landings do not alternate, or no flag follows them', () => {
    expect(separatingFlag([at('s-a', { 'cookie:x': '1' }), at('s-a', { 'cookie:x': '2' })])).toBe(
      null,
    );
    const noFlag = [
      at('s-a', { 'cookie:sid': 'x1' }),
      at('s-b', { 'cookie:sid': 'x2' }),
      at('s-a', { 'cookie:sid': 'x3' }),
    ];
    expect(separatingFlag(noFlag)).toBe(null);
  });

  it('needs the flag on every landing; a diverged replay does not count', () => {
    const landings = [
      at('s-a', { 'storage:arm': 'a' }),
      at('s-b', {}),
      at(null, {}),
      at('s-a', { 'storage:arm': 'a' }),
    ];
    expect(separatingFlag(landings)).toBe(null);
    expect(
      separatingFlag([
        at('s-a', { 'storage:arm': 'a' }),
        at(null, {}),
        at('s-b', { 'storage:arm': 'b' }),
      ]),
    ).toBe('storage:arm');
  });
});
