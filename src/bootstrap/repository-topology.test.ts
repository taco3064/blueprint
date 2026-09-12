import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import type { ProjectState } from '../project';
import type { SurveyResult } from '../survey';
import { observeRepositoryTopology, resolveRepositoryTopology } from './repository-topology';

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

  it('renders repository-relative POSIX paths when mixed topology includes the root', async () => {
    const target = fixture(false);
    const application = path.join(target.root, 'apps', 'web');

    fs.mkdirSync(application, { recursive: true });
    fs.writeFileSync(path.join(application, 'blueprint.config.mjs'), 'export default {};\n');

    await expect(resolveRepositoryTopology({
      repositoryRoot: target.root,
      applicationRoot: target.root,
      loadConfig: async (file) => path.dirname(file) === target.root
        ? blueprint
        : {
            ...blueprint,
            architecture: {
              ...blueprint.architecture,
              modules: [{ name: 'auth', does: 'authentication' }],
            },
          },
    })).rejects.toThrow(/found:\n {2}apps\/web: module-first\n {2}\.: layer-first/);
  });

  it('normalizes a raw 3.2 sibling as repository layer-first authority', async () => {
    const target = fixture(false);
    const sibling = path.join(target.root, 'apps', 'admin');

    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, 'blueprint.config.mjs'), 'export default {};\n');

    const legacy = {
      framework: 'react',
      architecture: {
        alias: '~app',
        module: { layout: 'folder' },
        layers: [{ name: 'pages', does: 'routes' }],
      },
    } as Blueprint;

    const result = await resolveRepositoryTopology({
      repositoryRoot: target.root,
      applicationRoot: target.root,
      localBlueprint: blueprint,
      loadConfig: async () => legacy,
    });

    expect(result.topology).toBe('layer-first');
    expect(result.blueprints).toHaveLength(2);
    expect(result.blueprints[0].architecture).not.toHaveProperty('module');
  });
});
