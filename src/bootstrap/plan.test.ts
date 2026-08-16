import { describe, expect, it } from 'vitest';

import { plan } from './plan';
import { vuePreset } from '../presets';
import type { Blueprint } from '../config';
import type { Action } from './types';
import { SUPPORTED_ESLINT_MAJORS } from '../project';
import type { ProjectState } from '../project';

function state(over: Partial<ProjectState> = {}): ProjectState {
  return {
    root: '/x',
    framework: 'vue',
    packageManager: 'npm',
    projectName: 'app',
    hasConfig: false,
    hasEslintConfig: false,
    wiredEslintConfig: false,
    hasNext: false,
    hasNuxt: false,
    nextRouter: null,
    nextSrcDir: false,
    hasViteConfig: false,
    hasTypescript: false,
    tsconfigs: { 'tsconfig.json': null, 'tsconfig.app.json': null, 'jsconfig.json': null },
    existingSrcDirs: [],
    missingDeps: ['eslint', '@kekkai/blueprint'],
    dependencies: [],
    ...over,
  };
}

const bp = vuePreset();

type WriteAction = Extract<Action, { kind: 'write' }>;

const write = (actions: Action[], path: string): WriteAction | undefined =>
  actions.find(
    (action): action is WriteAction => action.kind === 'write' && action.path === path,
  );

