import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import type { ProjectState } from '../project';
import type { SurveyResult } from '../survey';
import { observeRepositoryTopology } from './repository-topology';

const roots: string[] = [];

const blueprint: Blueprint = {
  framework: 'react',
  architecture: { alias: '~app', layers: [{ name: 'pages', does: 'routes' }] },
};

function fixture(nextSrcDir: boolean) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-repository-topology-'));

  roots.push(root);
  fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), 'export default {};\n');

  return {
    root,
    state: { applicationRoot: root, repositoryRoot: root, nextSrcDir } as ProjectState,
  };
}

function survey(sourceRoot: string): SurveyResult {
  return { sourceRoot } as SurveyResult;
}

afterEach(() => {
  while (roots.length) {
    fs.rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

describe('observeRepositoryTopology', () => {
  it.each([
    { name: 'survey source', nextSrcDir: false, observedSurvey: survey('source'),
      selectedApplication: 'source' },
    { name: 'Next src directory', nextSrcDir: true, observedSurvey: null,
      selectedApplication: 'src' },
    { name: 'root source', nextSrcDir: false, observedSurvey: null,
      selectedApplication: '.' },
  ])('preserves pristine authority and selects the $name', async ({
    nextSrcDir, observedSurvey, selectedApplication,
  }) => {
    const target = fixture(nextSrcDir);

    const result = await observeRepositoryTopology({
      state: target.state,
      pristine: true,
      survey: observedSurvey,
      pristineBlueprint: blueprint,
    });

    expect(result.observation).toEqual({
      current: 'layer-first',
      repository: 'layer-first',
      source: 'configured',
      selectedApplication,
    });

    expect(result.blueprints).toHaveLength(1);
  });
});
