import { describe, expect, it } from 'vitest';
import { serverVersion, traceConfigFromEnv } from '../src/trace-config.js';

describe('traceConfigFromEnv', () => {
  it('defaults to standard; Playwright traces on every environment (spec 021)', () => {
    expect(traceConfigFromEnv({})).toEqual({ level: 'standard', pwTrace: 'all' });
  });
  it('reads PATHFINDER_TRACE_LEVEL', () => {
    expect(traceConfigFromEnv({ PATHFINDER_TRACE_LEVEL: 'Verbose' })).toEqual({
      level: 'verbose',
      pwTrace: 'all',
    });
    expect(traceConfigFromEnv({ PATHFINDER_TRACE_LEVEL: 'off' })).toEqual({
      level: 'off',
      pwTrace: 'all',
    });
  });
  it('falls back to standard on an unknown level and reports it', () => {
    expect(traceConfigFromEnv({ PATHFINDER_TRACE_LEVEL: 'debug' })).toEqual({
      level: 'standard',
      pwTrace: 'all',
      invalidLevel: 'debug',
    });
  });
});

describe('serverVersion', () => {
  it('is the package version, with a git SHA when available', () => {
    expect(serverVersion(process.cwd())).toMatch(/^0\.0\.0(\+[0-9a-f]{4,})?$/);
    expect(serverVersion('/nonexistent-dir-for-test')).toBe('0.0.0');
  });
});
