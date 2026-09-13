import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Action } from '../bootstrap/types';
import { renderAuthoringHandoff } from './authoring';
import {
  renderAuthoringInstallSkipped,
  renderInstallSkipped,
} from './bootstrap-actions';
import type { OperationalText } from './operational-contract';
import { renderGitProbeFallback } from './runtime-messages';

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

  it('renders package-manager-specific install commands without deciding the manager', () => {
    expect(renderAuthoringInstallSkipped('npm install -D @kekkai/blueprint'))
      .toContain('npm install -D @kekkai/blueprint');

    expect(renderInstallSkipped('pnpm add -D @kekkai/blueprint'))
      .toContain('pnpm add -D @kekkai/blueprint');
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
