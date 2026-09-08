import type { PatchResult } from './alias';

const DEFINE_CONFIG = /export default defineConfig\(\s*\{/;
const NODE_URL_IMPORT = 'import { fileURLToPath, URL } from \'node:url\'';

export function wireViteAlias(text: string, alias: string, sourceDir = './src'): PatchResult {
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

export function wireTsconfigPaths(
  text: string,
  paths: Record<string, string[]>,
): PatchResult {
  if (/"paths"\s*:/.test(text)) {
    return { kind: 'noop' };
  }

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