describe('plan', () => {
  it('puts every filesystem effect above the install, on every path', () => {
    // The install is the only action here that can hang for minutes or fail on a
    // network the adopter does not have, and the alias writes used to sit below it.
    // #37 stopped the output CLAIMING them; the state stayed half-done, and a codex
    // run aborted a registry-less install and was left with a config, a contract and
    // an eslint config but no alias in tsconfig or vite — `~app resolves nowhere`,
    // two toolchain files hand-edited (field run #131). Asserting the boundary rather
    // than the alias's position: any future effect added below the install strands the
    // same way, whatever it writes.
    //
    // The pre-install line now states this to the adopter — "this is the last step, so
    // every file above is already on disk" — so an effect added below the install makes
    // that sentence false as well as strands the tree (field runs #144–#146).
    const cases = [
      ['fresh scaffold', plan(state(), bp, { configSource: 'CONFIG SOURCE' })],
      ['existing config', plan(state(), bp)],
      ['no install', plan(state(), bp, { configSource: 'CONFIG SOURCE', install: false })],
    ] as const;

    for (const [name, actions] of cases) {
      const effects = actions
        .map((action, index) => ({ index, kind: action.kind }))
        .filter((entry) => entry.kind !== 'instruct' && entry.kind !== 'install');

      const install = actions.findIndex((action) => action.kind === 'install');

      expect(effects.length, name).toBeGreaterThan(0);

      if (install !== -1) {
        expect(Math.max(...effects.map((entry) => entry.index)), name).toBeLessThan(install);
      }
    }
  });

  it('writes config, scaffolds every layer, emits artifacts, and installs', () => {
    const actions = plan(state(), bp, { configSource: 'CONFIG SOURCE' });

    expect(write(actions, 'blueprint.config.mjs')).toMatchObject({ content: 'CONFIG SOURCE' });
    expect(actions.filter((a) => a.kind === 'mkdir')).toHaveLength(6);
    expect(write(actions, 'docs/architecture-handbook.md')).toBeDefined();
    expect(write(actions, 'CLAUDE.md')).toBeDefined();
    expect(write(actions, 'AGENTS.md')).toBeDefined();
    expect(write(actions, 'eslint.config.mjs')).toBeDefined();

    expect(
      actions.find((a) => a.kind === 'install'),
    ).toMatchObject({ command: 'npm install -D eslint @kekkai/blueprint' });

    expect(actions.some((a) => a.kind === 'instruct' && a.note.includes('~app'))).toBe(true);

    expect(
      actions.some((a) => a.kind === 'instruct' && a.note.includes('install knip')),
    ).toBe(true);

    expect(actions.some((a) => a.kind === 'instruct' && a.note.includes('stylelint'))).toBe(true);
  });

  it('omits the config write when configSource is null', () => {
    expect(
      write(plan(state({ hasConfig: true }), bp), 'blueprint.config.mjs'),
    ).toBeUndefined();
  });

  it('scaffolds no empty layer dirs when the tree already holds code (batch 11)', () => {
    // Root-only starter taking the early exit: .gitkeep shells would be the
    // physical twin of the manufactured net the playbook forbids.
    const actions = plan(state(), bp, { configSource: 'CONFIG SOURCE', hasSourceFiles: true });

    expect(actions.filter((a) => a.kind === 'mkdir')).toHaveLength(0);
    expect(write(actions, 'blueprint.config.mjs')).toBeDefined(); // the rest of the plan is intact
  });

  it('skips layer dirs that already exist', () => {
    const actions = plan(state({ existingSrcDirs: ['pages', 'services'] }), bp);

    expect(actions.filter((a) => a.kind === 'mkdir')).toHaveLength(4);
  });

  it('surfaces the install command as an instruct under --no-install', () => {
    const actions = plan(state(), bp, { install: false });

    expect(actions.some((a) => a.kind === 'install')).toBe(false);

    const note = actions.find((a) => a.kind === 'instruct' && a.note.includes('Install skipped'));

    expect(note?.note).toContain('npm install -D eslint @kekkai/blueprint');

    // Nothing missing → neither an install action nor the instruct.
    const clean = plan(state({ missingDeps: [] }), bp);

    expect(clean.some((a) => a.kind === 'install')).toBe(false);

    expect(
      clean.some((a) => a.kind === 'instruct' && a.note.includes('Install skipped')),
    ).toBe(false);
  });

  it('says the eslint it installs is unpinned, and what the majors are backed by', () => {
    // `eslint` goes in unpinned, so npm resolves the newest supported major — newer
    // than this package's own devDependency. A field agent watched ESLint 10 arrive
    // from a tool developed on 9 and could only report "worked today" (#100): the
    // support range is a decision in the source that never reached any output.
    const install = plan(state(), bp).find((a) => a.kind === 'install');

    expect(install?.kind === 'install' && install.note).toContain('eslint unpinned');

    for (const major of SUPPORTED_ESLINT_MAJORS) {
      expect(install?.kind === 'install' && install.note).toContain(String(major));
    }

    // Both halves are asserted — this one here, the CI one in the test below —
    // because each answers a different question. The
    // peer-range one decides whether their install resolves at all, and it is the half
    // an adopter can check without leaving their own `node_modules` — `detect.test.ts`
    // proves it per carrier off the installed manifests.
    expect(install?.kind === 'install' && install.note)
      .toContain('admitted by every carrier\'s peer range');

    // A repo that already has eslint gets the plain list — the sentence explains a
    // resolution about to happen, so with nothing to resolve it is noise.
    const partial = plan(state({ missingDeps: ['@kekkai/blueprint'] }), bp)
      .find((a) => a.kind === 'install');

    expect(partial?.kind === 'install' && partial.note).toBe('@kekkai/blueprint');
  });

  it('names the channel that runs each major, and claims no more than it runs', () => {
    // The other half of the same sentence, and the comment above says why they are
    // asserted apart: the peer range decides whether the install resolves, this one
    // says who tested the result. "both tested" shipped once while nothing ran 10
    // (field run #150); the `eslint-10` leg makes it true, but the published tarball
    // ships `devDependencies` with eslint 9 and two runs are on record reading that
    // file (#139, #140), so unbridged it still reads as the tool contradicting itself.
    const install = plan(state(), bp).find((a) => a.kind === 'install');

    expect(install?.kind === 'install' && install.note)
      .toContain('CI runs its own suite on each');

    expect(install?.kind === 'install' && install.note).not.toContain('are both tested');
  });

  it('uses the package manager add syntax for pnpm/yarn', () => {
    const pnpm = plan(
      state({ packageManager: 'pnpm' }),
      bp).find((a) => a.kind === 'install');

    expect(pnpm).toMatchObject({ command: 'pnpm add -D eslint @kekkai/blueprint' });
  });
});

describe('plan · wired eslint config', () => {
  it('emits no reference when the hand-made config already imports the package', () => {
    const actions = plan(
      state({ hasEslintConfig: true, wiredEslintConfig: true }),
      bp);

    expect(write(actions, 'eslint.config.blueprint.mjs')).toBeUndefined();
    expect(write(actions, 'eslint.config.mjs')).toBeUndefined();

    expect(actions.some(
      (action) => action.kind === 'instruct' && action.note.includes('already wires'),
    )).toBe(true);
  });
});

