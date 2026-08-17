import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { cli, configSource, makeRepo, react, rm } from './conformance';
import type { RepoSpec } from './conformance';

/**
 * `sourceRoot: '.'` — the project-root layout (a Next.js app with no `srcDir`,
 * where the layers sit at the repo root and no `src/` segment exists to anchor
 * on) — enforced end to end: the CLI's own dispatch resolves the config,
 * `emitLint` compiles it, and the project's own real `eslint` lints real files
 * on disk.
 *
 * This is the layer `bc0d8a5`'s message claimed and left in prose. That commit
 * fixed the rule's no-anchor arm — with no segment to search for, the only way
 * to find the boundary in the absolute filename real ESLint hands a rule is
 * `context.cwd` — and its tests reach it through the low-level `Linter` API
 * with a fabricated filename, which is the one shape that never exercises that
 * arm's reason for existing. `lint.source-root-glob.test.ts` (e01274b) later
 * put the emitted glob in front of a real `ESLint#lintFiles` run, but through
 * `emitLint()` called directly and under the `'./'` spelling. Nothing yet ran
 * the bare `'.'` a config actually declares through the command an adopter
 * actually types, so config resolution, net resolution and the emitted rule
 * were never proven to agree on this layout in one run.
 *
 * `impact` is that command: it builds the config with `emitLint`, resolves the
 * governed globs with `emitLint`'s own resolver, and lints them with the
 * project's own ESLint. A layout the rule reads correctly but the runtime hands
 * no files is the failure this shape is prone to, and it looks exactly like a
 * clean repo — so `linted` is asserted alongside the verdicts.
 */

const dirs: string[] = [];

const repo = (spec: RepoSpec): string => {
  const dir = makeRepo(spec);

  dirs.push(dir);

  return dir;
};

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
});

const projectRoot: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    sourceRoot: '.',
    layers: [
      { name: 'components', does: 'render UI' },
      { name: 'services', does: 'data access' },
    ],
    folder: { layout: 'flat', entry: 'index', private: [] },
  },
};

interface ImpactReport {
  total: number;
  linted: number;
  impacts: {
    rule: string;
    count: number;
    files: number;
    foreign: boolean;
    top: { path: string; count: number }[];
  }[];
}

describe('sourceRoot: "." — a project-root layout, through the CLI and the real eslint', () => {
  it('catches the import that leaves its layer, and clears the legal one beside it', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(projectRoot),
        // Leaves its layer: `components` reaching into `services` relatively.
        'components/Button.jsx':
          'import { load } from \'../services/user\';\n'
          + 'export const Button = () => load();\n',
        // Legal in the same fixture and the same layer — a sibling's entry.
        'components/Card.jsx':
          'import { Button } from \'./Button\';\n'
          + 'export const Card = () => Button;\n',
        'services/user.js': 'export const load = () => null;\n',
      },
    });

    const impact = await cli(dir, ['impact', '--json']);

    expect(impact.code).toBe(0);

    const report = JSON.parse(impact.output) as ImpactReport;

    // Every source file reached the linter. Without this the verdicts below are
    // satisfied by a run that linted nothing, which is this layout's own
    // failure mode: pre-fix, the emitted glob for a non-bare spelling matched
    // no file and the rule turned every file away for lack of a `src` segment.
    expect(report.linted).toBe(3);

    const escape = report.impacts.find((impact) => impact.rule === 'blueprint/relative-escape');

    // Not an isolation artifact: the emitted config carries this rule id.
    expect(escape?.foreign).toBe(false);
    expect(escape).toMatchObject({ count: 1, files: 1 });
    expect(escape?.top).toEqual([{ path: 'components/Button.jsx', count: 1 }]);

    // Nothing else fires anywhere — the legal sibling and the service are clean,
    // so the one verdict above is the whole story this fixture tells.
    expect(report.impacts.flatMap((impact) => impact.top.map((file) => file.path)))
      .toEqual(['components/Button.jsx']);

    expect(report.total).toBe(1);
  });
});
