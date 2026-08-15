#!/usr/bin/env node
/**
 * Run THIS repo's CLI from `src/`, never from `dist/`.
 *
 * `npx blueprint` and the `bin` field both resolve to `./dist/bin.js`, so every
 * answer they give is a function of when somebody last ran a build rather than
 * of the source beside them — a stale run and a fresh one print the same green.
 * `npm run build &&` in front of the command removes the staleness and keeps
 * the rest: a gate compiled from the tree it guards still goes quiet when a
 * defect makes it emit less.
 *
 * jiti is what closes it. It resolves the entry-only directory imports plain
 * Node cannot (`ERR_UNSUPPORTED_DIR_IMPORT`) and transpiles TypeScript in
 * process, so `src/cli` is loaded as it is on disk, with no build step in front.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJiti } from 'jiti';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(import.meta.url);

/** @type {{ run: (argv: string[], cwd?: string) => Promise<number> }} */
const { run } = await jiti.import(path.join(root, 'src/cli'));

// The repo root, not `process.cwd()`: this runner exists to inspect this repo,
// and an npm script invoked from a subdirectory would otherwise inspect that.
process.exit(await run(process.argv.slice(2), root));
