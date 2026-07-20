import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { runInspect } from '../inspect';
import type { Blueprint } from '../config';

const SHOWCASE = fileURLToPath(new URL('../../showcase', import.meta.url));

/**
 * Drift guard for the docs showcase. The generator (scripts/showcase.mjs)
 * refuses to render a section whose project is not inspect-clean; this pins
 * the same guarantee into the default test set, so a showcase can never rot
 * into an invalid structure without a red build here first.
 *
 * The projects' own `blueprint.config.mjs` are loaded at runtime — they
 * `import '@kekkai/blueprint'`, resolved to src by the vitest alias — so this
 * checks the real committed configs, not a duplicate.
 */
const PROJECTS: { dir: string; layers: string[] }[] = [
  { dir: 'react-vite', layers: ['pages', 'containers', 'components', 'hooks', 'contexts', 'services'] },
  { dir: 'vue-vite', layers: ['views', 'containers', 'components', 'composables', 'contexts', 'services'] },
  { dir: 'next-app-router', layers: ['app', 'containers', 'components', 'hooks', 'contexts', 'services'] },
  { dir: 'next-pages-router', layers: ['pages', 'containers', 'components', 'hooks', 'contexts', 'services'] },
  { dir: 'turbo-pnpm/apps/web', layers: ['pages', 'containers', 'components', 'hooks', 'contexts', 'services'] },
];

async function loadConfig(dir: string): Promise<Blueprint> {
  const url = pathToFileURL(path.join(SHOWCASE, dir, 'blueprint.config.mjs')).href;
  const module = (await import(url)) as { default: Blueprint };

  return module.default;
}

describe('showcase projects stay inspect-clean', () => {
  for (const project of PROJECTS) {
    it(`${project.dir} — no violations, exercises the shared layer set`, async () => {
      const config = await loadConfig(project.dir);
      const root = path.join(SHOWCASE, project.dir);

      const { ok } = await runInspect(root, { loadConfig: async () => config, log: () => {} });

      expect(ok).toBe(true);

      // Every stack carries the same roles, so the comparison holds.
      const declared = config.architecture.layers.map((layer) => layer.name);

      for (const layer of project.layers) {
        expect(declared).toContain(layer);
      }
    });
  }
});
