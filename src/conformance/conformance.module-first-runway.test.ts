import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runInit } from '../bootstrap';
import { makeRepo, read, rm } from './conformance';

const dirs: string[] = [];

function repo(framework: 'react' | 'vue'): string {
  const dir = makeRepo({
    packageJson: {
      name: `${framework}-runway`,
      dependencies: framework === 'react' ? { react: '^19' } : { vue: '^3' },
    },
  });

  dirs.push(dir);

  return dir;
}

function expectNoInventedFolders(dir: string): void {
  for (const folder of ['components', 'hooks', 'contexts', 'services']) {
    expect(fs.existsSync(path.join(dir, 'src', folder))).toBe(false);
  }
}

function expectGrowthGuidance(outputs: Array<string | null>): void {
  for (const output of outputs) {
    expect(output).toContain('architecture.modules: []');
    expect(output).toContain('container/use-case responsibilities');
    expect(output).toContain('never create a generic `shared` catch-all');
    expect(output).toContain('Set `dependsOn` from real cross-module imports');
  }
}

async function expectGreenfieldRunway(framework: 'react' | 'vue'): Promise<void> {
  const dir = repo(framework);

  const actions = await runInit(dir, {
    topology: 'module-first',
    install: false,
    log: () => {},
  });

  const config = read(dir, 'blueprint.config.mjs');
  const handbook = read(dir, 'docs/architecture-handbook.md');
  const agents = read(dir, 'AGENTS.md');
  const claude = read(dir, 'CLAUDE.md');

  expect(config).toContain(`${framework}Preset`);
  expect(config).toContain('topology: \'module-first\'');

  expect(actions.some((action) => action.kind === 'write'
    && action.path === 'blueprint-authoring.md')).toBe(false);

  expectNoInventedFolders(dir);
  expectGrowthGuidance([handbook, agents, claude]);

  expect(handbook).toContain('Module-first runway · no domain modules declared');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rm(dir);
  }
});

describe('greenfield module-first runway conformance', () => {
  it.each(['react', 'vue'] as const)(
    'initializes an empty %s repo without inventing domains or inner-layer folders',
    expectGreenfieldRunway,
  );
});
