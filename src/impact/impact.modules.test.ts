import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runImpact } from './impact';

/**
 * AC3 (as it applies to `impact`): the same violation the emitted lint config
 * catches must be the one `impact` reports — not a second, disagreeing answer.
 * Before this stage, `lintLayers` built its glob list from
 * `architecture.layers.flatMap(layer => resolveLayerFiles(layer.name, ...))`
 * alone, a bare layer glob a modular file's real path never matches — so
 * `impact` linted ZERO files on any modular repo and always reported "0 hits",
 * even when the real merged config (which `emitLint` already compiled
 * correctly, since stage 2) was actively enforcing bans against that same code.
 */
let root: string;

const silent = () => {};

function project(): void {
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { react: '^18' } }),
  );

  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// user config');
}

interface LintResult {
  filePath: string;
  messages: { ruleId: string | null; fatal?: boolean }[];
}

/** A fake eslint module capturing the file patterns impact hands the real one. */
function fakeEslint(results: LintResult[]) {
  const captured: { patterns?: string[] } = {};

  class ESLint {
    constructor(_options: Record<string, unknown>) {}

    async lintFiles(patterns: string[]): Promise<LintResult[]> {
      captured.patterns = patterns;

      return results;
    }
  }

  return { module: { ESLint }, captured };
}

function loader(eslintModule: unknown) {
  return {
    loadModule: async (name: string): Promise<unknown> => {
      if (name === 'eslint') {
        return eslintModule;
      }

      throw new Error(`unexpected module ${name}`);
    },
  };
}

const modularConfig = async () => ({
  framework: 'react' as const,
  architecture: {
    alias: '~app',
    layers: [
      { name: 'hooks', does: 'state' },
      { name: 'components', does: 'ui' },
    ],
    modules: [
      { name: 'Combat', does: 'the fight loop' },
      { name: 'Lobby', does: 'matchmaking', layers: false as const },
    ],
  },
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-impact-modules-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('runImpact · a modular blueprint', () => {
  it('lints module-scoped globs, not the bare layer globs no modular file matches', async () => {
    project();

    const { module, captured } = fakeEslint([]);
    const { loadModule } = loader(module);

    await runImpact(root, { loadConfig: modularConfig, loadModule, log: silent });

    // The pre-stage-3 defect, made concrete: `resolveLayerFiles('hooks', ...)`
    // alone would have handed ESLint `src/hooks/**/*...`, which no file under
    // `src/Combat/hooks/` (or `src/Lobby/`) ever matches — so `lintFiles` was
    // always called with a glob set that caught nothing on any modular repo.
    expect(captured.patterns).toContain('src/Combat/hooks/**/*.{js,jsx,ts,tsx}');
    expect(captured.patterns).toContain('src/Combat/*.{js,jsx,ts,tsx}');
    expect(captured.patterns).toContain('src/Lobby/**/*.{js,jsx,ts,tsx}');
    expect(captured.patterns).not.toContain('src/hooks/**/*.{js,jsx,ts,tsx}');
  });

  it('reports a real hit from a file that sits inside a module — not a vacuous zero', async () => {
    project();

    const at = (rel: string) => path.join(root, rel);

    const { module } = fakeEslint([
      {
        filePath: at('src/Combat/hooks/useCombat.ts'),
        messages: [{ ruleId: 'no-restricted-imports' }],
      },
    ]);

    const { loadModule } = loader(module);

    let output = '';

    const { impacts, total } = await runImpact(root, {
      loadConfig: modularConfig,
      loadModule,
      log: (message) => (output = message),
    });

    expect(total).toBe(1);
    expect(impacts[0]).toMatchObject({ rule: 'no-restricted-imports', count: 1, files: 1 });
    expect(output).toContain('1 hit(s)');
    // Not the vacuous-zero wording — a real file was linted.
    expect(output).not.toContain('vacuous');
  });
});
