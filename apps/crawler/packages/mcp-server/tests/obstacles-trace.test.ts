import { describe, expect, it, vi } from 'vitest';
import type { Tracer } from '@pathfinder/core';
import type { ObstacleEvent } from '@pathfinder/obstacles';
import { recordObstacles } from '../src/runtime/obstacles-trace.js';

const events: ObstacleEvent[] = [
  { id: 'cookie_banner', selector: '#cookie button.accept', via: 'sweep', at: 1 },
  { id: 'chat_widget', selector: '.chat-close', via: 'handler', at: 2 },
];

describe('recordObstacles', () => {
  it('emits one obstacle event per dismissal, in order', () => {
    const event = vi.fn();
    recordObstacles({ event } as unknown as Tracer, events);
    expect(event).toHaveBeenCalledTimes(2);
    expect(event).toHaveBeenNthCalledWith(1, 'obstacle', {
      obstacle_id: 'cookie_banner',
      selector: '#cookie button.accept',
      via: 'sweep',
    });
    expect(event).toHaveBeenNthCalledWith(2, 'obstacle', {
      obstacle_id: 'chat_widget',
      selector: '.chat-close',
      via: 'handler',
    });
  });

  it('emits nothing for an empty slice', () => {
    const event = vi.fn();
    recordObstacles({ event } as unknown as Tracer, []);
    expect(event).not.toHaveBeenCalled();
  });
});
