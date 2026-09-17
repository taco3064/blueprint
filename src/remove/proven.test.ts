import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { renderGitignoreArtifactComment } from '../operational-contract';
import { GENERATED_ESLINT_BANNER } from '../project';
import { provenRemoval } from './proven';
import { HANDBOOK_MARK } from './signatures';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remove-proven-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content = 'x\n'): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

const SECTION = '<!-- BLUEPRINT:START -->\npointer\n<!-- BLUEPRINT:END -->\n';
const HASH = 'a'.repeat(64);

const BLUEPRINT: Blueprint = {
  framework: 'react',
  architecture: { alias: '~app', layers: [{ name: 'pages', does: 'routes' }] },
  emit: {
    handbook: 'docs/handbook.md',
    agents: [
      { target: 'claude', path: 'docs/NOTES.md' },
      { target: 'cursor', path: '.cursor/custom.mdc' },
    ],
  },
};

describe('provenRemoval', () => {
  it('removes every name- or content-proven artifact and nothing that only resembles one', () => {
    for (const file of [
      'blueprint.config.mjs', '.blueprint-baseline.json', 'blueprint-authoring.md',
      '.claude/commands/blueprint-author.md', 'blueprint-transformation.json',
      'eslint.config.blueprint.mjs', 'AGENTS.blueprint.md', 'docs/NOTES.blueprint.md',
      `blueprint.config.mjs.pre-v4-${HASH}`, `old.blueprint.config.mjs.pre-v4-${HASH}`,
      `blueprint.config.mjs.pre-v4-${HASH}.bak`, '.cursor/rules/blueprint.mdc',
      '.cursor/rules/blueprint.blueprint.mdc', '.windsurf/rules/blueprint.md',
    ]) {
      write(file);
    }

    write('docs/handbook.md', `# Handbook\n\n${HANDBOOK_MARK}\n`);
    write('docs/architecture-handbook.md', `# Handbook\n\n${HANDBOOK_MARK}\n`);
    write('eslint.config.mjs', `${GENERATED_ESLINT_BANNER}\nexport default [];\n`);
    write('eslint.config.js', `export default []; ${GENERATED_ESLINT_BANNER}\n`);
    write('CLAUDE.md', `# Mine\n\n${SECTION}`);
    write('docs/NOTES.md', SECTION);
    write('GEMINI.md', '<!-- BLUEPRINT:END -->\n');
    write('.cursor/custom.mdc', `# rules\n${SECTION}`);
    write('.gitignore', `dist\n\n${renderGitignoreArtifactComment()}\n!docs/handbook.md\n`);

    expect(provenRemoval({
      root, prefix: 'apps/web', blueprint: BLUEPRINT, recordedIgnoreEdit: false,
    })).toEqual({
      actions: [
        { kind: 'delete', path: 'apps/web/blueprint.config.mjs', reason: 'config' },
        { kind: 'delete', path: 'apps/web/.blueprint-baseline.json', reason: 'baseline' },
        { kind: 'delete', path: 'apps/web/blueprint-authoring.md', reason: 'workflow' },
        {
          kind: 'delete', path: 'apps/web/.claude/commands/blueprint-author.md', reason: 'workflow',
        },
        { kind: 'delete', path: 'apps/web/blueprint-transformation.json', reason: 'workflow' },
        { kind: 'delete', path: 'apps/web/eslint.config.blueprint.mjs', reason: 'reference' },
        { kind: 'delete', path: 'apps/web/AGENTS.blueprint.md', reason: 'reference' },
        { kind: 'delete', path: 'apps/web/docs/NOTES.blueprint.md', reason: 'reference' },
        { kind: 'delete', path: `apps/web/blueprint.config.mjs.pre-v4-${HASH}`, reason: 'backup' },
        { kind: 'delete', path: 'apps/web/.cursor/rules/blueprint.mdc', reason: 'generated' },
        { kind: 'delete', path: 'apps/web/.windsurf/rules/blueprint.md', reason: 'generated' },
        { kind: 'delete', path: 'apps/web/docs/handbook.md', reason: 'generated' },
        { kind: 'delete', path: 'apps/web/eslint.config.mjs', reason: 'generated' },
        { kind: 'write', path: 'apps/web/CLAUDE.md', content: '# Mine\n', reason: 'section' },
        { kind: 'delete', path: 'apps/web/docs/NOTES.md', reason: 'section' },
        {
          kind: 'write', path: 'apps/web/.gitignore', content: 'dist\n', reason: 'gitignore',
        },
      ],
      conflicts: [{ kind: 'malformed-section', path: 'apps/web/GEMINI.md' }],
    });
  });

  it('leaves a recorded ignore edit and unsigned outputs to their own evidence', () => {
    write('.gitignore', `dist\n\n${renderGitignoreArtifactComment()}\n!docs/handbook.md\n`);
    write('docs/architecture-handbook.md', '# Written by hand\n');

    expect(provenRemoval({ root, prefix: '', blueprint: null, recordedIgnoreEdit: true }))
      .toEqual({ actions: [], conflicts: [] });
  });
});
