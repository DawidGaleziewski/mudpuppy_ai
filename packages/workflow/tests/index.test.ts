import { describe, expect, it } from 'vitest';
import { WORKFLOW_PACKAGE_NAME } from '../src/index.js';

describe('packages/workflow scaffold', () => {
  it('exports the package name', () => {
    expect(WORKFLOW_PACKAGE_NAME).toBe('@mudpuppy/workflow');
  });
});
