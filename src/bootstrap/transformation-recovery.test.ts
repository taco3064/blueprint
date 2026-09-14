import { expect, it } from 'vitest';
import { runInit } from './bootstrap';
import type { InitOptions } from './bootstrap';

it.each<InitOptions>([
  { topology: 'layer-first' }, { topology: 'module-first' }, { authoring: true },
  { preset: true }, { agent: 'codex' }, { framework: 'react' },
  { install: false }, { install: true },
])('rejects recovery combined with adoption options %j', async (options) => {
  await expect(runInit(process.cwd(), { ...options, recoverTransformation: true }))
    .rejects.toThrow('Use --recover-transformation alone or with --dry-run');
});
