import { describe, expect, it } from 'vitest';
import { CHAT_SERVICE_NAME } from '../src/index.js';

describe('apps/chat scaffold', () => {
  it('exports the service name', () => {
    expect(CHAT_SERVICE_NAME).toBe('pathfinder-chat');
  });
});
