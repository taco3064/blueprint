import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runImpact } from './impact';

let root: string;

const blueprint = {
  framework: 'react' as const,
  architecture: {
    alias: '~app',
    layers: [{ name: 'components', does: 'UI' }],
  },
  rules: {},
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-impact-compatibility-'));

  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'x', dependencies: { react: '^18' },
  }));

  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), '// config');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function options(ESLint: unknown, log: (message: string) => void = () => {}) {
  return {
    loadConfig: async () => blueprint,
    loadModule: async () => ({ ESLint }),
    log,
  };
}

function versioned(version: string, captured: { options?: object }) {
  return class ESLint {
    static version = version;

    constructor(input: object) {
      captured.options = input;
    }

    async lintFiles() {
      return [];
    }
  };
}

describe('runImpact ESLint compatibility', () => {
  it('returns unavailable for ESLint 8 without invoking flat config', async () => {
    const captured: { options?: object } = {};
    const ESLint = versioned('8.57.1', captured);
    let output = '';

    const result = await runImpact(root, options(ESLint, (message) => (output = message)));

    expect(result).toEqual({
      status: 'unavailable', impacts: [], total: 0,
      reason: 'eslint-flat-api-unsupported', eslintMajor: 8,
    });

    expect(captured.options).toBeUndefined();
    expect(output).toContain('Migrate the project to ESLint 9 or 10');
    expect(output).not.toContain('overrideConfigFile');
    expect(output).toContain('does not mean the emitted rules have zero hits');

    await runImpact(root, { ...options(ESLint, (message) => (output = message)), json: true });

    expect(JSON.parse(output)).toMatchObject({
      status: 'unavailable', reason: 'eslint-flat-api-unsupported', eslintMajor: 8,
    });
  });

  it('normalizes an unversioned flat-config rejection without leaking raw errors', async () => {
    class ESLint {
      constructor() {
        throw new Error('Invalid Options: overrideConfigFile must be a non-empty string');
      }
    }

    let output = '';
    const result = await runImpact(root, options(ESLint, (message) => (output = message)));

    expect(result.status).toBe('unavailable');
    expect(output).toContain('project-local ESLint API');
    expect(output).not.toContain('overrideConfigFile');
  });

  it('does not hide an unrelated ESLint execution failure', async () => {
    class ESLint {
      constructor() {
        throw new Error('project config module crashed');
      }
    }

    await expect(runImpact(root, options(ESLint))).rejects.toThrow('project config module crashed');
  });

  it('normalizes a non-Error flat API rejection too', async () => {
    class ESLint {
      constructor() {
        throw 'FlatESLint unavailable';
      }
    }

    expect((await runImpact(root, options(ESLint))).status).toBe('unavailable');
  });

  it.each(['release9.0.0', 'invalid', ''])('rejects malformed version %s', async (version) => {
    class ESLint {
      static version = version;

      constructor() {
        throw new Error('FlatESLint unavailable');
      }
    }

    const result = await runImpact(root, options(ESLint));

    expect(result).toMatchObject({ status: 'unavailable', eslintMajor: null });
  });

  it('does not claim compatibility beyond the supported ESLint majors', async () => {
    const captured: { options?: object } = {};
    const ESLint = versioned('11.0.0', captured);
    let output = '';

    const result = await runImpact(root, options(ESLint, (message) => (output = message)));

    expect(result.status).toBe('unavailable');
    expect(captured.options).toBeUndefined();
    expect(output).toContain('Use a supported ESLint 9 or 10 release');
  });
});
