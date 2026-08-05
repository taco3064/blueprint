#!/usr/bin/env node
/**
 * Remove `dist/` before a build.
 *
 * A file in its own script rather than `rm -rf dist` inside the npm script,
 * because npm runs scripts through `cmd.exe` on Windows, where `rm` does not
 * exist — the build failed on the first line, before rolldown ever ran. Inlining
 * `node -e` instead would work on posix and then hit cmd's own quote handling,
 * so the quoting lives in a file where no shell rewrites it.
 *
 * The clean matters (rather than letting rolldown overwrite): a renamed or
 * dropped entry leaves its old output behind, and `files: ["dist"]` would pack
 * the stale copy alongside the new one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

fs.rmSync(dist, { recursive: true, force: true });
