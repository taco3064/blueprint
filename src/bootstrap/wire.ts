import type { PatchResult } from './alias';

/**
 * Greenfield alias surgery. On a fresh scaffold the vite config and the
 * commented tsconfig were generated seconds ago by the project template —
 * init owns that setup moment, so it wires the alias in directly instead of
 * leaving "the rules assume infrastructure nobody installed" (a real agent
 * complaint from the field). Both cuts are precondition-guarded text edits:
 * anything that does not match the known template shapes falls back to the
 * instruct path, and brownfield repos never reach this module at all.
 */

const DEFINE_CONFIG = /export default defineConfig\(\s*\{/;
const NODE_URL_IMPORT = 'import { fileURLToPath, URL } from \'node:url\'';

/** Insert `resolve.alias` into a create-vite-shaped config. */
export function wireViteAlias(text: string, alias: string): PatchResult {
  // Only the shape every create-vite template ships: an object-literal
  // defineConfig with no resolve section yet. Anything else is hands-off.
  if (!DEFINE_CONFIG.test(text) || /\bresolve\s*:/.test(text)) {
    return { kind: 'unparseable' };
  }

  const withResolve = text.replace(
    DEFINE_CONFIG,
    (match) =>
      `${match}\n  resolve: {\n    alias: {\n      '${alias}': fileURLToPath(new URL('./src', import.meta.url)),\n    },\n  },`,
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
  if (/"paths"\s*:/.test(text)) return { kind: 'noop' };

  const opening = text.match(/"compilerOptions"\s*:\s*\{\n(\s*)/);

  if (!opening || opening.index === undefined) return { kind: 'unparseable' };

  const indent = opening[1];
  const insertAt = opening.index + opening[0].length;

  const entries = Object.entries(paths)
    .map(([key, value]) => `"${key}": ${JSON.stringify(value)}`)
    .join(', ');

  return {
    kind: 'patched',
    text: `${text.slice(0, insertAt)}"paths": { ${entries} },\n${indent}${text.slice(insertAt)}`,
  };
}
