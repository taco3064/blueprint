import fs from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { emitLint } from '../emit/lint';
import type { LayerToModuleObligation } from '../project';
import { collectModuleToLayerEvidence, runSurvey } from '../survey';
import { cli, configSource, makeRepo, rm, write } from './conformance';

const dirs: string[] = [];

const layer = {
  name: 'containers', does: 'composition', layout: 'folder' as const, entry: 'Screen',
};

const source = {
  'src/containers/Account/Screen.js':
    'export { logic as Account } from "./logic"; export { Baby } from "../Baby";',
  'src/containers/Account/logic.js': 'export const logic = 1;',
  'src/containers/Baby/Screen.js': 'export const Baby = 2;',
};

const forward = [
  ['src/containers/Account/Screen.js', 'src/babyoasis/index.js'],
  ['src/containers/Account/logic.js', 'src/babyoasis/logic.js'],
  ['src/containers/Baby/Screen.js', 'src/babyoasis/Baby.js'],
];

function retainedOrigin(): LayerToModuleObligation {
  return {
    version: 1, direction: 'layer-first-to-module-first',
    origin: {
      head: 'abc', topology: 'layer-first', applicationRoot: '.', selectedScope: 'src',
      sourceRoot: 'src', framework: 'react', router: null,
      layers: [{ name: 'pages', does: 'routing' }, layer],
      sources: ['Account', 'Baby'].map((unit) => ({
        role: 'container-seed', unit: `containers/${unit}`,
        members: Object.keys(source).filter((file) => file.startsWith(`src/containers/${unit}/`)),
      })),
    },
    target: {
      topology: 'module-first',
      decisions: ['Account', 'Baby'].map((unit) => {
        const members = forward.filter(([file]) => file.startsWith(`src/containers/${unit}/`))
          .map(([source, destination]) => ({ source, destination }));

        return { source: `containers/${unit}`, members,
          destinations: members.map((member) => member.destination) };
      }),
    },
  };
}

async function lint(dir: string, blueprint: Blueprint): Promise<string[]> {
  const eslint = new ESLint({
    cwd: dir, overrideConfigFile: true, overrideConfig: emitLint(blueprint),
  });

  return (await eslint.lintFiles(['src/**/*.js']))
    .flatMap((result) => result.messages.map((message) => `${message.ruleId}: ${message.message}`));
}

function restoreMembers(
  dir: string, evidence: ReturnType<typeof collectModuleToLayerEvidence>,
): void {
  for (const mapping of evidence.mappings) {
    const target = mapping.destination!;
    const content = fs.readFileSync(path.join(dir, mapping.source), 'utf8');

    write(dir, target, content.replace('./Baby', '../Baby'));
    fs.rmSync(path.join(dir, mapping.source));

    expect(fs.readFileSync(path.join(dir, target), 'utf8'))
      .toBe(source[target as keyof typeof source]);
  }

  fs.rmSync(path.join(dir, 'src/babyoasis'), { recursive: true });
  write(dir, 'src/main.js', 'export { Account, Baby } from "~app/containers/Account";');
}

async function verifyRestored(dir: string, lf: Blueprint): Promise<void> {
  write(dir, 'blueprint.config.mjs', configSource(lf));
  write(dir, 'src/pages/Route.js', 'export { Account } from "~app/containers/Account";');
  expect(await lint(dir, lf)).toEqual([]);
  const inspected = await cli(dir, ['inspect', '--json']);

  expect(inspected.code, inspected.output).toBe(0);
  write(dir, 'src/pages/Route.js', 'export { Account } from "~app/containers/Account/logic";');
  expect(await lint(dir, lf)).not.toEqual([]);
  const rejected = await cli(dir, ['inspect', '--json']);

  expect(rejected.code, rejected.output).toBe(1);
  expect(rejected.output).toContain('deep-import');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rm(dir);
  }
});

describe('retained LF root units round trip', () => {
  it('restores custom entries, merged units and external import surfaces', async () => {
    const mf: Blueprint = {
      name: 'restoration', framework: 'react', architecture: {
        alias: '~app', modules: [{ name: 'babyoasis', does: 'composition' }],
        layers: [{ name: 'services', does: 'data' }],
      },
    };

    const dir = makeRepo({ files: {
      ...Object.fromEntries(forward.map(([from, to]) => [to, source[from as keyof typeof source]
        .replace('../Baby', './Baby')])),
      'src/main.js': 'export { Account, Baby } from "~app/babyoasis";',
      'blueprint.config.mjs': configSource(mf),
    } });

    dirs.push(dir);
    expect(await lint(dir, mf)).toEqual([]);

    const evidence = collectModuleToLayerEvidence({
      root: dir, survey: runSurvey(dir, { sourceRoot: 'src', log: () => {} }),
      architecture: mf.architecture!, nextAppRouter: false, origin: retainedOrigin(),
    });

    expect(evidence.mappings.map((entry) => entry.source).sort())
      .toEqual(forward.map(([, destination]) => destination).sort());

    expect(evidence.mappings.map((entry) => entry.destination).sort())
      .toEqual(Object.keys(source).sort());

    expect(evidence.mappings.map((entry) => entry.restoration))
      .toEqual(Array(3).fill('restored-from-origin'));

    expect(evidence.collisions).toEqual([]);

    restoreMembers(dir, evidence);

    const lf: Blueprint = {
      name: 'restoration', framework: 'react', architecture: evidence.architectureBasis,
    };

    await verifyRestored(dir, lf);
  });
});
