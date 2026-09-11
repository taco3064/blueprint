import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../../config';
import { emitLint } from './lint';

function blueprint(modules = ['auth', 'checkout']): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: modules.map((name) => ({ name, does: name })),
      layers: [
        { name: 'components', does: 'UI', layout: 'folder', entry: 'index' },
        { name: 'hooks', does: 'state' },
        {
          name: 'services', does: 'I/O', layout: 'folder', entry: 'index', owns: ['axios'],
        },
      ],
    },
  };
}

function restricted(code: string, filename: string, config = emitLint(blueprint())): string[] {
  const linter = new Linter({ configType: 'flat' });

  return linter.verify(code, config, { filename })
    .map((message) => message.ruleId)
    .filter((rule): rule is string => rule !== null);
}

function containerPatterns(config: ReturnType<typeof emitLint>, module = 'auth') {
  const file = `src/${module}/*.{js,jsx,ts,tsx}`;

  const entry = config.find((candidate) => candidate.files?.includes(file)
    && candidate.rules?.['no-restricted-imports'] !== undefined);

  const rule = entry?.rules?.['no-restricted-imports'] as
    ['error' | 'warn', { patterns: { group: string[]; message?: string }[] }] | undefined;

  return rule?.[1].patterns ?? [];
}

describe('emitLint · module-first topology', () => {
  it('emits one scoped file net for every declared module and shared layer', () => {
    const config = emitLint(blueprint());

    const files = config
      .flatMap((entry) => entry.files ?? [])
      .filter((file) => file.includes('/hooks/'));

    expect(files).toEqual([
      'src/auth/hooks/**/*.{js,jsx,ts,tsx}',
      'src/checkout/hooks/**/*.{js,jsx,ts,tsx}',
      'src/auth/hooks/**/*.{js,jsx,ts,tsx}',
      'src/checkout/hooks/**/*.{js,jsx,ts,tsx}',
    ]);

    expect(config.filter((entry) =>
      entry.files?.includes('src/auth/*.{js,jsx,ts,tsx}')
      && entry.rules?.['no-restricted-imports'] !== undefined)).toHaveLength(1);

    const entryOnly = containerPatterns(config).find((pattern) =>
      pattern.message?.includes('through its entry'));

    expect(entryOnly?.group).toEqual([
      '~app/auth/components/*/**',
      '~app/auth/services/*/**',
    ]);

    expect(containerPatterns(config).some((pattern) =>
      pattern.message?.includes('must not import fixtures'))).toBe(false);
  });

  it('fires an existing layer-flow rule inside a module and keeps its legal control green', () => {
    const file = 'src/auth/hooks/useAuth.ts';

    expect(restricted('import Login from "~app/auth/components/Login";', file))
      .toContain('no-restricted-imports');

    expect(restricted('import api from "~app/auth/services/api";', file))
      .not.toContain('no-restricted-imports');
  });

  it('governs module-root container imports with paired legal and illegal controls', () => {
    const file = 'src/auth/index.tsx';

    expect(restricted('import Login from "~app/auth/components/Login";', file)).toEqual([]);

    expect(restricted('import api from "~app/auth/services/api/internal";', file))
      .toContain('no-restricted-imports');

    expect(restricted('import axios from "axios";', file)).toContain('no-restricted-imports');

    expect(restricted('import shell from "./shell";', file))
      .not.toContain('blueprint/relative-escape');

    expect(restricted('import components from "./components";', file))
      .toContain('blueprint/relative-escape');

    expect(restricted('import Login from "./components/Login";', file))
      .toContain('blueprint/relative-escape');
  });

  it('preserves relative boundaries across module-first positions', () => {
    const unit = 'src/auth/components/Login/index.ts';

    expect(restricted('import useAuth from "../../hooks/useAuth";', unit))
      .toContain('blueprint/relative-escape');

    expect(restricted('import Cart from "../../../checkout/components/Cart";', unit))
      .toContain('blueprint/relative-escape');

    expect(restricted('import checkout from "../checkout/index";', 'src/auth/index.ts'))
      .toContain('blueprint/relative-escape');

    expect(restricted('import Signup from "../Signup";', unit))
      .not.toContain('blueprint/relative-escape');
  });

  it('carries fixture, ownership exemption, and global bans into module containers', () => {
    const configured = blueprint();

    configured.rules = { fixtureImports: 'error' };
    configured.architecture.additionalAliases = { '~auth': 'src/auth' };

    configured.architecture.layers[2].owns = [
      { package: 'axios', exempt: ['src/auth/index.tsx'] },
      { package: 'lodash' },
      { global: 'fetch' },
    ];

    const config = emitLint(configured);

    expect(restricted('import axios from "axios";', 'src/auth/index.tsx', config)).toEqual([]);

    expect(restricted('import lodash from "lodash";', 'src/auth/index.tsx', config))
      .toContain('no-restricted-imports');

    expect(restricted('import axios from "axios";', 'src/auth/shell.tsx', config))
      .toContain('no-restricted-imports');

    expect(restricted('import data from "~app/fixtures/data";', 'src/auth/index.tsx', config))
      .toContain('no-restricted-imports');

    const fixtures = containerPatterns(config).find((pattern) =>
      pattern.message?.includes('must not import fixtures'));

    expect(fixtures?.group).toEqual([
      '~app/fixtures',
      '~app/fixtures/**',
    ]);

    expect(restricted('fetch("/");', 'src/auth/index.tsx', config))
      .toContain('no-restricted-globals');
  });

  it('applies the same semantics to ordinary shared, common, and renamed module names', () => {
    for (const module of ['shared', 'common', 'renamed']) {
      const config = emitLint(blueprint([module]));
      const file = `src/${module}/hooks/useX.ts`;

      expect(restricted(`import X from "~app/${module}/components/X";`, file, config))
        .toContain('no-restricted-imports');

      expect(restricted(`import api from "~app/${module}/services/api";`, file, config))
        .not.toContain('no-restricted-imports');
    }
  });
});