describe('plan · what licenses a greenfield edit', () => {
  const withVite = {
    hasViteConfig: true,
    viteConfig: {
      file: 'vite.config.ts',
      text: 'export default defineConfig({\n  plugins: [],\n})\n',
    },
  };

  it('edits vite.config only when init wrote the blueprint config itself', () => {
    // The surgery is licensed by init OWNING that setup moment. With a config
    // already in the repo, the vite file is the user's — instruct, never edit.
    expect(write(plan(state(withVite), bp, { configSource: 'source' }), 'vite.config.ts'))
      .toBeDefined();

    expect(write(plan(state(withVite), bp), 'vite.config.ts')).toBeUndefined();
  });

  it('closes the marker block directly after the contract body', () => {
    // The emitted contract ends with a newline. Left on, the block gains a blank
    // line before its END marker, and every re-init diffs that line back and
    // forth depending on which end got trimmed.
    const content
      = write(plan(state(), bp, { configSource: 'source' }), 'CLAUDE.md')?.content ?? '';

    expect(content).toMatch(/\S\n<!-- BLUEPRINT:END -->/);
  });
});

describe('plan · every action is labelled so the reader can locate it', () => {
  // `note` is the line init prints to say what it just did. The long instruct
  // notes were asserted; the short ones on write / mkdir / rm never were, so
  // each could go empty — and the plan then prints a run of blank rows above a
  // set of writes the reader cannot attribute to any file.
  //
  // Asserted as an invariant rather than a list of expected strings: a new
  // action inherits the requirement instead of slipping past a fixture that
  // predates it.
  const scenarios: [string, Partial<ProjectState>, string | null][] = [
    ['greenfield, nothing installed', {}, 'export default {};'],
    ['an existing config and a wired eslint', { hasConfig: true, wiredEslintConfig: true }, null],
    [
      'a hand-written flat config to merge into',
      {
        hasConfig: true,
        hasEslintConfig: true,
        eslintConfigFile: 'eslint.config.mjs',
        eslintConfigShape: 'flat-array',
      },
      null,
    ],
    [
      'a legacy eslintrc',
      { hasConfig: true, legacyEslintConfig: '.eslintrc.cjs', eslintConfigShape: 'legacy' },
      null,
    ],
    [
      'a TypeScript project with vite',
      { hasTypescript: true, hasViteConfig: true },
      'export default {};',
    ],
  ];

  it.each(scenarios)('%s', (_label, over, configSource) => {
    const actions = plan(state(over), bp, { configSource });

    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(action.note.trim(), `a ${action.kind} action carries a blank note`).not.toBe('');

      // A file-touching action has to name the file it touched. Anything else
      // leaves the reader matching rows against a filesystem by hand.
      if (action.kind === 'write' || action.kind === 'mkdir' || action.kind === 'rm') {
        expect(action.note, `${action.kind} ${action.path} does not name its own path`)
          .toContain(action.path);
      }
    }
  });
});

describe('plan · containment', () => {
  // The two adopter-supplied path strings that reach `fs`. Both wrote outside the
  // project root and both runs reported ✓ — `emit.handbook: '../HANDBOOK.md'`
  // landed one directory up, an absolute `emit.agents[].path` landed wherever it
  // pointed. Refused in the planner so `--dry-run` cannot print a plan the real
  // run would reject, and so nothing at all lands.
  const withEmit = (emit: Blueprint['emit']): Blueprint => ({
    ...bp,
    emit: { ...bp.emit, ...emit },
  });

  it.each([
    ['emit.handbook, relative', { handbook: '../HANDBOOK.md' }],
    ['emit.handbook, absolute', { handbook: '/tmp/HANDBOOK.md' }],
    ['emit.agents path, relative', { agents: [{ target: 'claude', path: '../CLAUDE.md' }] }],
    ['emit.agents path, absolute', { agents: [{ target: 'claude', path: '/tmp/CLAUDE.md' }] }],
  ] as [string, Blueprint['emit']][])('refuses %s', (_name, emit) => {
    expect(() => plan(state(), withEmit(emit), { configSource: 'CONFIG SOURCE' }))
      .toThrow(/outside the project root/);
  });

  it('leaves a config whose paths stay inside the root alone', () => {
    const inside = withEmit({
      handbook: 'docs/nested/handbook.md',
      agents: [{ target: 'claude', path: '.claude/CLAUDE.md' }],
    });

    const actions = plan(state(), inside, { configSource: 'CONFIG SOURCE' });

    expect(write(actions, 'docs/nested/handbook.md')).toBeDefined();
    expect(write(actions, '.claude/CLAUDE.md')).toBeDefined();
  });
});
