/**
 * Draw the wireframes of a portal's recorded states (spec 008 R-21, T032): states that have none or
 * one from an older generator, or every state with --all. Useful after a style change
 * (GENERATOR_VERSION) and for states recorded before migration 0006.
 * Usage: pnpm wireframes:build <portal> [--env production] [--all] [--root <repo root>]
 * Prints a JSON report. Exit 0 on success, 2 on bad input or a missing store.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createEvidenceStore } from '@pathfinder/core';
import { rebuildWireframes } from '@pathfinder/mcp-server';
import { dbPathFor, migrateUp, openDb } from '@pathfinder/store';
import { scriptEnvironment } from './script-env.js';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const portal = process.argv[2];
if (!portal || portal.startsWith('--') || !/^[a-z0-9][a-z0-9_-]*$/.test(portal)) {
  console.error('usage: pnpm wireframes:build <portal> [--env <env>] [--all]');
  process.exit(2);
}
const root = resolve(arg('root', join(import.meta.dirname, '../../..')));
const env = scriptEnvironment(root, arg('env', '') || undefined);
const path = dbPathFor(join(root, 'data'), env);
if (!existsSync(path)) {
  console.error(`no store for environment ${env}: ${path}`);
  process.exit(2);
}

const opened = openDb(path);
try {
  // An older store gets the state_wireframes table first (the servers do the same on start).
  migrateUp(opened.raw, join(root, 'data', 'migrations'));
  const report = await rebuildWireframes(
    { db: opened.db, evidence: createEvidenceStore(join(root, 'data', 'evidence')) },
    portal,
    { all: process.argv.includes('--all') },
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await opened.close();
}
