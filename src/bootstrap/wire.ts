import type { PatchResult } from './alias';

/**
 * Greenfield alias surgery — on a fresh scaffold init owns the setup moment, so it
 * wires the alias in directly. Both cuts are precondition-guarded text edits:
 * anything not matching the known template shapes falls back to the instruct path.
 */

const DEFINE_CONFIG = /export default defineConfig\(\s*\{/;
const NODE_URL_IMPORT = 'import { fileURLToPath, URL } from \'node:url\'';

/** Insert `resolve.alias` into a create-vite-shaped config. */
export function wireViteAlias(text: string, alias: string, sourceDir = './src'): PatchResult {
  // Only the shape every create-vite template ships: an object-literal
  // defineConfig with no resolve section yet. Anything else is hands-off.
  if (!DEFINE_CONFIG.test(text) || /\bresolve\s*:/.test(text)) {
    return { kind: 'unparseable' };
  }

  const withResolve = text.replace(
    DEFINE_CONFIG,
    (match) =>
      `${match}\n  resolve: {\n    alias: {\n      '${alias}': fileURLToPath(new URL('${sourceDir}', import.meta.url)),\n    },\n  },`,
  );

  const withImport = withResolve.includes('fileURLToPath(new URL')
    && !withResolve.includes('from \'node:url\'')
    ? `${NODE_URL_IMPORT}\n\n${withResolve}`
    : withResolve;

  return { kind: 'patched', text: withImport };
}

/**
 * Insert a `paths` entry into a JSONC tsconfig (comments preserved). The
 * lossless JSON.parse patch stays the first choice — this is its greenfield
 * fallback for the commented configs create-vite and create-next-app ship.
 */
export function wireTsconfigPaths(
  text: string,
  paths: Record<string, string[]>,
): PatchResult {
  if (/"paths"\s*:/.test(text)) {
    return { kind: 'noop' };
  }

  // The line ending is captured, not assumed: a bare `\n` fails on a CRLF tsconfig,
  // and reusing the captured one keeps the file on a single convention.
  //
  // `exec`, not `String.match`: match answers `index: undefined` for a `g` pattern,
  // which would make `insertAt` NaN and `slice(0, NaN)` '' — the "patched" config
  // coming back as the inserted line alone.
  const opening = /"compilerOptions"\s*:\s*\{(\r?\n)(\s*)/.exec(text);

  if (!opening) {
    return { kind: 'unparseable' };
  }

  const [eol, indent] = opening.slice(1);
  const insertAt = opening.index + opening[0].length;

  const entries = Object.entries(paths)
    .map(([key, value]) => `"${key}": ${JSON.stringify(value)}`)
    .join(', ');

  return {
    kind: 'patched',
    text: `${text.slice(0, insertAt)}"paths": { ${entries} },${eol}${indent}${text.slice(insertAt)}`,
  };
}
