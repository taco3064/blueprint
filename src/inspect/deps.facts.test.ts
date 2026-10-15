import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import { vuePreset } from '../presets';
import { runDeps } from './deps';
import * as architectureFacts from './facts';

it('requests governed-source facts explicitly for dependency analysis', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-deps-facts-'));
  const blueprint = vuePreset();

  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'facts' }));
  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), 'export default {};');
  fs.mkdirSync(path.join(root, 'src/services/api'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/services/api/index.ts'), 'export const api = 1;');
  const collect = vi.spyOn(architectureFacts, 'collectArchitectureFacts');

  try {
    const result = await runDeps(root, { loadConfig: async () => blueprint, log: () => {} });

    expect(result.ok).toBe(true);
    expect(result.units.map((unit) => unit.unit)).toEqual(['services/api']);

    expect(collect).toHaveBeenCalledExactlyOnceWith(root, blueprint, {
      demand: 'governed-source',
    });

    expect(collect.mock.results[0].value).toMatchObject({
      demand: 'governed-source', outsideScope: { status: 'not-requested' },
    });
  } finally {
    collect.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
