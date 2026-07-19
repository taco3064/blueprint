import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitLint } from './lint';

const blueprint = defineBlueprint({
  framework: 'auto',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI' },
      { name: 'hooks', does: 'state', owns: [{ package: 'react', imports: ['useContext'] }] },
      {
        name: 'services',
        does: 'net',
        owns: ['axios', { global: 'fetch' }],
        allowedImporters: [{ layer: 'components', selfOnly: true }, 'hooks'],
      },
    ],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
  },
});

const config = [
  { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
  ...emitLint(blueprint),
];

const linter = new Linter({ configType: 'flat' });

/** Restricted-rule ids reported for `code` when linted as `filename`. */
function restricted(code: string, filename: string): string[] {
  return linter
    .verify(code, config, { filename })
    .map((message) => message.ruleId)
    .filter((id): id is string => id != null && id.startsWith('no-restricted-'));
}

const COMPONENT = 'src/components/Button/Button.ts';
const SERVICE = 'src/services/api/api.ts';

describe('emitLint · dependency flow', () => {
  it('allows importing a downstream module through its entry', () => {
    expect(restricted('import { useX } from "~app/hooks/useX";', COMPONENT)).toEqual([]);
  });

  it('bans importing an upstream layer', () => {
    expect(restricted('import { Button } from "~app/components/Button";', SERVICE)).toContain(
      'no-restricted-imports',
    );
  });

  it('bans importing the same layer via the alias', () => {
    expect(restricted('import { Card } from "~app/components/Card";', COMPONENT)).toContain(
      'no-restricted-imports',
    );
  });

  it('bans an upper-level relative import', () => {
    expect(restricted('import { useX } from "../hooks/useX";', COMPONENT)).toContain(
      'no-restricted-imports',
    );
  });
});

describe('emitLint · module boundaries', () => {
  it('bans reaching inside another module (deep import)', () => {
    expect(restricted('import x from "~app/hooks/useX/impl";', COMPONENT)).toContain(
      'no-restricted-imports',
    );
  });

  it('does not catch undeclared folders in lint — deferred to inspect (S6)', () => {
    // ESLint group negation cannot express closed-world; inspect handles it.
    expect(restricted('import x from "~app/utils/helper";', COMPONENT)).toEqual([]);
  });
});

describe('emitLint · package ownership', () => {
  it('bans a package in a layer that does not own it', () => {
    expect(restricted('import axios from "axios";', COMPONENT)).toContain('no-restricted-imports');
  });

  it('allows a package in its owning layer', () => {
    expect(restricted('import axios from "axios";', SERVICE)).toEqual([]);
  });

  it('bans only the named import that another layer owns', () => {
    expect(restricted('import { useContext } from "react";', COMPONENT)).toContain(
      'no-restricted-imports',
    );

    expect(restricted('import { useState } from "react";', COMPONENT)).toEqual([]);
  });
});

describe('emitLint · global ownership', () => {
  it('bans a global in a layer that does not own it', () => {
    expect(restricted('const r = fetch("/x");', COMPONENT)).toContain('no-restricted-globals');
  });

  it('allows a global in its owning layer', () => {
    expect(restricted('const r = fetch("/x");', SERVICE)).toEqual([]);
  });
});

describe('emitLint · selfOnly re-export', () => {
  it('bans re-exporting from a selfOnly target', () => {
    expect(restricted('export { api } from "~app/services/api";', COMPONENT)).toContain(
      'no-restricted-syntax',
    );
  });

  it('still allows importing (not re-exporting) the selfOnly target', () => {
    expect(restricted('import { api } from "~app/services/api";', COMPONENT)).toEqual([]);
  });
});

describe('emitLint · shape', () => {
  it('emits one config entry per layer with a files glob', () => {
    const emitted = emitLint(blueprint);

    expect(emitted).toHaveLength(3);
    expect(emitted.every((entry) => Array.isArray(entry.files))).toBe(true);
  });

  it('honors emit.lint.severity', () => {
    const warned = emitLint({ ...blueprint, emit: { lint: { severity: 'warn' } } });
    const rule = warned[0].rules?.['no-restricted-imports'] as [string];

    expect(rule[0]).toBe('warn');
  });

  it('emits a leading ignore entry and splits a layer on exempt files', () => {
    const bp = defineBlueprint({
      framework: 'auto',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'components', does: '' },
          { name: 'services', does: '', owns: [{ package: 'axios', exempt: ['**/*.gen.ts'] }] },
        ],
        flow: 'one-way',
        layerFilesIgnore: ['**/*.d.ts'],
        module: { layout: 'folder', entry: 'index', private: [] },
      },
    });

    const emitted = emitLint(bp);

    expect(emitted[0]).toEqual({ ignores: ['**/*.d.ts'] });

    const componentEntries = emitted.filter((entry) =>
      entry.files?.some((file) => file.includes('components')),
    );

    expect(componentEntries).toHaveLength(2);
    expect(componentEntries.some((entry) => entry.ignores?.includes('**/*.gen.ts'))).toBe(true);
  });
});
