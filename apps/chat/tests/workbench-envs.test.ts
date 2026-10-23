import { describe, expect, it } from 'vitest';
import {
  commandEnvironments,
  commandsAllowedOn,
  commandsOffReason,
} from '../src/workbench-envs.js';

describe('Workbench commands per environment (spec 043 D-6, R-94 (8))', () => {
  it('are on for local-dev and sandbox by default, off elsewhere', () => {
    expect(commandsAllowedOn('local-dev', undefined)).toBe(true);
    expect(commandsAllowedOn('sandbox', undefined)).toBe(true);
    expect(commandsAllowedOn('production', undefined)).toBe(false);
  });

  it('follow the owner setting, a comma list; an empty one switches every environment off', () => {
    expect(commandEnvironments(' staging , local-dev ,')).toEqual(['staging', 'local-dev']);
    expect(commandsAllowedOn('staging', 'staging,local-dev')).toBe(true);
    expect(commandsAllowedOn('sandbox', 'staging')).toBe(false);
    expect(commandsAllowedOn('sandbox', '')).toBe(false);
  });

  it('say why and where to go instead', () => {
    expect(commandsOffReason('production')).toBe(
      'Workbench commands are off on production: start scans in Scans',
    );
  });
});
