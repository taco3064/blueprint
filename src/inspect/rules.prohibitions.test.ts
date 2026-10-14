import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { runRules } from './rules';

it('reports prohibitions when only a later layer declares them', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-rules-prohibitions-'));

  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));

    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), `export default ${JSON.stringify({
      framework: 'react', architecture: { alias: '@', layers: [
        { name: 'ui', does: 'presentation' },
        { name: 'domain', does: 'policy', mustNot: [{
          id: 'ui', description: 'UI', checks: [{ call: 'divIcon' }],
        }] },
      ] },
    })};`);

    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/map.ts'), 'export const map = 1;');
    const { prohibitions } = await runRules(root, { log: () => {} });

    expect(prohibitions).toHaveLength(1);

    expect(prohibitions[0]).toMatchObject({ layer: 'domain', id: 'ui',
      reach: 'covered', matchedFiles: ['src/domain/map.ts'] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