describe('emitLint · reserved app router composition', () => {
  it.each([
    'src/app/dashboard/page.tsx',
    'src/app/settings/account/page.tsx',
  ])('governs nested source as a container with positive and negative controls: %s', (file) => {
    const configured = blueprint(['app', 'auth', 'checkout']);

    configured.architecture.modules![0].dependsOn = ['auth'];
    const config = emitLint(configured);

    expect(config.flatMap((entry) => entry.files ?? []))
      .toContain('src/app/**/*.{js,jsx,ts,tsx}');

    expect(config.flatMap((entry) => entry.files ?? []))
      .not.toContain('src/app/hooks/**/*.{js,jsx,ts,tsx}');

    expect(restricted('import auth from "~app/auth";', file, config)).toEqual([]);

    expect(restricted('import checkout from "~app/checkout";', file, config))
      .toContain('no-restricted-imports');

    expect(restricted('import sibling from "../settings/routes";', file, config))
      .not.toContain('blueprint/relative-escape');

    expect(restricted('import auth from "../../../auth/index";', file, config))
      .toContain('blueprint/relative-escape');
  });
});

describe('emitLint · module-first unit boundaries', () => {
  it('enforces folder-unit entry boundaries within each module', () => {
    const file = 'src/auth/components/Login/index.tsx';

    expect(restricted('import api from "~app/auth/services/api/internal";', file))
      .toContain('no-restricted-imports');

    expect(restricted('import api from "~app/auth/services/api";', file))
      .not.toContain('no-restricted-imports');
  });

  it('ignores module-scoped aliases that cannot address the current module', () => {
    const configBlueprint = blueprint();

    configBlueprint.architecture.additionalAliases = { '~checkout': 'src/checkout' };

    configBlueprint.architecture.layers[2].allowedImporters = [
      { layer: 'components', selfOnly: true },
    ];

    expect(() => emitLint(configBlueprint)).not.toThrow();
  });
});
