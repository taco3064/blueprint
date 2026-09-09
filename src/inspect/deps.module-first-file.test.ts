import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runDeps } from './deps';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-deps-module-file-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// test config');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeSource(relative: string, content: string): void {
  const target = path.join(root, 'src', relative);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

describe('runDeps · module-first file-layout granularity', () => {
  it('annotates qualified layer nodes in target and leaderboard output', async () => {
    const config = {
      framework: 'react' as const,
      architecture: {
        alias: '~app',
        modules: [{ name: 'auth', does: 'authentication' }],
        layers: [
          { name: 'components', does: 'UI', layout: 'folder' as const },
          { name: 'hooks', does: 'state', layout: 'file' as const },
        ],
      },
    };

    writeSource('auth/hooks/useAuth.ts', 'export const useAuth = () => null;');

    writeSource(
      'auth/components/Login/index.ts',
      'import { useAuth } from "~app/auth/hooks/useAuth";',
    );

    let output = '';

    await runDeps(root, {
      target: 'auth/hooks',
      log: (message) => (output = message),
      loadConfig: async () => config,
    });

    expect(output).toContain('auth/hooks (file-layout layer — answers at layer granularity)');

    await runDeps(root, {
      log: (message) => (output = message),
      loadConfig: async () => config,
    });

    expect(output).toContain('← auth/hooks (file-layout layer)');
  });
});
