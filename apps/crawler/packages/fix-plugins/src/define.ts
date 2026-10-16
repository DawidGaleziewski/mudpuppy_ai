// What a fix-plugin is (spec 030 FR-030): one solution to a class of portal scar, written once and
// tested, that takes the client-specific data it needs as validated parameters and returns ordinary
// portal hooks (spec 023). The client's data lives in the portal file, never in the plugin.

import type { HookPoint } from '@pathfinder/config';
import type { Hook } from '@pathfinder/hooks';
import type { z } from 'zod';

export type FixHooks = Partial<Record<HookPoint, Hook>>;

export interface FixPlugin<P extends z.ZodType = z.ZodType> {
  /** The name a portal uses: `fixes: [{ use: <id>, with: {…} }]`. */
  id: string;
  /** One sentence: the obstacle class it fixes. */
  summary: string;
  /** Scar ids that prove it (`SC-nn`) and the field ids it came from. */
  scars: readonly string[];
  /** The client-specific data, validated before the run starts. */
  params: P;
  /** The hooks for one portal's parameters. */
  hooks(params: z.infer<P>): FixHooks;
}

/** Keeps the parameter type of a plugin while storing it in the untyped registry. */
export const defineFix = <P extends z.ZodType>(plugin: FixPlugin<P>): FixPlugin => plugin;
