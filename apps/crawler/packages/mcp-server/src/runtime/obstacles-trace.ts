import type { Tracer } from '@pathfinder/core';
import type { ObstacleEvent } from '@pathfinder/obstacles';

/**
 * One `event obstacle` per dismissal (contracts/trace-spans.md; research §16). Pure: the caller
 * decides which slice of `session.obstacles.events` is new (after `settle` and at call end, so a
 * handler-fired dismissal during a click is still reported once, in call order).
 */
export function recordObstacles(tracer: Tracer, events: readonly ObstacleEvent[]): void {
  for (const e of events) {
    tracer.event('obstacle', { obstacle_id: e.id, selector: e.selector, via: e.via });
  }
}
