import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* v8 ignore start -- real module resolution from the project; tests inject a loader */
export const loadProjectModule = async (name: string, root: string): Promise<unknown> => {
  try {
    const require = createRequire(path.join(root, 'package.json'));

    return await import(pathToFileURL(require.resolve(name)).href);
  } catch {
    return import(name);
  }
};
/* v8 ignore stop */

export function unwrapModule<T>(module: unknown): T {
  const wrapped = module as { default?: T };

  return (wrapped.default ?? module) as T;
}
