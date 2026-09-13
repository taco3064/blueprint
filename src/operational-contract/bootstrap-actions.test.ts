import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Action } from '../bootstrap/types';
import { renderAuthoringHandoff } from './authoring';
import {
  renderAuthoringLauncherNote,
  renderAuthoringInstallSkipped,
  renderEslintConfigNote,
  renderInstallNote,
  renderInstallSkipped,
  renderLintScriptNote,
  renderOptionalToolingNote,
  renderTemplateCleanupNote,
} from './bootstrap-actions';
import type { OperationalText } from './operational-contract';
import { renderGitProbeFallback, renderInitBanner } from './runtime-messages';
import {
  renderTransformationInstallNote,
  renderTransformationReady,
  renderTransformationWriteNote,
} from './transformation';

describe('bootstrap operational text construction', () => {
  it('keeps arbitrary strings outside Action.note', () => {
    expectTypeOf<string>().not.toMatchTypeOf<OperationalText>();
    expectTypeOf<Action['note']>().toEqualTypeOf<OperationalText>();
  });

  it('requires every production bootstrap note property to call a renderer', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bootstrap');

    const files = fs.readdirSync(root)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));

    const notes: string[] = [];
    const bypasses: string[] = [];

    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(path.join(root, file), 'utf-8'),
        ts.ScriptTarget.Latest,
        true,
      );

      const visit = (node: ts.Node): void => {
        if (
          ts.isPropertyAssignment(node)
          && node.name.getText(source) === 'note'
        ) {
          notes.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);

          if (
            !ts.isCallExpression(node.initializer)
            || !ts.isIdentifier(node.initializer.expression)
            || !node.initializer.expression.text.startsWith('render')
          ) {
            bypasses.push(notes.at(-1)!);
          }
        }

        ts.forEachChild(node, visit);
      };

      ts.forEachChild(source, visit);
    }

    expect(notes.length).toBeGreaterThan(0);
    expect(bypasses).toEqual([]);
  });
});

describe('bootstrap operational text follows supplied facts', () => {
  it('keeps Git probe fallback causes distinct', () => {
    expect(renderGitProbeFallback('worktree-status')).toContain('status could not be read');
    expect(renderGitProbeFallback('recoverable-head')).toContain('recoverable HEAD');
  });

  it('renders applied and dry-run init banners exactly', () => {
    expect(renderInitBanner(false, 'vue', 'pnpm')).toBe('blueprint init · vue · pnpm');

    expect(renderInitBanner(true, 'react', 'npm'))
      .toBe('blueprint init --dry-run · react · npm');
  });

  it('renders package-manager-specific install commands without deciding the manager', () => {
    expect(renderAuthoringInstallSkipped('npm install -D @kekkai/blueprint'))
      .toContain('npm install -D @kekkai/blueprint');

    expect(renderInstallSkipped('pnpm add -D @kekkai/blueprint'))
      .toContain('pnpm add -D @kekkai/blueprint');
  });

  it('keeps action-note variants distinct at the operational boundary', () => {
    expect(renderInstallNote()).toBe('@kekkai/blueprint (the config imports it)');

    expect(renderAuthoringLauncherNote('.claude/commands/blueprint-author.md'))
      .toBe('.claude/commands/blueprint-author.md (/blueprint-author)');

    const deadCode = renderOptionalToolingNote('dead-code');

    expect(deadCode).toContain('knip');
    expect(deadCode).toContain('source of truth for dead files and exports');
    expect(deadCode).not.toContain('`blueprint inspect` reports dead files');

    expect(renderOptionalToolingNote('css-tokens')).toContain('CSS token governance (optional)');

    expect(renderEslintConfigNote('owned', 'eslint.config.mjs'))
      .toBe('eslint.config.mjs (blueprint-owned — regenerated)');

    expect(renderEslintConfigNote('reference', 'eslint.config.blueprint.mjs'))
      .toBe('eslint.config.blueprint.mjs (reference — not wired in)');

    expect(renderEslintConfigNote('new', 'eslint.config.mjs')).toBe('eslint.config.mjs');
  });

  it('renders cleanup totals and both lint-script mutations from supplied facts', () => {
    expect(renderTemplateCleanupNote(['  first', '  second'], 3))
      .toContain('(5 finding(s))');

    expect(renderLintScriptNote('patched'))
      .toBe('package.json (lint script now also runs eslint — so lint runs the generated rules)');

    expect(renderLintScriptNote('added', 'src'))
      .toBe('package.json (added "lint": "eslint src" — so lint runs the generated rules)');
  });

  it('keeps transformation action notes and directions distinct', () => {
    expect(renderTransformationInstallNote())
      .toBe('@kekkai/blueprint (the config imports it)');

    expect(renderTransformationWriteNote('layer-to-module', 'blueprint-authoring.md'))
      .toContain('layer-first → module-first transformation evidence + playbook');

    expect(renderTransformationWriteNote('module-to-layer', 'blueprint-authoring.md'))
      .toContain('module-first → layer-first mapping evidence + playbook');

    expect(renderTransformationWriteNote('repository', 'blueprint-authoring.md'))
      .toContain('repository-wide topology transformation playbook');

    expect(renderTransformationReady('layer-to-module'))
      .toContain('Layer-first → module-first transformation preflight passed.');

    expect(renderTransformationReady('module-to-layer'))
      .toContain('Module-first → layer-first transformation preflight passed.');
  });

  it('contrasts topology and Claude launcher facts', () => {
    const base = {
      scopeRequired: false,
      agentPrompt: 'Read blueprint-authoring.md.',
      authoringFile: 'blueprint-authoring.md',
    };

    const layer = renderAuthoringHandoff({
      ...base,
      topology: 'layer-first',
      claudeLauncher: true,
    });

    const module = renderAuthoringHandoff({
      ...base,
      topology: 'module-first',
      claudeLauncher: false,
    });

    expect(layer).toContain('--topology layer-first');
    expect(layer).toContain('/blueprint-author inside Claude Code');
    expect(module).toContain('selected module-first topology');
    expect(module).not.toContain('/blueprint-author inside Claude Code');
  });
});
