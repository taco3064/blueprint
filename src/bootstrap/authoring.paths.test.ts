import { describe, expect, it } from 'vitest';

import type { SurveyResult } from '../survey';
import { authoringActions, authoringBrief } from './authoring';

const survey: SurveyResult = {
  framework: 'react',
  typescript: true,
  packageManager: 'npm',
  sourceRoot: 'apps/web/source',
  aliases: {},
  rootFiles: [],
  folders: [],
  edges: [],
  selfAliasImports: {},
  testEvidence: [],
  ownableImports: [],
  packageUsage: [],
  unresolved: [],
  totalFiles: 12,
};

const options = {
  packageManager: 'pnpm' as const,
  needsInstall: false,
  claudeDir: { hadDir: false, otherCommands: 0 },
  viteTs: null,
  tscOut: null,
};

describe('authoring source-root facts', () => {
  it('carries the measured path into a scoped handoff', () => {
    const actions = authoringActions(
      { ...survey, scopeRequired: true, totalFiles: 0 },
      options,
    );

    const instruction = actions.find((action) => action.kind === 'instruct')?.note ?? '';

    const playbook = authoringBrief(
      { ...survey, scopeRequired: true, totalFiles: 0 },
      'pnpm add -D @kekkai/blueprint',
      options,
    );

    expect(instruction).toContain('--source-root <application-source-root>');
    expect(instruction).not.toContain('<application>/src');
    expect(playbook).toContain('--source-root <application-source-root>');
    expect(playbook).not.toContain('<application>/src');
  });

  it('authors layer-first schema paths from the measured source root', () => {
    const playbook = authoringBrief(survey, 'npm install -D @kekkai/blueprint', options);

    expect(playbook).toContain('sourceRoot: \'apps/web/source\'');
    expect(playbook).toContain('\'~shared\': \'./apps/web/source/shared\'');
  });

  it('uses module-first layerFiles defaults without inventing an extension set', () => {
    const playbook = authoringBrief(survey, 'npm install -D @kekkai/blueprint', {
      ...options,
      topology: 'module-first',
    });

    expect(playbook).toContain('sourceRoot: \'apps/web/source\'');
    expect(playbook).toContain('`layerFiles` is optional');
    expect(playbook).not.toContain('layerFiles: \'src/');
    expect(playbook).not.toContain('{ts,tsx,vue}');
  });

  it('distinguishes writing the baseline from validating it', () => {
    const playbook = authoringBrief(survey, 'npm install -D @kekkai/blueprint', options);

    expect(playbook).toContain('ledger written by the earlier `--update-baseline` step');
    expect(playbook).toContain('it never writes one');
  });
});
