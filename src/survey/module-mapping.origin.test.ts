import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ArchitectureDef } from '../config';
import { isTransformationObligation } from '../project';
import type { LayerToModuleObligation } from '../project';
import { collectModuleToLayerEvidence } from './module-mapping';
import { runSurvey } from './survey';

const dirs: string[] = [];

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-origin-'));

  dirs.push(root);

  for (const [file, content] of Object.entries({
    'src/auth/AuthRoot.ts': 'export const root = 1;\n',
    'src/auth/hooks/useSession.ts': 'export const session = 1;\n',
    'src/checkout/hooks/useSession.ts': 'export const checkout = 1;\n',
  })) {
    const target = path.join(root, file);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  return root;
}

const architecture: ArchitectureDef = {
  alias: '~app',
  modules: [
    { name: 'auth', does: 'authentication' },
    { name: 'checkout', does: 'checkout' },
  ],
  layers: [
    { name: 'components', does: 'UI', layout: 'folder' },
    { name: 'hooks', does: 'state', layout: 'file' },
  ],
};

const obligation: LayerToModuleObligation = {
  version: 1,
  direction: 'layer-first-to-module-first',
  origin: {
    head: 'abc123',
    topology: 'layer-first',
    applicationRoot: '.',
    selectedScope: 'src',
    sourceRoot: 'src',
    framework: 'react',
    router: null,
    layers: [{ name: 'containers', does: 'screens', mustNot: ['hold routing'] }],
    sources: [{
      role: 'container-seed',
      unit: 'containers/AuthScreen',
      members: ['src/containers/AuthScreen/AuthRoot.ts'],
    }],
  },
  target: {
    topology: 'module-first',
    decisions: [{
      source: 'containers/AuthScreen',
      destinations: ['src/auth/AuthRoot.ts'],
      members: [{
        source: 'src/containers/AuthScreen/AuthRoot.ts',
        destination: 'src/auth/AuthRoot.ts',
      }],
    }],
  },
};

function destinationFor(origin?: LayerToModuleObligation): string | undefined {
  const root = fixture();

  if (origin) {
    expect(isTransformationObligation(origin)).toBe(true);
  }

  return collectModuleToLayerEvidence({
    root,
    survey: runSurvey(root, { sourceRoot: 'src', log: () => {} }),
    architecture,
    nextAppRouter: false,
    origin,
  }).mappings.find((mapping) => mapping.source === 'src/auth/AuthRoot.ts')?.destination;
}

afterEach(() => {
  while (dirs.length) {
    fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

describe('module-first to layer-first mapping · recorded origin', () => {
  it('closes the round trip on the recorded identity', () => {
    expect(destinationFor(obligation)).toBe('src/containers/AuthScreen/AuthRoot.ts');
  });

  it('restores the recorded layer policy over the current module-first config', () => {
    const root = fixture();

    expect(collectModuleToLayerEvidence({
      root,
      survey: runSurvey(root, { sourceRoot: 'src', log: () => {} }),
      architecture,
      nextAppRouter: false,
      origin: obligation,
    }).architectureBasis.layers)
      .toEqual([{ name: 'containers', does: 'screens', mustNot: ['hold routing'] }]);
  });

  it('falls back to the deterministic destination without a recorded origin', () => {
    expect(destinationFor()).toBe('src/containers/auth/AuthRoot.ts');
  });

  it('leaves a split decision to the deterministic fallback', () => {
    expect(destinationFor({
      ...obligation,
      origin: {
        ...obligation.origin,
        sources: [{
          role: 'container-seed',
          unit: 'containers/AuthScreen',
          members: [
            'src/containers/AuthScreen/AuthRoot.ts',
            'src/containers/AuthScreen/useSession.ts',
          ],
        }],
      },
      target: {
        ...obligation.target,
        decisions: [{
          source: 'containers/AuthScreen',
          destinations: ['src/auth/AuthRoot.ts', 'src/checkout/hooks/useSession.ts'],
          members: [
            {
              source: 'src/containers/AuthScreen/AuthRoot.ts',
              destination: 'src/auth/AuthRoot.ts',
            },
            {
              source: 'src/containers/AuthScreen/useSession.ts',
              destination: 'src/checkout/hooks/useSession.ts',
            },
          ],
        }],
      },
    })).toBe('src/containers/auth/AuthRoot.ts');
  });

  it('treats an explicit merge as superseding both original identities', () => {
    expect(destinationFor({
      ...obligation,
      origin: {
        ...obligation.origin,
        sources: [
          {
            role: 'container-seed',
            unit: 'containers/AuthScreen',
            members: ['src/containers/AuthScreen/AuthRoot.ts'],
          },
          {
            role: 'container-seed',
            unit: 'containers/SessionScreen',
            members: ['src/containers/SessionScreen/useSession.ts'],
          },
        ],
      },
      target: {
        ...obligation.target,
        decisions: [
          {
            source: 'containers/AuthScreen',
            destinations: ['src/auth/AuthRoot.ts'],
            members: [{
              source: 'src/containers/AuthScreen/AuthRoot.ts',
              destination: 'src/auth/AuthRoot.ts',
            }],
          },
          {
            source: 'containers/SessionScreen',
            destinations: ['src/auth/hooks/useSession.ts'],
            members: [{
              source: 'src/containers/SessionScreen/useSession.ts',
              destination: 'src/auth/hooks/useSession.ts',
            }],
          },
        ],
      },
    })).toBe('src/containers/auth/AuthRoot.ts');
  });
});
