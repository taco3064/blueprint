import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { reactPreset, vuePreset } from '../presets';
import { collectModuleToLayerEvidence, collectTransformationEvidence, runSurvey } from '../survey';
import { emitHandbook } from '../emit/docs';
import { layerToModuleBrief } from './transformation-playbook';
import { moduleToLayerBrief } from './module-to-layer-playbook';

const roots: string[] = [];

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-root-guidance-'));

  roots.push(root);
  fs.mkdirSync(path.join(root, 'src/shop'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/shop/index.ts'), 'export const shop = 1;');

  return root;
}

const custom = (name: string, does: string): Blueprint => ({
  framework: 'react', architecture: {
    alias: '~app', modules: [{ name: 'shop', does: 'commerce' }], layers: [{ name, does }],
  },
});

const configurations = [
  ['react preset', reactPreset({ modules: [{ name: 'shop', does: 'commerce' }] })],
  ['vue preset', vuePreset({ modules: [{ name: 'shop', does: 'commerce' }] })],
  ['custom views', custom('views', 'Renders presentation from view models')],
  ['custom unclear', custom('helpers', 'Application helpers')],
  ['custom name-only', custom('components', 'Application work')],
] as const;

function briefs(root: string, blueprint: Blueprint): string[] {
  const survey = runSurvey(root, { sourceRoot: 'src', log: () => {} });

  const facts = {
    findings: [], install: 'npm install', cleanup: 'the playbook',
    preflight: {
      ok: true, repository: { ok: true }, worktree: { ok: true },
      head: { ok: true }, scope: { ok: true }, inspection: { ok: true },
    },
    state: { framework: blueprint.framework, hasNext: false, nextRouter: null },
  };

  const layerArchitecture = { ...blueprint.architecture };

  delete layerArchitecture.modules;

  return [
    layerToModuleBrief({
      ...facts, evidence: collectTransformationEvidence(root, survey, layerArchitecture),
    }),
    moduleToLayerBrief({
      ...facts, evidence: collectModuleToLayerEvidence({
        root, survey, architecture: blueprint.architecture, nextAppRouter: false,
      }),
    }),
  ];
}

describe('config to transformation guidance authority', () => {
  it.each(configurations)('keeps both directions owner-reviewed: %s', (_name, blueprint) => {
    const root = fixture();
    const before = JSON.stringify(blueprint);

    for (const text of briefs(root, blueprint)) {
      expect(text).toContain('Only unchanged canonical React/Vue preset guidance '
        + 'recommends `components`');

      expect(text).toContain('Every custom architecture requires owner decision');

      expect(text).toContain('unique `views.does` presentation prose. No runtime-selected '
        + 'owner exists');

      expect(text).toContain('do not add a layer, edit responsibilities, or guess a '
        + 'custom destination');
    }

    expect(JSON.stringify(blueprint)).toBe(before);
    expect(fs.existsSync(path.join(root, 'src/shop/components'))).toBe(false);

    expect(fs.readFileSync(path.join(root, 'src/shop/index.ts'), 'utf8'))
      .toBe('export const shop = 1;');
  });

  it('renders the root-unit contract only for module-first handbooks', () => {
    const blueprint = reactPreset({ modules: [{ name: 'shop', does: 'commerce' }] });
    const text = emitHandbook(blueprint);

    expect(text).toContain('Exactly one supported `index.*` is its external entry');
    expect(text).toContain('direct siblings are private members');
    expect(text).toContain('bare module alias, never `/index` or a member path');
    expect(text).toContain('A layer-only module needs no root entry or empty barrel');
    expect(text).toContain('reserved recursive `app` tree is exempt');
    expect(emitHandbook(reactPreset())).not.toContain('Exactly one supported `index.*`');
  });
});
