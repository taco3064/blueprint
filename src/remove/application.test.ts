import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { digest } from '../lifecycle';
import type { ProvenanceRecord } from '../lifecycle';
import { renderAgentHeader, renderGitignoreArtifactComment } from '../operational-contract';
import { GENERATED_ESLINT_BANNER } from '../project';
import { applicationRemoval, CARRIER_DEPENDENCIES, isAliasWiring } from './application';
import type { RemovalApplication } from './facts';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-application-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content = ''): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

const BLUEPRINT: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    additionalAliases: { '@shared': './shared' },
    layers: [{ name: 'pages', does: 'routes' }],
  },
};

function application(
  provenance: ProvenanceRecord[],
  blueprint: Blueprint | null = BLUEPRINT,
): RemovalApplication {
  return { key: '.', root, blueprint, installed: null, manifest: null, provenance };
}

describe('isAliasWiring', () => {
  it.each([
    'tsconfig.json', 'apps/web/tsconfig.app.json', 'tsconfig.node-dev.json', 'jsconfig.json',
    'vite.config.js', 'vite.config.mts', 'vite.config.cjs',
  ])('treats %s as alias wiring', (file) => {
    expect(isAliasWiring(file)).toBe(true);
  });

  it.each([
    'mytsconfig.json', 'tsconfig.json.bak', 'tsconfig..json', '.gitignore', 'vite.config.jsx',
    'vite.config.xs',
  ])('does not treat %s as alias wiring', (file) => {
    expect(isAliasWiring(file)).toBe(false);
  });

  it('removes carrier dependencies but never the Blueprint package through them', () => {
    expect(CARRIER_DEPENDENCIES).toContain('eslint');
    expect(CARRIER_DEPENDENCIES).not.toContain('@kekkai/blueprint');
  });
});

describe('applicationRemoval · alias wiring still used by source', () => {
  const EDIT: ProvenanceRecord = {
    kind: 'edit', path: 'tsconfig.json', before: '', after: '"paths": {"~app/*": ["./src/*"]}',
  };

  it.each([
    ['import x from \'~app\';\n', '~app'],
    ['import x from \'~app/pages\';\n', '~app'],
    ['import x from \'@shared/util\';\n', '@shared'],
  ])('keeps recorded alias wiring when source says %s', (source, alias) => {
    write('tsconfig.json', `{${EDIT.after}}`);
    write('.gitignore', 'dist\n!docs\n');
    write('src/pages/Home.ts', source);

    expect(applicationRemoval(application([
      EDIT, { kind: 'edit', path: '.gitignore', before: '', after: '!docs\n' },
    ]), 'provenance')).toEqual({
      actions: [{ kind: 'write', path: '.gitignore', content: 'dist\n', reason: 'edit' }],
      conflicts: [],
      residues: [{ kind: 'required-by-source', path: 'tsconfig.json', alias }],
    });
  });

  it('reverses alias wiring that no import uses', () => {
    write('tsconfig.json', `{${EDIT.after}}`);
    write('src/pages/Home.ts', 'import x from \'~apple/x\';\nimport y from \'./~app\';\n');

    expect(applicationRemoval(application([EDIT]), 'provenance')).toEqual({
      actions: [{ kind: 'write', path: 'tsconfig.json', content: '{}', reason: 'edit' }],
      conflicts: [],
      residues: [],
    });
  });
});

