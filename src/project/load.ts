import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Load a module from the *project's* dependency tree — the runtime half of
 * the zero-dependency stance: this library never depends on eslint or the
 * parsers, but `impact` and doctor's wiring check need the project's own
 * copies at run time. Kept injectable so tests never touch real resolution.
 */

/* v8 ignore start -- real module resolution from the project; tests inject a loader */
export const loadProjectModule = async (name: string, root: string): Promise<unknown> => {
  try {
    // Resolve from the project's own tree (pnpm keeps this package's tree
    // isolated, so a bare import from here would miss the project's deps).
    const require = createRequire(path.join(root, 'package.json'));

    return await import(pathToFileURL(require.resolve(name)).href);
  } catch {
    // ESM-only packages expose no `require` entry — fall back to a bare
    // import, resolved from this package's location inside the project tree.
    return import(name);
  }
};
/* v8 ignore stop */

/** Dynamic-import interop: CJS resolutions hang the exports off `default`. */
export function unwrapModule<T>(module: unknown): T {
  const wrapped = module as { default?: T };

  return (wrapped.default ?? module) as T;
}
