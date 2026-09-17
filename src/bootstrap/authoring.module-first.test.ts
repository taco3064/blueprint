import { describe, expect, it } from 'vitest';

import { authoringBrief, forcedAuthoringExit } from './authoring';
import { flattenProse } from '../conformance';
import type { SurveyResult } from '../survey';

const survey: SurveyResult = {
  framework: 'react',
  typescript: true,
  packageManager: 'npm',
  aliases: {},
  rootFiles: [],
  folders: [],
  repeatedFolderShapes: [],
  edges: [],
  selfAliasImports: {},
  testEvidence: [],
  ownableImports: [],
  packageUsage: [],
  unresolved: [],
  totalFiles: 0,
};

const claudeDir = { hadDir: false, otherCommands: 0 };

function moduleFirstBrief(totalFiles: number, next = false): string {
  return authoringBrief({ ...survey, totalFiles }, 'npm install -D @kekkai/blueprint', {
    claudeDir,
    topology: 'module-first',
    next,
  });
}

describe('authoringBrief · module-first method', () => {
  it('derives modules semantically without layer-first operative guidance', () => {
    const brief = moduleFirstBrief(0, true);

    expect({
      selected: brief.includes('module-first was selected'),
      vocabulary: brief.includes('**Never derive a module from vocabulary.**'),
      projection: brief.includes('temporary layer-first model, for reasoning only'),
      innerLayers: brief.includes('technical layers that repeat inside ordinary modules'),
      nextRouter: brief.includes('reserved router composition at the container position'),
      appModule: brief.includes('{ name: \'app\', does: \'router composition\', dependsOn:'),
      appContainer: brief
        .includes('governed recursively without repeating the shared inner layers'),
      does: brief.includes('with a precise `does`'),
      edges: brief.includes('Derive direct `dependsOn` edges from the real cross-module'),
      report: brief.includes('module + inner-layer structure'),
      global: brief.includes('Never mix that model with global layers'),
    }).toEqual({
      selected: true,
      vocabulary: true,
      projection: true,
      innerLayers: true,
      nextRouter: true,
      appModule: true,
      appContainer: true,
      does: true,
      edges: true,
      report: true,
      global: true,
    });
  });

  it.each([
    'ordinary top-level folders below `sourceRoot` as module',
    'this application is proven-empty',
    'The complete early-exit checklist',
    'Top-level folders under `src/` are candidates for layers',
    'preset\'s declared-but-empty layers',
    'Optional module-first topology',
    'intentionally absent from `modules`',
    'A short report: the layer table',
  ])('never says %s for Next.js module-first authoring', (claim) => {
    expect(moduleFirstBrief(0, true)).not.toContain(claim);
  });

  it('sends a forced proven-empty React/Vue brief to the canonical runway', () => {
    const empty = flattenProse(moduleFirstBrief(0));
    const existing = flattenProse(moduleFirstBrief(3));

    expect({
      emptyExit: empty.includes('this application is proven-empty'),
      emptyCommand: empty.includes('`npx blueprint init --topology module-first` without '
        + '`--authoring`'),
      emptyRunway: empty.includes('with `modules: []`: the preset\'s complete governance and no '
        + 'invented domain module'),
      existingExit: existing.includes('this application is proven-empty'),
      existingMethod: existing.includes('module-first was selected'),
    }).toEqual({
      emptyExit: true,
      emptyCommand: true,
      emptyRunway: true,
      existingExit: false,
      existingMethod: true,
    });
  });
});

describe('forcedAuthoringExit', () => {
  it.each([
    { name: 'unforced', authoring: false, topology: 'layer-first', files: 0, expected: null },
    { name: 'scope-bound', topology: 'module-first', files: 0, scope: true, expected: null },
    { name: 'small layer-first', topology: 'layer-first', files: 9, expected: 'threshold' },
    { name: 'large layer-first', topology: 'layer-first', files: 10, expected: null },
    { name: 'empty module-first', topology: 'module-first', files: 0, expected: 'runway' },
    { name: 'non-empty module-first', topology: 'module-first', files: 1, expected: null },
    { name: 'empty Next', topology: 'module-first', files: 0, next: true, expected: null },
  ] as const)('classifies a $name forced run', (row) => {
    const facts = {
      authoring: 'authoring' in row ? row.authoring : true,
      topology: row.topology,
      next: 'next' in row,
    };

    const measured = { ...survey, totalFiles: row.files, scopeRequired: 'scope' in row };

    expect(forcedAuthoringExit(measured, facts)).toBe(row.expected);
  });
});