describe('applicationRemoval · combining recorded and proven evidence', () => {
  function adopt(): ProvenanceRecord[] {
    const contract = `${renderAgentHeader()}\n`;

    write('blueprint.config.mjs', 'export default { changed: true };\n');
    write('CLAUDE.md', `<!-- BLUEPRINT:START -->\n${contract}<!-- BLUEPRINT:END -->\n`);
    write('eslint.config.mjs', `${GENERATED_ESLINT_BANNER}\nexport default [];\n`);
    write('.gitignore', `dist\n\n${renderGitignoreArtifactComment()}\n!docs/other.md\n`);
    write('tsconfig.json', '{"compilerOptions":{"paths":{"~app/*":["./src/*"]}}}');
    write('jsconfig.json', '{"compilerOptions":{"paths":{"~app/*":["./src/*"]}}}');
    write('package.json', '{"scripts":{"lint":"tsc && eslint src"}}');
    write('src/pages/.gitkeep');
    write('src/hooks/useCart.ts', 'export {};\n');

    return [
      { kind: 'created', path: 'blueprint.config.mjs', sha256: digest('export default {};\n') },
      { kind: 'generated', path: 'CLAUDE.md' },
      { kind: 'edit', path: '.gitignore', before: '', after: '!docs/handbook.md\n' },
      { kind: 'edit', path: 'tsconfig.json', before: '', after: '"baseUrl": "."' },
      { kind: 'dependency', name: 'eslint' },
    ];
  }

  it('lets records win duplicates, drops residues for files it deletes, and lists what older '
    + 'adoption may have left', () => {
    expect(applicationRemoval(application(adopt()), 'partial')).toEqual({
      actions: [
        { kind: 'delete', path: 'CLAUDE.md', reason: 'generated' },
        { kind: 'delete', path: 'blueprint.config.mjs', reason: 'config' },
        { kind: 'delete', path: 'eslint.config.mjs', reason: 'generated' },
      ],
      conflicts: [],
      residues: [
        { kind: 'unrecorded', path: 'jsconfig.json', detail: 'alias' },
        { kind: 'unrecorded', path: 'package.json', detail: 'lint-script' },
        { kind: 'unrecorded-folder', path: 'src/pages' },
      ],
    });
  });

  it('reports nothing unrecorded when records are complete', () => {
    expect(applicationRemoval(application(adopt()), 'provenance').residues).toEqual([]);
  });

  it('reads empty layer folders under the configured source root', () => {
    write('app/pages/.gitkeep');
    write('src/pages/.gitkeep');

    const blueprint: Blueprint = {
      ...BLUEPRINT,
      architecture: { ...BLUEPRINT.architecture, sourceRoot: 'app' },
    };

    expect(applicationRemoval(application([], blueprint), 'legacy').residues)
      .toEqual([{ kind: 'unrecorded-folder', path: 'app/pages' }]);
  });

  it('removes Blueprint\'s ignore group when no record claims that file', () => {
    write('.gitignore', `dist\n\n${renderGitignoreArtifactComment()}\n!docs/handbook.md\n`);
    write('tsconfig.json', '{"baseUrl":"."}');

    expect(applicationRemoval(application([
      { kind: 'edit', path: 'tsconfig.json', before: '', after: '"baseUrl":"."' },
    ]), 'provenance')).toEqual({
      actions: [
        { kind: 'write', path: 'tsconfig.json', content: '{}', reason: 'edit' },
        { kind: 'write', path: '.gitignore', content: 'dist\n', reason: 'gitignore' },
      ],
      conflicts: [],
      residues: [],
    });

    expect(applicationRemoval(application([
      { kind: 'created', path: '.gitignore', sha256: 'stale' },
    ]), 'provenance')).toEqual({
      actions: [{ kind: 'write', path: '.gitignore', content: 'dist\n', reason: 'gitignore' }],
      conflicts: [],
      residues: [{ kind: 'modified', path: '.gitignore' }],
    });
  });

  it('keeps a residue for a file it rewrites rather than deletes', () => {
    write('jsconfig.json', '{"strict":true,"paths":{}}');

    expect(applicationRemoval(application([
      { kind: 'created', path: 'jsconfig.json', sha256: digest('{}') },
      { kind: 'edit', path: 'jsconfig.json', before: '', after: ',"paths":{}' },
    ]), 'provenance')).toEqual({
      actions: [
        { kind: 'write', path: 'jsconfig.json', content: '{"strict":true}', reason: 'edit' },
      ],
      conflicts: [],
      residues: [{ kind: 'modified', path: 'jsconfig.json' }],
    });
  });

  it('keeps an unproven shared document it emptied and lists what the config cannot prove', () => {
    adopt();
    write('package.json', '{"name":"x"}');

    expect(applicationRemoval(application([], null), 'legacy').residues).toEqual([
      { kind: 'emptied', path: 'CLAUDE.md' },
      { kind: 'unrecorded-folder', path: 'src/pages' },
    ]);
  });
});

describe('applicationRemoval · shared documents named twice', () => {
  it('reports each broken or emptied document once, whether records or the config name it', () => {
    write('CLAUDE.md', '<!-- BLUEPRINT:START -->\npointer\n<!-- BLUEPRINT:END -->\n');
    write('AGENTS.md', '<!-- BLUEPRINT:START -->\nbroken\n');
    write('GEMINI.md', '<!-- BLUEPRINT:START -->\nbroken\n');

    expect(applicationRemoval(application([
      { kind: 'section', path: 'CLAUDE.md', created: false },
      { kind: 'section', path: 'AGENTS.md', created: false },
    ]), 'provenance')).toEqual({
      actions: [{ kind: 'write', path: 'CLAUDE.md', content: '', reason: 'section' }],
      conflicts: [
        { kind: 'malformed-section', path: 'AGENTS.md' },
        { kind: 'malformed-section', path: 'GEMINI.md' },
      ],
      residues: [{ kind: 'emptied', path: 'CLAUDE.md' }],
    });
  });
});
