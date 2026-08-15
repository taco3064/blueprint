import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
// Test-only import of the full emit module — src keeps the patterns-leaf
// boundary; the fixture needs emitLint's real selectors, not a paraphrase.
import { emitLint } from '../emit/lint';
import type { Finding } from '../inspect';
import { reactPreset } from '../presets';
import { cli, configSource, flattenProse, makeRepo, read, rm, wiredEslintConfig, write } from './conformance';
import type { CliResult, RepoSpec } from './conformance';

/**
 * The adoption conformance suite, grouped by scenario — every scenario
 * below was once a live complaint from an agent adopting the tool on a
 * real repo (the batch numbers point into the feedback ledger). Field runs
 * should only ever find NEW scenarios.
 */

const dirs: string[] = [];

const repo = (spec: RepoSpec = {}): string => {
  const dir = makeRepo(spec);

  dirs.push(dir);

  return dir;
};

afterEach(() => {
  while (dirs.length) rm(dirs.pop() as string);
});

const react = (deps: Record<string, string> = {}) => ({
  name: 'fixture',
  dependencies: { react: '^18.0.0', ...deps },
});

/**
 * Every error and warning the JSON channel carries, as `rule path`, asserted
 * with `toEqual` rather than a `toContain` per finding.
 *
 * The whole list, because a `toContain` on one finding reddens when that finding
 * disappears and stays green when a SECOND one appears beside it — which is how
 * the double-report #264 found reached a green suite. `toEqual` fails in both
 * directions, and it is the only shape that lets a case say "this fires, and
 * nothing else does".
 *
 * `info` is dropped: `owns-not-installed` and `declaratory-self-only` counts move
 * with a fixture's `package.json` and layer list, so pinning them pins the
 * fixture's incidental shape rather than the behaviour under test. Where a note
 * count IS the claim, {@link notes} asks for that rule by name.
 */
const errors = (result: CliResult): string[] =>
  (JSON.parse(result.output).findings as Finding[])
    .filter((finding) => finding.severity !== 'info')
    .map((finding) => `${finding.rule} ${finding.path}`);

/** One rule's findings, by the field that discriminates them — subject, else path. */
const notes = (result: CliResult, rule: string): string[] =>
  (JSON.parse(result.output).findings as Finding[])
    .filter((finding) => finding.rule === rule)
    .map((finding) => finding.subject || finding.path);

const reactBlueprint: Blueprint = {
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'render UI' },
      { name: 'services', does: 'data access' },
    ],
  },
  rules: { unusedVars: 'error' },
};

describe('flattenProse · the helper the prose assertions rest on', () => {
  // Every wrap-insensitive assertion in this file is only as good as this collapse,
  // and nothing asserted the collapse itself. A markdown wrap is a newline plus the
  // next line's indentation — a RUN of whitespace — so replacing each character
  // individually instead of each run leaves the needle unmatched by a different
  // amount of space. On a positive assertion that is a false red; on a negative one
  // it passes on nothing, which is the failure this helper exists to prevent.
  it('collapses a run of whitespace to one space, not one space per character', () => {
    expect(flattenProse('init created\n   only to hold this command'))
      .toBe('init created only to hold this command');

    expect(flattenProse('two\t\t tabs and spaces')).toBe('two tabs and spaces');
  });

  // The documented asymmetries, because they are what makes it safe to use on a
  // needle written as one line: a paragraph break is still a match, and nothing
  // about punctuation, wording or order is relaxed.
  it('matches across a paragraph break, and relaxes nothing else', () => {
    expect(flattenProse('one sentence.\n\nAnother one.')).toBe('one sentence. Another one.');

    expect(flattenProse('Order, punctuation: kept — verbatim.'))
      .toBe('Order, punctuation: kept — verbatim.');
  });

  // Leading and trailing whitespace becomes a single space rather than disappearing,
  // which is why the needles in this file are written without either.
  it('leaves one space where it trimmed, so needles carry no edges', () => {
    expect(flattenProse('\n  padded  \n')).toBe(' padded ');
  });
});

describe('fail-loud floor', () => {
  it('a command that needs a config says so on stderr and exits 1', async () => {
    const impact = await cli(repo(), ['impact']);

    expect(impact.code).toBe(1);
    expect(impact.output).toContain('author the config first');
  });

  it('rejects the manufactured-net workaround: a layer literally named * (batch 9)', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource({
          ...reactBlueprint,
          architecture: {
            ...reactBlueprint.architecture,
            layers: [{ name: '*', does: 'root files smuggled into the net' }],
          },
        }),
      },
    });

    const doctor = await cli(dir, ['doctor']);

    expect(doctor.code).toBe(1);
    expect(doctor.output).toContain('glob or path characters');
    expect(doctor.output).toContain('Root files are wiring, not a layer');
  });
});

describe('greenfield scaffold — init alone completes (batches 1 & 4)', () => {
  it('init → inspect green → doctor passes all 7 checks', async () => {
    const dir = repo({ packageJson: react() });

    const init = await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(init.code).toBe(0);
    expect(read(dir, 'blueprint.config.mjs')).toContain('reactPreset');
    expect(read(dir, 'eslint.config.mjs')).toContain('Generated by @kekkai/blueprint');
    // No tsconfig existed — init creates jsconfig so the alias resolves (B1's gap).
    expect(read(dir, 'jsconfig.json')).toContain('"~app/*"');
    expect(read(dir, 'docs/architecture-handbook.md')).toContain('# ');

    // The scaffolded config imports the package; offline fixtures have no
    // node_modules (--no-install), so swap in the equivalent preset as data.
    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(0);
    expect(inspect.output).toContain('Coverage:');

    const doctor = await cli(dir, ['doctor']);

    expect(doctor.code).toBe(0);
    // A `--no-install` fixture has no resolvable eslint, so the survival check cannot
    // run — and the banner no longer counts that skip as a pass (field run #129).
    expect(doctor.output).toContain('⊘ Adoption unverified — 6 of 7 checks passed');
    expect(doctor.output).not.toContain('all 7 checks passed');
  });
});

describe('"complete" says what it leaves out (field runs #71–#73)', () => {
  it('names the uncommitted working tree under the banner', async () => {
    // Three agents independently closed on the same gap, in their own words: "what I
    // reported as complete is complete minus commit". The playbook says a ratchet in
    // an uncommitted tree is not installed; doctor is the last thing on screen and
    // said only "Adoption complete", so the two truths never met where a reader is.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--structure', 'flat', '--no-install']);
    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));

    const doctor = await cli(dir, ['doctor']);

    expect(doctor.code).toBe(0);
    expect(doctor.output).toContain('6 of 7 checks passed');
    expect(doctor.output).toContain('nothing adoption wrote is committed');
    expect(doctor.output).toContain('not installed');
    // The remedy, and whose call it is — a note that only states the problem sends an
    // adopting agent to `git init`, which the playbook forbids it from doing.
    expect(doctor.output).toContain('Initialise version control and commit');
    expect(doctor.output).toContain('owner\'s call');
  });

  it('drops the note once the repo is version-controlled', async () => {
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--structure', 'flat', '--no-install']);
    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));
    fs.mkdirSync(path.join(dir, '.git'));

    const doctor = await cli(dir, ['doctor']);

    expect(doctor.code).toBe(0);

    // The banner is the LAST line, not merely followed by no VCS wording: the note
    // rides in a `? [x] : []` spread, and an empty arm is only pinned by a seam that
    // would notice anything appearing in it.
    expect(doctor.output.trimEnd().endsWith('proves what those checks cover.')).toBe(true);
  });

  it('carries the same note on the JSON channel', async () => {
    // Two channels reporting the same run must not know different things.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--structure', 'flat', '--no-install']);
    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));

    const doctor = await cli(dir, ['doctor', '--json']);
    const parsed = JSON.parse(doctor.output) as { ok: boolean; note?: string };

    expect(parsed.ok).toBe(true);
    expect(parsed.note).toContain('not installed');
  });
});

describe('brownfield playbook — semantics stated, nothing reverse-engineered (batches 1–3)', () => {
  it('says a skipped doctor check is neither green nor red, and still exits 0 (field run #129)', async () => {
    // `doctor` grew a third result in ef03dc7: `⊘` rides on `ok: true`, is left out
    // of the passed count, and turns the banner into "Adoption unverified". The
    // playbook described only green and red, which is the reading that let an agent
    // report the lint wiring as verified — so all three places it tells you to run
    // doctor now name the skip, and the semantics list explains why exit stays 0.
    // Below the threshold on purpose: that playbook is the superset — it carries the
    // early-exit checklist's step 5 on top of the acceptance gates and the semantics
    // list, so one fixture reaches all three places doctor is invoked.
    const dir = repo({ packageJson: react(), files: { 'src/main.jsx': 'export const a = 1;\n' } });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const prose = flattenProse(read(dir, 'blueprint-authoring.md') ?? '');

    expect(prose).toContain('a `⊘` is not green');
    expect(prose).toContain('passes with no `⊘`');
    expect(prose).toContain('never counts it as');
    expect(prose).toContain('an exit-code gate cannot see one');

    // The check that skips, and BOTH states it skips in — naming only the
    // unresolvable-config one would be the same defect one state narrower.
    expect(prose).toContain('emitted rules survive the merged eslint config');
    expect(prose).toContain('eslint is not wired');
    expect(prose).toContain('the merged config would not resolve');

    // The old green-or-red-only wording, so reverting any of the above turns this
    // red rather than only dropping an assertion nobody reads.
    expect(prose).not.toContain('doctor` — all checks green. Then commit');
  });

  it('init writes the playbook with the rules an agent used to dig from dist', async () => {
    const files = Object.fromEntries([
      ...Array.from({ length: 8 }, (_, i) => [
        `src/components/C${i}.jsx`,
        `export const c${i} = ${i};`,
      ]),
      ...Array.from({ length: 4 }, (_, i) => [
        `src/services/s${i}.js`,
        `import { c${i} } from '../components/C${i}';\nexport const s${i} = c${i};`,
      ]),
    ]);

    const dir = repo({ packageJson: react(), files });
    const init = await cli(dir, ['init', '--no-install']);

    expect(init.code).toBe(0);

    const playbook = read(dir, 'blueprint-authoring.md');

    expect(playbook).toContain('## Semantics the linter holds you to');
    expect(playbook).toContain('reachable through its entry, and only that way'); // folder IS entry-only
    expect(playbook).toContain('is a complete outcome'); // zero debt is legitimate (batch 4)
    expect(playbook).toContain('into ONE entry'); // flat-config merge trap (batches 5–6)
    expect(playbook).toContain('includes test files'); // survey/inspect count gap (batch 2)
    expect(playbook).toContain('cross-check every translated clause'); // stale intent docs (batch 2)
    expect(read(dir, '.claude/commands/blueprint-author.md')).toContain('blueprint-authoring.md');
  });
});

describe('alias wiring honesty (batches 1 & 4 + self-review)', () => {
  it('reads the commented tsconfig every Vite + TS starter ships', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactBlueprint),
        'tsconfig.json': `{
          // path aliases — keep in sync with vite.config.ts
          "compilerOptions": {
            /* the "@/*" style key is itself comment-shaped */
            "paths": { "~app/*": ["./src/*"], },
          },
        }`,
      },
    });

    const doctor = await cli(dir, ['doctor']);

    expect(doctor.output).toContain('✓ import alias wired to the toolchain');
  });

  it('rejects the vacuous "@" substring match, accepts a quoted token', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource({
          ...reactBlueprint,
          architecture: { ...reactBlueprint.architecture, alias: '@' },
        }),
        // '@' lives inside every scoped import — this is NOT wiring.
        'vite.config.js': 'import react from \'@vitejs/plugin-react\';\nexport default {};',
      },
    });

    const red = await cli(dir, ['doctor']);

    expect(red.code).toBe(1);
    expect(red.output).toContain('✗ import alias wired to the toolchain');
    expect(red.output).toContain('"@/*": ["./src/*"]');

    write(
      dir,
      'vite.config.js',
      'import react from \'@vitejs/plugin-react\';\n'
      + 'export default { resolve: { alias: { \'@\': \'/src\' } } };',
    );

    const green = await cli(dir, ['doctor']);

    expect(green.output).toContain('✓ import alias wired to the toolchain');
  });
});

describe('zero-debt honesty — notes are not debt (batch 4)', () => {
  it('names an empty suppressions ledger as ceremony (field run #1)', async () => {
    // The first live harness run: the agent obeyed `--suppress-all` on a
    // clean lint, got an empty ledger, and had to discover the asymmetry
    // with the baseline (zero debt writes no file) by itself.
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactBlueprint),
        'eslint-suppressions.json': '{}',
      },
    });

    const doctor = await cli(dir, ['doctor']);
    const line = doctor.output.split('\n').find((entry) => entry.includes('ceremony'));

    expect(line).toContain('delete it (zero lint debt needs no ledger)');
  });

  it('refuses to lock info findings and retires an info-era baseline', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'blueprint.config.mjs': configSource(reactBlueprint) },
    });

    // Declared layers, nothing built yet: info notes only.
    const locked = await cli(dir, ['inspect', '--update-baseline']);

    expect(locked.code).toBe(0);
    expect(locked.output).toContain('informational note(s) are not debt');
    expect(read(dir, '.blueprint-baseline.json')).toBeNull();

    // A baseline that recorded an info entry still suppresses…
    write(dir, '.blueprint-baseline.json', JSON.stringify({
      version: 3,
      findings: [{
        rule: 'missing-layer',
        path: 'src/services',
        subject: '',
        message: 'Declared layer "services" has no folder yet.',
      }],
    }));

    const legacy = await cli(dir, ['inspect', '--baseline']);

    expect(legacy.code).toBe(0);

    // …and the next lock retires it instead of preserving the off-label note.
    const relocked = await cli(dir, ['inspect', '--update-baseline']);

    expect(relocked.output).toContain('removed');
    expect(read(dir, '.blueprint-baseline.json')).toBeNull();
  });

  it('names the vacuous net instead of passing an empty room as green', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactBlueprint),
        'src/main.jsx': 'export default 1;', // root wiring — outside every net
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(0);
    expect(inspect.output).toContain('Enforcement is vacuous');

    const doctor = await cli(dir, ['doctor']);

    expect(doctor.output).toContain('clean, but vacuous');
  });
});

describe('impact tells the truth in isolation (batch 5, real eslint)', () => {
  it('loads an emitted config from a repo that exempts no test file', async () => {
    // `testFiles: []` — "tests inherit their layer's rules" — validated, ran clean
    // through inspect, and emitted `files: []` on the testFilename entry, which ESLint
    // rejects: `Key "files": Expected value to be a non-empty array at user-defined
    // index 14`. Every unit test passed: none of them hands the emitted config to
    // ESLint, and the config-shaped defect only exists once ESLint reads it. So this
    // belongs here, in the layer that runs the real linter, and it is what the adopter
    // hit — eight minutes and a trip through `dist/config/types.d.ts` (field run #150).
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource({
          ...reactBlueprint,
          architecture: { ...reactBlueprint.architecture, testFiles: [] },
          rules: { ...reactBlueprint.rules, testFilename: 'error' },
        }),
        'src/components/f.jsx': 'export const f = () => 1;\n',
      },
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).not.toContain('non-empty array');

    // And the gate says why it is not in that config, rather than going quiet.
    const rules = await cli(dir, ['rules']);

    expect(rules.output).toContain('testFilename: `architecture.testFiles: []` exempts nothing');
  });

  it('separates blueprint hits, isolation artifacts, and stale disables', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactBlueprint),
        'src/components/f.jsx': 'export const f = (unused) => 1;\n',
        'src/components/legacy.jsx':
          '/* eslint-disable custom/no-bad-script-literals -- house rule lives in our config */\n'
          + 'export const legacy = 1;\n',
        'src/components/stale.jsx':
          '// eslint-disable-next-line no-console -- nothing here triggers it\n'
          + 'export const stale = 1;\n',
      },
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('no-unused-vars');
    // The stale disable is not a parse failure — the file is fine (batch 5),
    // and it sits under the caveat heading, outside the total (batch 8).
    expect(impact.output).toContain('Isolation caveats');
    expect(impact.output).toContain('unused-disable-directive — 1 file(s)');
    expect(impact.output).not.toContain('parse-error —');
    expect(impact.output).toContain('1 hit(s)');
    // Rules from the repo's own config render apart and never count.
    expect(impact.output).toContain('Names YOUR OWN config owns');
    expect(impact.output).toContain('custom/no-bad-script-literals — 1 file(s)');

    // Real ESLint, so this row's mechanism is settled here rather than asserted:
    // `legacy.jsx` holds the disable comment and `export const legacy = 1`, and
    // the house rule is not in this run's config at all. A count of 1 can only be
    // the comment — ESLint reports an unresolvable rule id at the directive. The
    // heading has to say that, because "echo of your own config" let a field agent
    // read the same row as its rule firing on the code below (field run #146).
    expect(flattenProse(impact.output)).toContain('a count here counts mentions');
  });

  it('runs the real TypeScript chain — enum members stay unflagged', async () => {
    const dir = repo({
      packageJson: react({ typescript: '^5.0.0' }),
      files: {
        'blueprint.config.mjs': configSource(reactBlueprint),
        'src/services/api.ts': [
          'enum Status { Ok, Bad }',
          'export const check = (s: Status): boolean => {',
          '  try {',
          '    return s === Status.Ok;',
          '  } catch (error) {',
          '    return false;',
          '  }',
          '};',
          'const dead = 1;',
          '',
        ].join('\n'),
      },
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    // Unused local + unused catch param — and NOT the enum members.
    expect(impact.output).toContain('@typescript-eslint/no-unused-vars');
    expect(impact.output).toContain('2 hit(s)');
  });

  it('runs the real Vue SFC chain through vue-eslint-parser', async () => {
    const dir = repo({
      packageJson: { name: 'fixture', dependencies: { vue: '^3.0.0' } },
      files: {
        'blueprint.config.mjs': configSource({
          ...reactBlueprint,
          framework: 'vue',
        }),
        'src/components/Btn.vue': [
          '<script>',
          'const wasted = 42;',
          'export default { name: \'Btn\' };',
          '</script>',
          '<template><button>go</button></template>',
          '',
        ].join('\n'),
      },
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('no-unused-vars');
    expect(impact.output).toContain('Btn.vue');
  });
});

describe('merge survival — wired means still alive (batch 6, real eslint)', () => {
  const selfOnly: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'views', does: 'pages' },
        {
          name: 'contexts',
          does: 'shared state',
          allowedImporters: [{ layer: 'views', selfOnly: true }],
        },
      ],
    },
  };

  const spec = (eslintConfig: string): RepoSpec => ({
    packageJson: react(),
    files: {
      'blueprint.config.mjs': configSource(selfOnly),
      'jsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~app/*': ['./src/*'] } },
      }),
      'src/views/Home.jsx': 'export default 1;',
      'src/contexts/user.jsx': 'export const user = 1;',
      'eslint.config.mjs': eslintConfig,
    },
  });

  it('passes while the emitted structural rules are intact — verified, not skipped', async () => {
    const dir = repo(spec(wiredEslintConfig(selfOnly)));
    const doctor = await cli(dir, ['doctor']);

    // The skip label shares this prefix — a lazy assertion would false-pass
    // on "(skipped — could not resolve …)". Demand the verified verdict.
    expect(doctor.output).toContain('✓ emitted rules survive the merged eslint config (');
    expect(doctor.output).not.toContain('skipped');
    expect(doctor.code).toBe(0);
  });

  it('verifies an EMPTY repo through synthetic probes — no skip, no blind spot', async () => {
    const bare = (eslintConfig: string): RepoSpec => ({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(selfOnly),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'eslint.config.mjs': eslintConfig,
      },
    });

    // Batch 7's irony: the anti-false-green tool used to go blind exactly
    // where nothing exists yet. Intact wiring now VERIFIES green…
    const green = await cli(repo(bare(wiredEslintConfig(selfOnly))), ['doctor']);

    expect(green.output).toContain('✓ emitted rules survive the merged eslint config (');
    expect(green.output).not.toContain('skipped');

    // …and a gutted layer turns red with zero files on disk.
    const gutting
      = '  { "files": ["src/views/**/*.js"], '
        + '"rules": { "no-restricted-syntax": ["error", "WithStatement"] } },';

    const red = await cli(repo(bare(wiredEslintConfig(selfOnly, gutting))), ['doctor']);

    expect(red.code).toBe(1);
    expect(red.output).toContain('✗ emitted rules survive the merged eslint config');
    expect(red.output).toContain('views: no-restricted-syntax lost 1 selfOnly selector(s)');
  });

  it('turns red when a later entry silently guts one layer', async () => {
    const gutting
      = '  { "files": ["src/views/**/*.jsx"], '
        + '"rules": { "no-restricted-syntax": ["error", "WithStatement"] } },';

    const dir = repo(spec(wiredEslintConfig(selfOnly, gutting)));
    const doctor = await cli(dir, ['doctor']);

    expect(doctor.code).toBe(1);
    expect(doctor.output).toContain('✗ emitted rules survive the merged eslint config');
    expect(doctor.output).toContain('views: no-restricted-syntax lost 1 selfOnly selector(s)');
    expect(doctor.output).toContain('combine both option sets into ONE entry');

    // Field run #73: an agent hand-merging this entry reproduced blueprint's exact
    // `/` escaping "defensively" and could not tell whether it had to. It did — the
    // comparison is string containment — and doctor never said so, so an equivalent
    // re-spelling reads as a loss on a config eslint would enforce correctly.
    expect(doctor.output).toContain('The comparison is textual, not semantic');
    expect(doctor.output).toContain('copy the emitted text rather than retyping it');
  });
});

describe('an instruction states its own reach too (field runs #91–#93)', () => {
  it('says the codeStyle --fix pass is a no-op while the layers are empty', async () => {
    // This text was added last round, and it prescribed running `--fix` and landing a
    // commit unconditionally. Two agents caught it independently: one downgraded it to
    // "when the first file lands in a layer", the other nearly filed it as a misleading
    // instruction. The playbook states reach for its lint and build steps in four
    // places; this instruct did not — the same class, in my own new sentence.
    const dir = repo({ packageJson: react() });

    const init = await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).toContain('when there IS code inside a layer');
    expect(init.output).toContain('that pass is a no-op');
    expect(init.output).toContain('which is when the --fix pass earns its commit');
  });

  it('blames regenerated wording on the build, not on the version string (field run #115)', async () => {
    // Two runs spent a cycle proving this, so the paragraph exists. It then blamed the
    // difference on "the installed version is newer" — false for the run that found it:
    // both sides read 3.0.0 and the text still differed, because the two builds were
    // different. Structural here, not a fluke — scripts/field-run.mjs packs whatever
    // version package.json holds, which stays at the last release until changesets bump
    // it, so every --repo re-adoption run reproduces it. The condition is a different
    // build; the version string cannot decide it, and the run-twice check is what can.
    const dir = repo({
      packageJson: react(),
      files: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`src/legacy/mod${i}.js`, 'export const x = 1;\n']),
      ),
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';
    const prose = flattenProse(playbook);

    expect(prose).toContain('can come out WORDED differently from the ones committed whenever a '
      + 'different BUILD wrote them');

    expect(prose).toContain('Equal version strings do not rule that out');
    expect(prose).toContain('not drift and not non-idempotency');
    expect(prose).toContain('the check is the same either way');
    expect(prose).toContain('Never hand-revert generated text');
    // The false narrowing itself, so restoring it turns this red rather than only
    // dropping an assertion nobody reads.
    expect(prose).not.toContain('when the installed version is newer than the one that wrote them');
  });
});

describe('a number and a rule the reader can act on (field run #89)', () => {
  it('names the files outside the layer nets, not just how many', async () => {
    // `272/275` reads identically whether the three are root wiring (outside by design)
    // or a layer file a mistyped glob dropped out. A field agent confirmed its globs by
    // other means and said the number itself was not what told it.
    const dir = repo({
      packageJson: react(),
      files: {
        'src/components/Button.jsx': 'export const Button = () => null;\n',
        'src/main.jsx': 'export const boot = 1;\n',
      },
    });

    await cli(dir, ['init', '--no-install']);
    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.output).toContain('outside: src/main.jsx');
    expect(inspect.output).toContain('root wiring belongs here; a layer file does not');
  });

  it('tells the contract reader which remedy is theirs', async () => {
    // `inspect` offers two ways out of an undeclared folder — declare it, or move the
    // code. Every contract said only "do not create them", so an agent reading nothing
    // else contorts new code into an existing layer instead of reporting that the
    // architecture outgrew the config. Declaring a layer is the owner's call, the same
    // call the playbook keeps away from an adopting agent.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    const contract = read(dir, 'CLAUDE.md') ?? '';

    expect(contract).toContain('Its finding names two remedies and only one is yours');
    expect(contract).toContain('never declare the layer yourself');
  });
});

describe('a flag states its outcome, not only its mechanism (field run #88)', () => {
  it('--authoring says where it lands on a small repo', async () => {
    // Four agents reached for this flag and had to work out from the run's output that
    // below the threshold it forces the PLAYBOOK, whose own verdict then sends them to
    // --preset. One asked outright whether that reading matched the user's intent. The
    // help described the mechanism and left the outcome to be discovered.
    const dir = repo({ packageJson: react() });

    const help = await cli(dir, ['init', '--help']);

    expect(help.code).toBe(0);
    expect(help.output).toContain('Force the authoring playbook even on a small repo');
    expect(help.output).toContain('Forces the PLAYBOOK, not a hand-authored config');
    expect(help.output).toContain('ends by running --preset');
  });

  it('the re-authoring refusal names what cannot come back', async () => {
    // "exists and has been edited" asserted something init never measured — a config a
    // previous agent authored differs from a fresh scaffold without anyone editing it,
    // and a field run was told it had edited a file it had only committed. And
    // "discard your work" reads as recoverable: the structure is (one run reproduced it
    // byte for byte), the rationale comments are not.
    const dir = repo({ packageJson: react() });

    write(dir, 'blueprint.config.mjs', '// why 400: largest file is 117 lines\nexport default {};\n');

    const init = await cli(dir, ['init', '--authoring', '--no-install']);

    expect(init.code).toBe(1);
    expect(init.output).toContain('differs from what init would scaffold');
    expect(init.output).toContain('The structure is reproducible');
    expect(init.output).toContain('Copy anything you want to keep');
    // …and names their destination, which the guard's own purpose implies and its
    // text did not say (field run #110).
    expect(init.output).toContain('back into the rewritten config');
    expect(init.output).toContain('beside the clause it explains');
    // …and it kept its hands off the file.
    expect(read(dir, 'blueprint.config.mjs')).toContain('why 400');
  });
});

describe('a proof step states its own reach (field run #85)', () => {
  const brownfield = () => ({
    packageJson: react(),
    files: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`src/legacy/mod${i}.js`, 'export const x = 1;\n']),
    ),
  });

  it('says what a green build proves on a repo with no layer files', async () => {
    // The lint sentence one line above already carried this caveat; the build sentence
    // asked for the same kind of proof and did not. With nothing importing through the
    // alias, a green build proves the tsconfig/vite edits compile — not that the alias
    // resolves. A field agent derived the downgrade itself and noted the asymmetry.
    // Forced onto a starter: the early-exit checklist is the only path that asks for a
    // build, and the only path these three agents were on.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('The same caveat as the lint run applies');
    expect(playbook).toContain('NOT that the alias resolves');
    expect(playbook).toContain('report which of the two you got');

    // …and recommends the build that does not emit a bundle here. The artifact question
    // was the most-repeated item in the whole field campaign — fifteen mentions — and
    // the playbook's own first-listed command is what creates the artifact. On a path
    // where the wide build proves nothing extra, stop creating it.
    // Which build is now MEASURED, not argued — three releases of prose about the
    // adopter's tsconfig collapsed into `viteTsCoverage`. This fixture has no vite
    // config, so the reader falls back to the read-it-yourself wording, and says so.
    expect(playbook).toContain('this run could not settle it');
    expect(flattenProse(playbook)).toContain('only the split lets you say which edit each one verified');
    expect(playbook).toContain('Never report that a build verified the vite edit');
  });

  it('says how to combine against an opaque spread', async () => {
    // "Combine into ONE entry" had no mechanism: `...emitLint(blueprint)` cannot be
    // edited from outside. An agent worked out that you place your own combined entry
    // AFTER the spread and let later-replaces-earlier make it the effective one —
    // verified it with print-config — and reported that the playbook never says so.
    //
    // "After the spread" is not the whole placement, and this is the sentence every
    // reader gets: one whose scopes match and who keeps the original entry (which the
    // paragraph above tells them to) needs the combined one after THAT too, or their
    // bare rule wins the overlap back. So the instruction is LAST, stated here rather
    // than only in the scope-mismatch case downstream — and the mechanism carries the
    // qualifier that makes it true, which the unqualified version is what #163 was.
    const dir = repo(brownfield());

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('is opaque');
    expect(playbook).toContain('place it LAST — after the spread');
    expect(playbook).toContain('after your own original entry wherever that one already sits');
    expect(playbook).toContain('only while nothing after it sets the key again');
    expect(playbook).not.toContain('place it AFTER the spread');
    expect(playbook).toContain('used deliberately');
    expect(playbook).toContain('the one place print-config is not optional');
  });

  it('does not let the sketch understate what a preset sets (field run #127)', async () => {
    // The sketch's `rules` line showed two gates and called them "the two gates a preset
    // already sets". An agent checked it against `blueprint rules` on a reactPreset repo:
    // 17 of the catalog's 18 optional gates are set, 11 at error tier. Zero cost on the
    // preset path, which never reads the sketch — and a hand-authoring reader would have
    // taken it as the preset's whole posture, which is the one thing about this tool that
    // must not be underestimated. No number replaces it: a count has an address, and
    // `rules` is that address.
    const dir = repo(brownfield());

    await cli(dir, ['init', '--authoring', '--no-install']);

    const prose = flattenProse(read(dir, 'blueprint-authoring.md') ?? '');

    expect(prose).toContain('two gates that a preset sets too');
    expect(prose).toContain('NOT the set a preset sets, which is nearly the whole catalog');
    expect(prose).toContain('`npx blueprint rules` prints that set');
    // The count-bearing claim itself, so restoring it turns this red.
    expect(prose).not.toContain('the two gates a preset already sets');
  });

  it('names the one part of the emitted entry a fold does NOT carry (field run #117)', async () => {
    // The same sentence said the combined entry must carry "everything the emitted one
    // did", two paragraphs after forbidding an emitLint dump — and the emitted entry
    // holds a message the sanctioned source does not. An agent read the two together as
    // two sanctioned sources disagreeing and went to the dump for the text.
    const dir = repo(brownfield());

    await cli(dir, ['init', '--authoring', '--no-install']);

    const prose = flattenProse(read(dir, 'blueprint-authoring.md') ?? '');

    expect(prose).toContain('carry everything the emitted one ENFORCED');
    expect(prose).toContain('The ban message is the one part that is NOT among those');
    expect(prose).toContain('doctor compares selectors and never messages');
    expect(prose).toContain('nothing here sends you into a dump to retrieve a sentence');
    // The claim that made the message look mandatory, so restoring it turns this red.
    expect(prose).not.toContain('carry everything the emitted one did');
  });

  it('treats ignore rules and version control as two facts, not one axis', async () => {
    // First written as one axis ("no ignore rules — including no VCS at all"), which
    // collapsed two independent facts. A field repo landed exactly between them: a
    // `.gitignore` that lists `dist`, in a tree that is not a git repo, so the rule has
    // nothing to enforce it. The branch had no cell for that.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('Two independent facts decide that, not one');
    expect(playbook).toContain('a rule with nothing to enforce it');
    expect(playbook).toContain('Say which of the four you are in');
  });

  it('stops claiming artifacts a redirected build never wrote (field run #135)', async () => {
    // The paragraph opened on a premise about the adopter's repo: "a step THIS playbook
    // asked for produced untracked files in someone's working tree". False on what
    // `npm create vite` writes for React + TS — both projects carry `noEmit` and a
    // `tsBuildInfoFile` under `node_modules/` — so an agent copying that instruction
    // reports untracked files that do not exist. Third time this family has been wrong
    // about a tsconfig, and the same answer as the second: measure it.
    const dir = repo({
      packageJson: react(),
      files: {
        'tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }',
        'tsconfig.app.json': '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": "./node_modules/.tmp/app.tsbuildinfo" }, "include": ["src"] }',
      },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const prose = flattenProse(read(dir, 'blueprint-authoring.md') ?? '');

    expect(prose).toContain('`tsc -b` leaves nothing in this working tree, and that is measured');
    expect(prose).toContain('node_modules/.tmp/app.tsbuildinfo');
    expect(prose).toContain('The four cells below still decide the bundle');
    // The cells survive the specialisation — they still decide what the vite build
    // writes, and a measured arm that dropped them would trade one gap for another.
    expect(prose).toContain('Say which of the four you are in');

    // And the default arm keeps the premise where nothing was measured, because there
    // it is right: a repo with no such redirect does get artifacts in its tree.
    const plain = repo({ packageJson: react() });

    await cli(plain, ['init', '--authoring', '--no-install']);

    const plainProse = flattenProse(read(plain, 'blueprint-authoring.md') ?? '');

    expect(plainProse).toContain('produced untracked files in someone\'s working tree');
    expect(plainProse).not.toContain('leaves nothing in this working tree');
  });
});

describe('the same gap, one artifact further along (swept, not field-reported)', () => {
  it('the handbook states its reach, like the contract now does', async () => {
    // Field runs #79 and #81 raised this about CLAUDE.md, because CLAUDE.md is what
    // they read. The handbook is the other durable artifact — the contract links to it
    // for placement decisions — and it said nothing about the net possibly being empty.
    // Same class, next artifact. Found by sweeping the fixed findings rather than by
    // waiting for a run to land on it.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    const handbook = read(dir, 'docs/architecture-handbook.md') ?? '';

    expect(handbook).toContain('Every row reaches only the files a layer glob matches');
    expect(handbook).toContain('runway rather than protection');
    expect(handbook).toContain('`blueprint doctor` reports which of the two');
  });

  it('the merge instruct says an entry is more than its selectors', async () => {
    // `init --preset` never writes the authoring playbook, and the playbook is where
    // "carry the emitted block's ignores" lives — the half of a merge that fails
    // SILENTLY. Both merge shapes already said "combine into ONE entry", which is the
    // half that fails loudly. Same class as the codeStyle finding above: guidance
    // reaching only the path that does not need it.
    const dir = repo({
      packageJson: react(),
      files: {
        'eslint.config.mjs': 'export default [];\n',
      },
    });

    const init = await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(init.code).toBe(0);
    // The reference is written, so a merge is genuinely ahead of the reader.
    expect(read(dir, 'eslint.config.blueprint.mjs')).toContain('emitLint');
    expect(init.output).toContain('An entry is more than its selectors');
    expect(init.output).toContain('`npx blueprint rules --json` carries both');
    expect(init.output).toContain('Doctor compares selectors, not scope');
  });
});

describe('one config, artifacts that agree about it (field runs #83–#84)', () => {
  it('does not let the contract promise lint catches a cycle', async () => {
    // `cycles` is on LINT_GATED_RULE_IDS — which answers "gated at all?" — while its
    // runtime is `inspect`, because import/no-cycle re-walks the graph per file. The
    // handbook has said so since field issue #52; the contract had not, and the
    // previous release attached "by the generated eslint config" to the undivided
    // list. A field agent found the two artifacts disagreeing and read the contract
    // as promising a green lint covers cycles. README's whole claim is that artifacts
    // generated from one config cannot contradict each other.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    const contract = read(dir, 'CLAUDE.md') ?? '';

    expect(contract).toContain('`cycles`');
    expect(contract).toContain('held by `npx blueprint inspect --baseline` instead');
    expect(contract).toContain('a green lint says nothing about it');
    // …and it must not be counted among what lint holds.
    expect(contract).not.toMatch(/`cycles`[^.;]*fail `npm run lint`/);

    // The handbook, from the same config, says the same thing.
    const handbook = read(dir, 'docs/architecture-handbook.md') ?? '';

    expect(handbook).toContain('cycles');
    expect(handbook).toContain('inspect');
  });

  it('says what codeStyle will demand, on the path that never reads the catalog', async () => {
    // The rule catalog explains how to land ~68 formatting rules (--fix once, its own
    // commit) and ships inside the authoring playbook — which the preset path never
    // writes. A Vite starter has no semicolons and the preset asks for them: silent
    // today because root files are outside the layer globs, an error the day the
    // first file moves into a layer.
    const dir = repo({ packageJson: react() });

    const init = await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).toContain('`codeStyle` on at error tier');
    expect(init.output).toContain('npx eslint . --fix');
    expect(init.output).toContain('its own commit');
    expect(init.output).toContain('fails the day its first file moves into a layer');
    expect(init.output).toContain('Set `codeStyle: \'off\'`');
  });

  it('stays quiet about codeStyle on a repo that already had a config', async () => {
    // Not a codeStyle test — a path test. An existing config means the owner already
    // chose, so the note has nothing to announce. (The condition's other half needs an
    // injected blueprint to reach, so it is covered in bootstrap's own tests; asserting
    // it here would pass for the wrong reason, since this branch short-circuits first.)
    const dir = repo({ packageJson: react() });

    write(dir, 'blueprint.config.mjs', configSource(reactBlueprint));

    const init = await cli(dir, ['init', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).not.toContain('codeStyle` on at error tier');
  });
});

describe('naming the cause, so a claim can be checked (field runs #79–#81)', () => {
  it('names the .gitignore rule that hid the handbook, not only the file', async () => {
    // A field agent ran `git check-ignore` AFTER init appended its negation, got
    // "not ignored", and filed the fix as a no-op. It was not: `docs/*` hid the
    // handbook, and the negation is what un-hid it. A post-hoc check cannot tell
    // "never needed" from "currently working" — so the note names the pattern,
    // which the fix has not changed.
    const dir = repo({
      packageJson: react(),
      files: { '.gitignore': 'node_modules\ndocs/*\n!docs/keep.md\n' },
    });

    const init = await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).toContain('hidden by `docs/*`');
    expect(read(dir, '.gitignore')).toContain('!docs/architecture-handbook.md');
  });

  it('says the contract gates reach only the files the globs match', async () => {
    // Every CLI surface marks an empty net as vacuous. The contract — the one
    // artifact a future agent reads with no CLI output beside it — did not, and two
    // field agents flagged it independently. Stated as reach rather than as a count,
    // so it cannot go stale once code lands.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    const contract = read(dir, 'CLAUDE.md') ?? '';

    expect(contract).toContain('Hard gates (machine-enforced');
    expect(contract).toContain('on the files the layer globs match');
    expect(contract).toContain('runway, not protection');
  });

  it('tells a re-adoption not to drop what the matrix cannot express', async () => {
    // The check-only rule added last round has a second-order effect: ownership, a
    // selfOnly shape, an empty layer's position and a zero-edge importer cannot be
    // derived from the matrix at all, so check-only means dropping them — a faithful
    // re-adoption then hands back a LOOSER config than the one it replaced.
    const dir = repo({
      packageJson: react(),
      files: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`src/legacy/mod${i}.js`, 'export const x = 1;\n']),
      ),
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(flattenProse(playbook)).toContain('cannot** be derived from the matrix');
    expect(playbook).toContain('LOOSER than the one it replaced');
    expect(flattenProse(playbook)).toContain('reproduced rather than derived');
  });

  it('states the ignores trade in both directions', async () => {
    // Carrying blueprint's test exemption onto a merged entry stops a house rule at
    // test files it used to govern — the mirror of the documented hazard, and the
    // one a field agent hit.
    const dir = repo({
      packageJson: react(),
      files: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`src/legacy/mod${i}.js`, 'export const x = 1;\n']),
      ),
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('The same move runs the other way');
    expect(flattenProse(playbook)).toContain('that is where an asymmetry you introduce here lands');

    // It used to close with "one entry carries one `ignores`, so a merge has to pick" —
    // the same false premise as #163's scope claim, one paragraph down: true only if the
    // combined entry is the only entry left. Leave the original in place and the
    // collision's test files keep the house rule, so there is no trade to make.
    expect(playbook).toContain('nothing has to be given up');
    expect(flattenProse(playbook)).not.toContain('so a merge has to pick');
  });
});

describe('what a second output knows about the first (field runs #75–#77)', () => {
  it('rules and doctor agree on what doctor compares (field run #159)', async () => {
    // Two live outputs, same repo, opposite instructions for a merge. `rules` closed its
    // per-layer block with "Everything below is what doctor compares" — and the block
    // below it prints a `packages:` column, while doctor's own ✓ says
    // "package-ownership entries … are not compared". A folding agent reading `rules`
    // would skip the `--print-config` pass the playbook asks for precisely because
    // doctor cannot see that column. Neither sentence was asserted, so they drifted.
    const owning = {
      ...reactBlueprint,
      architecture: {
        ...reactBlueprint.architecture,
        layers: [
          { name: 'components', does: 'render UI' },
          { name: 'services', does: 'data access', owns: ['axios', { global: 'fetch' }] },
        ],
      },
    };

    // Wired, so the survival check RUNS and prints its scope — the skip label does
    // not carry it, and the whole point is comparing that scope with what `rules` says.
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(owning),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'eslint.config.mjs': wiredEslintConfig(owning),
        'src/components/f.jsx': 'export const f = () => 1;\n',
        'src/services/api.js': 'export const api = 1;\n',
      },
    });

    const rules = await cli(dir, ['rules']);
    const doctor = await cli(dir, ['doctor']);

    // The column really is printed — without it there is nothing to disagree about.
    expect(rules.output).toContain('packages: axios');

    // doctor's ✓ owns the scope, and excludes that column.
    expect(doctor.output).toContain('package-ownership entries');
    expect(doctor.output).toContain('are not compared');

    // So `rules` must not claim the whole block, and must say what to do instead.
    expect(rules.output).not.toContain('Everything below is what doctor compares');

    // Nor any pointer into this output for the selfOnly selectors: the enumeration is a
    // statement about what doctor compares — true whatever this config holds — while
    // "below" was a location, and a config with no selfOnly importer has nothing there.
    // The scope sentence stays unconditional; only the pointer went.
    expect(rules.output).not.toContain('selfOnly selectors below');

    // The enumeration itself, and not only the two phrasings it replaced: a negative
    // assertion goes green when the sentence is DELETED, and the whole of #159 is that
    // this side of the boundary was never asserted at all. Checked by removing the line
    // — the suite stayed green on 1314 tests before this.
    expect(flattenProse(rules.output))
      .toContain('`no-import`, `globals`, `module-root` and the selfOnly selectors are the '
        + 'columns doctor compares — along with the embedded `blueprint/*` rules');

    expect(flattenProse(rules.output)).toContain('`packages` is not compared by');
    expect(flattenProse(rules.output)).toContain('--print-config');

    // And `--json` carries it beside the column, which is #117's shape: that fix put the
    // caveat in the text and left the JSON bare, and the same doubt came back three
    // releases later through the channel the playbook sends a folding agent to.
    const json = await cli(dir, ['rules', '--json']);
    const bans = JSON.parse(json.output).bans as { packages: string[]; packagesNote?: string }[];
    const owningBans = bans.filter((ban) => ban.packages.length);

    expect(owningBans.length).toBeGreaterThan(0);

    for (const ban of owningBans) {
      expect(ban.packagesNote).toContain('is not compared by doctor');
      expect(ban.packagesNote).toContain('--print-config');
    }

    // One string, two shapes — the text and the JSON cannot drift apart again.
    expect(flattenProse(rules.output)).toContain(owningBans[0].packagesNote);

    // Absent where there is nothing to verify.
    for (const ban of bans.filter((entry) => !entry.packages.length)) {
      expect(ban).not.toHaveProperty('packagesNote');
    }
  });

  it('says the declaratory selfOnly entry still collides today', async () => {
    // The finding is right at the finding level — an empty layer has nothing to
    // re-export. But the ENTRY is emitted now, on the importer layers, and a house
    // rule of the same id scoped to one of them silently replaces it or is replaced
    // by it. A field agent reasoned exactly this out via `rules --json` and warned
    // that anyone trusting "cannot fire" alone would lose their own guardrail.
    const dir = repo({
      packageJson: react(),
      files: { 'src/components/Button.jsx': 'export const Button = () => null;\n' },
    });

    write(dir, 'blueprint.config.mjs', configSource({
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'components', does: 'render UI' },
          { name: 'contexts', does: 'cross-tree state', allowedImporters: [{ layer: 'components', selfOnly: true }] },
        ],
      },
    }));

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.output).toContain('is declaratory');
    expect(inspect.output).toContain('ENTRY is emitted today');
    expect(inspect.output).toContain('merges neither into the other');
    expect(inspect.output).toContain('"Cannot fire" is about the ban, not about the entry');
  });

  it('does not claim to have created a .claude/ the repo already had', async () => {
    // Any repo whose owner uses Claude Code already has `.claude/`. The step used to
    // assert init created it — a fact init knows and had not checked.
    const dir = repo({ packageJson: react(), files: { '.claude/settings.json': '{}\n' } });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('NOT `.claude/` itself');
    expect(playbook).toContain('already here before this run');
    // Flattened because this one is NEGATIVE: pinned to the wrapping, a re-wrap
    // leaves the needle unmatched and the assertion passing on nothing. The two
    // above still catch the wrong arm, so this buys back a live assertion rather
    // than a missed case — the asymmetry is spelled out on `flattenProse`.
    expect(flattenProse(playbook)).not.toContain('init created only to hold this command');
  });

  it('does not call `.claude/commands/` empty when the owner has commands there (field run #139)', async () => {
    // Half of this sentence was already measured — the `.claude/` arm — and the other
    // half asserted "now-empty" about a directory the tool can read. A repo with the
    // owner's own command beside blueprint's got the parent right and the child wrong
    // in the same breath, and was told to delete a directory that would not be empty.
    const dir = repo({
      packageJson: react(),
      files: {
        '.claude/settings.local.json': '{}\n',
        '.claude/commands/my-existing-command.md': '# mine\n',
      },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const prose = flattenProse(read(dir, 'blueprint-authoring.md') ?? '');

    expect(prose).toContain('holds 1 other command file(s) that are the owner\'s');
    expect(prose).toContain('so it and `.claude/` both stay');
    // The claim that was false here, in either arm it could have taken.
    expect(prose).not.toContain('now-empty');
  });

  it('names the detected runner where it can, and none where it cannot (field run #141)', async () => {
    // init printed `pnpm`, installed with `pnpm add`, and then wrote a contract telling
    // the next agent to run `npm run lint` — in a repo whose own CLAUDE.md says not to
    // use npm. Two answers, from two mediums: the playbook is written by a runtime that
    // detected the runner, so it names it; the contract and handbook are generated from
    // the blueprint alone and cannot see the repo, so they name none.
    const pnpmRepo = repo({
      packageJson: react(),
      files: { 'pnpm-lock.yaml': '\n', 'src/main.tsx': 'export const a = 1;\n' },
    });

    await cli(pnpmRepo, ['init', '--authoring', '--no-install']);

    const prose = flattenProse(read(pnpmRepo, 'blueprint-authoring.md') ?? '');

    // The lint line is unconditional; the build one sits inside a `viteTs` arm this
    // fixture does not reach, so asserting it here would pin the wrong branch.
    expect(prose).toContain('`pnpm lint`');
    expect(prose).not.toContain('npm run lint');

    // The npm arm, so both are live: a helper with one exercised branch is a helper
    // that could return the same string for every manager and nothing would notice.
    const npmRepo = repo({
      packageJson: react(),
      files: { 'package-lock.json': '{}\n', 'src/main.tsx': 'export const a = 1;\n' },
    });

    await cli(npmRepo, ['init', '--authoring', '--no-install']);

    expect(flattenProse(read(npmRepo, 'blueprint-authoring.md') ?? '')).toContain('`npm run lint`');

    // And the two config-only emitters name no runner on either repo.
    await cli(pnpmRepo, ['init', '--structure', 'flat', '--preset', '--no-install']);

    for (const file of ['CLAUDE.md', 'docs/architecture-handbook.md']) {
      const text = read(pnpmRepo, file) ?? '';

      expect(text, file).toContain('the project\'s lint run');
      expect(text, file).not.toContain('npm run');
    }
  });

  it('claims it only where it is true', async () => {
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(flattenProse(playbook)).toContain('which init created only to hold this command');
    expect(playbook).toContain('it was not here before this run');
  });

  it('names the same cleanup targets everywhere it instructs cleanup (field run #124)', async () => {
    // The early-exit checklist named the two files AND the two directories init made
    // for them. The Method's finish step and the acceptance gate said "the two
    // authoring files", so an agent on the Method path — which is the one a
    // re-adoption follows — was told to delete two files and nothing about two
    // directories it had just watched init create. It invented the rmdir and said so.
    // Four sites, one passage now, so a branch cannot go missing from three of them.
    // The fourth was the banner, which #124's own fix left at "delete this file and
    // the command file — doctor flags BOTH as leftovers": the document's opening
    // line, read as the authoritative short list, and doctor checks no directory
    // (field run #145).
    const early = repo({ packageJson: react() });

    const method = repo({
      packageJson: react(),
      files: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`src/legacy/mod${i}.js`, 'export const x = 1;\n']),
      ),
    });

    await cli(early, ['init', '--authoring', '--no-install']);
    await cli(method, ['init', '--authoring', '--no-install']);

    const phrase = '`.claude/commands/` directory';
    const count = (text: string) => text.split(phrase).length - 1;

    // Early exit renders the checklist too, so it carries all four; the Method-only
    // playbook carries the banner's, step 9's and the gate's. Before the fix the
    // Method path had zero, and the banner none on either path.
    expect(count(flattenProse(read(early, 'blueprint-authoring.md') ?? ''))).toBe(4);
    expect(count(flattenProse(read(method, 'blueprint-authoring.md') ?? ''))).toBe(3);

    const brief = flattenProse(read(method, 'blueprint-authoring.md') ?? '');

    // The path restated, not imported: it is a file the adopter has, so a rename
    // should turn this red rather than follow along.
    const command = '`.claude/commands/blueprint-author.md`';

    expect(brief).toContain(`write the report, and delete this playbook, ${command}`);
    expect(brief).toContain(`- [ ] Deleted: this playbook, ${command}`);
    expect(brief).toContain(`When you finish, delete this playbook, ${command}`);
    // The claim that let the directories be missed, so restoring it turns this red.
    expect(brief).not.toContain('delete the two authoring files');
    // The banner's own version of it, which survived that fix by naming no list.
    expect(brief).not.toContain('delete this file and');
  });

  it('warns that its own prior output is not upstream intent', async () => {
    // Re-adopting a repo blueprint has already adopted, the handbook and the marker
    // block ARE blueprint's previous answer. A field agent noticed it had almost
    // copied that answer back and could not tell whether the method had led it there.
    const dir = repo({
      packageJson: react(),
      files: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`src/legacy/mod${i}.js`, 'export const x = 1;\n']),
      ),
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('One document family is NOT senior evidence');
    expect(playbook).toContain('an answer to');
    expect(playbook).toContain('agreeing because you copied');
  });
});

describe('a step that creates files owns them (field runs #71–#73)', () => {
  it('the playbook says deleting its build artifacts is safe, and whose call it is', async () => {
    // All three field runs flagged the same discomfort: the playbook asks for a build
    // to prove the alias resolves, and `dist/` + `*.tsbuildinfo` then sit untracked in
    // someone's tree. "Leave them to the repo's ignore rules" reads as "you may not
    // touch these" without the sentence that says removal is safe.
    // Forced onto a starter, which is the only path that asks for a build — and the
    // path all three field agents were on.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('a step THIS playbook asked for');
    expect(playbook).toContain('deleting them is safe');
    expect(playbook).toContain('the build can be re-run');
    expect(playbook).toContain('the owner\'s call');
  });
});

describe('init UX honesty — re-runs and starters tell the truth (batch 10)', () => {
  it('a forced playbook on a starter leads with the early-exit verdict', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    const init = await cli(dir, ['init', '--authoring', '--no-install']);

    expect(init.code).toBe(0);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    // The conclusion an agent needs sits at the top, not mid-ceremony.
    expect(playbook.indexOf('Read this first')).toBeGreaterThan(-1);
    expect(playbook.indexOf('Read this first')).toBeLessThan(playbook.indexOf('## Method'));
    expect(playbook).toContain('npx blueprint init --preset');
  });

  it('second init over a wired vite starter emits no alias instructs', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        // Template-style JSONC — the comment survives init's surgery, so the
        // second run cannot JSON.parse the file it wired itself.
        'tsconfig.json': '{\n  // template comment\n  "compilerOptions": {\n    "strict": true,\n  },\n}\n',
        'vite.config.ts': 'import { defineConfig } from \'vite\'\n\nexport default defineConfig({\n  plugins: [],\n})\n',
      },
    });

    const first = await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(first.code).toBe(0);
    expect(read(dir, 'tsconfig.json')).toContain('"~app/*"');
    expect(read(dir, 'vite.config.ts')).toContain('\'~app\'');
    // The both-contracts note names the flag that avoids the second round
    // trip — the field agent never discovered --agent existed.
    expect(first.output).toContain('--agent claude|codex');

    // The scaffolded config imports the package; offline fixtures swap it for data.
    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));

    const second = await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(second.code).toBe(0);
    // The field complaint: init #2 printed "Add the import alias to
    // tsconfig…" over a file init #1 had already wired — a false todo that
    // reads as a regression. Both alias instructs must stay silent now.
    expect(second.output).not.toContain('Add the import alias');
    expect(second.output).not.toContain('resolve.alias');
  });
});

describe('the tool answers for itself — no bundle archaeology (batch 12)', () => {
  it('rules prints the catalog, annotated with the declared tiers', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'blueprint.config.mjs': configSource(reactBlueprint) },
    });

    const rules = await cli(dir, ['rules']);

    expect(rules.code).toBe(0);
    expect(rules.output).toContain('Structural — dependency flow & ownership');
    expect(rules.output).toContain('maxLines → max-lines (default 400)');
    expect(rules.output).toContain('✓ error'); // unusedVars, declared in the fixture
    expect(rules.output).toContain('deadCode'); // documentation-only, stated as such
  });
});

describe('an injected-plugin gate cannot go silently vacuous', () => {
  // Three gates ride a plugin the library refuses to depend on. If the
  // generated config forgets the import or the argument, they emit nothing
  // and lint still passes — a vacuous gate that looks exactly like a green
  // one. Every artifact that carries the wiring is pinned here.
  it('the generated config imports stylistic and passes the whole options object', async () => {
    const dir = repo({
      packageJson: { ...react(), devDependencies: { typescript: '^5.0.0' } },
    });

    const init = await cli(dir, ['init', '--structure', 'flat', '--no-install']);
    const config = read(dir, 'eslint.config.mjs') ?? '';

    expect(init.code).toBe(0);
    expect(config).toContain('import stylistic from \'@stylistic/eslint-plugin\';');
    expect(config).toContain('...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports })');
    // The install set must carry the plugin, or the import is a crash.
    expect(init.output).toContain('@stylistic/eslint-plugin');
  });

  it('a JS project still gets stylistic — only the TS argument drops', async () => {
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    const config = read(dir, 'eslint.config.mjs') ?? '';

    expect(config).toContain('...emitLint(blueprint, { stylistic, imports })');
    expect(config).not.toContain('tseslint.plugin');
  });

  it('the catalog states the dependency instead of leaving it to be discovered', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'blueprint.config.mjs': configSource(reactPreset({ name: 'fixture' })) },
    });

    const rules = await cli(dir, ['rules']);

    expect(rules.code).toBe(0);
    expect(rules.output).toContain('statementsPerLine → @stylistic/max-statements-per-line');
    expect(rules.output).toContain('statementPadding → @stylistic/padding-line-between-statements');
    expect(rules.output).toContain('explicitAny → @typescript-eslint/no-explicit-any');
    // The two facts an adopting agent cannot guess: the gate needs an
    // injected plugin, and one of them rewrites files under --fix.
    expect(rules.output).toContain('emits nothing');
    expect(rules.output).toContain('all but 5 auto-fixable');
  });

  it('the playbook says why maxLines needs statementsPerLine to mean anything', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    // Prose in the playbook is hard-wrapped, so assert against a single-line
    // form — otherwise a reflow breaks the test without changing the meaning.
    const playbook = (read(dir, 'blueprint-authoring.md') ?? '').replace(/\s+/g, ' ');

    expect(playbook).toContain('statementsPerLine');
    // The merge hazard, stated where the merge happens.
    expect(playbook).toContain('emits NOTHING while lint still passes');
    // The fix pass gets its own commit, and its blast radius is named.
    expect(playbook).toContain('its OWN commit');
    expect(playbook).toContain('including tests');
    // The two reds --fix cannot clear, each with the cause an agent needs.
    expect(playbook).toContain('max-len` has no fixer');
    expect(playbook).toContain('.gitattributes`, NOT the file');
  });
});

describe('--agent persists into the scaffold — no chicken-and-egg (field issue #5)', () => {
  it('first init with --agent claude emits one contract and declares it in the config', async () => {
    const dir = repo({ packageJson: react() });

    const init = await cli(dir, ['init', '--structure', 'flat', '--agent', 'claude', '--no-install']);

    expect(init.code).toBe(0);
    expect(read(dir, 'blueprint.config.mjs')).toContain('emit: { agents: [\'claude\'] }');
    expect(read(dir, 'CLAUDE.md')).toContain('<!-- BLUEPRINT:START -->');
    expect(read(dir, 'AGENTS.md')).toBeNull();
    expect(init.output).not.toContain('Wrote both');
  });
});

describe('stale contracts cannot hide behind green (field issues #2–#3)', () => {
  it('doctor flags a hand-touched contract outside emit.agents', async () => {
    // Init only instructs when the stale file carries hand-written content —
    // without this check the orphan lived on with every gate green.
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource({
          ...reactBlueprint,
          emit: { agents: ['claude'] },
        }),
        'CLAUDE.md': '<!-- BLUEPRINT:START -->\ncontract\n<!-- BLUEPRINT:END -->\n',
        'AGENTS.md': '# our own notes\n\n<!-- BLUEPRINT:START -->\nold\n<!-- BLUEPRINT:END -->\n',
      },
    });

    const doctor = await cli(dir, ['doctor']);

    expect(doctor.code).toBe(1);
    expect(doctor.output).toContain('✗ no leftover reference, authoring, or stale contract files');
    expect(doctor.output).toContain('AGENTS.md');
    expect(doctor.output).toContain('needs its block removed by hand');
  });
});

describe('scaffold matches the doctrine — no invented structure (batch 11)', () => {
  it('scaffolds guidance dirs only into an empty tree', async () => {
    const rooted = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    const init = await cli(rooted, ['init', '--structure', 'flat', '--no-install']);

    expect(init.code).toBe(0);
    // Code already lives here — an unbuilt layer's absence is its true
    // state; a .gitkeep shell would contradict "never invent a layer".
    expect(read(rooted, 'src/components/.gitkeep')).toBeNull();
    expect(read(rooted, 'src/pages/.gitkeep')).toBeNull();

    const empty = repo({ packageJson: react() });

    await cli(empty, ['init', '--structure', 'flat', '--no-install']);

    // A truly empty tree still gets the guidance scaffold.
    expect(read(empty, 'src/components/.gitkeep')).toBe('');
  });

  it('re-init removes the stale generated contract when emit.agents narrows', async () => {
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(read(dir, 'AGENTS.md')).toContain('<!-- BLUEPRINT:START -->');

    // The field workflow was config-edit → re-init → *manual rm* — the last
    // step is init's job when the file is wholly its own output.
    write(dir, 'blueprint.config.mjs', configSource({
      ...reactPreset({ name: 'fixture' }),
      emit: { agents: ['claude'] },
    }));

    const second = await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(second.code).toBe(0);
    expect(second.output).toContain('stale agent contract');
    expect(read(dir, 'AGENTS.md')).toBeNull();
    expect(read(dir, 'CLAUDE.md')).toContain('<!-- BLUEPRINT:START -->');
  });
});

describe('one story per state — the tools do not contradict each other (field run #10)', () => {
  it('doctor never claims a baseline on a truly clean repo', async () => {
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--structure', 'flat', '--no-install']);
    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));

    const doctor = await cli(dir, ['doctor']);

    expect(doctor.code).toBe(0);
    // Clean with no ledger: inspect says "no baseline needed", so doctor
    // must not answer the same state with "covered by the baseline".
    expect(doctor.output).toContain('architecture clean');
    expect(doctor.output).not.toContain('covered by the baseline');

    const update = await cli(dir, ['inspect', '--update-baseline']);

    expect(update.code).toBe(0);
    expect(update.output).toContain('no baseline needed');
  });

  it('the CLI and the playbook give the size gate one name and one number', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    const init = await cli(dir, ['init', '--authoring', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).toContain('below the brownfield threshold (10 source files)');
    expect(init.output).not.toContain('preset threshold');
    expect(read(dir, 'blueprint-authoring.md')).toContain('brownfield threshold (10)');
  });
});

describe('survey counts never promise what impact must measure (field issue #11)', () => {
  it('playbook and survey call the same-folder count an upper bound, not exact', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        // A same-folder alias reference inside a test file — counted by the
        // survey's textual scan, exempt in the emitted config: the exact
        // shape that made "exactly how many errors" provably false (5 ≠ 0).
        'src/services/api.ts': 'export const api = 1;',
        'src/services/client.test.ts': 'import \'~app/services/api\';',
        'tsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
      },
    });

    const init = await cli(dir, ['init', '--authoring', '--no-install']);

    expect(init.code).toBe(0);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('an upper bound on the errors');
    expect(playbook).not.toContain('exactly how many');

    const survey = await cli(dir, ['survey']);

    expect(survey.output).toContain('Same-folder imports via the alias (textual upper bound');
  });

  it('a draft config that declares a layout and no entry validates and runs', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'src/components/Button.tsx': 'export const Button = 1;',
        // Hand-written draft-first config — the field shape that tripped on
        // "private is required": a half-declared shape is complete.
        'blueprint.config.mjs': [
          'export default {',
          '  framework: \'react\',',
          '  architecture: {',
          '    alias: \'~app\',',
          '    layers: [{ name: \'components\', does: \'render UI\', layout: \'file\' }],',
          '  },',
          '  rules: {},',
          '};',
          '',
        ].join('\n'),
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(0);
    expect(inspect.output).not.toContain('entry');
  });

  it('a 3.x config still carrying architecture.module is told where the shape went', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'src/components/Button.tsx': 'export const Button = 1;',
        // The shape every 3.x adopter has on disk. `rejectUnknownKeys` would
        // answer "nothing reads it", which is true and useless — the field did
        // not go dead, it moved, and a flat project must make the same edit.
        'blueprint.config.mjs': [
          'export default {',
          '  framework: \'react\',',
          '  architecture: {',
          '    alias: \'~app\',',
          '    layers: [{ name: \'components\', does: \'render UI\' }],',
          '    module: { layout: \'folder\', entry: \'index\', private: [\'hooks\'] },',
          '  },',
          '  rules: {},',
          '};',
          '',
        ].join('\n'),
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('moved onto each layer in 4.0.0');
    expect(inspect.output).toContain('flat project');
  });
});

describe('a misplaced key fails loud instead of dying silently (field issue #14)', () => {
  it('layer-level selfOnly errors with the pointed fix — the field config verbatim', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        // The 489-file field repo's shape: selfOnly on the layer object,
        // where nothing reads it — the intended re-export ban silently
        // never existed and every gate stayed green.
        'blueprint.config.mjs': [
          'export default {',
          '  framework: \'react\',',
          '  architecture: {',
          '    alias: \'~app\',',
          '    layers: [',
          '      { name: \'views\', does: \'pages\' },',
          '      { name: \'contexts\', does: \'seam\', selfOnly: true, allowedImporters: [\'views\'] },',
          '    ],',
          '  },',
          '  rules: {},',
          '};',
          '',
        ].join('\n'),
        'src/views/home.tsx': 'export const home = 1;',
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('Unknown key "selfOnly"');
    expect(inspect.output).toContain('allowedImporters ENTRY');
  });

  it('rules states whether THIS config emits each structural rule', async () => {
    // reactBlueprint declares no selfOnly importer — the catalog must say
    // its no-restricted-syntax is not emitted, instead of listing it
    // statically while emitLint disagrees.
    const dir = repo({
      packageJson: react(),
      files: { 'blueprint.config.mjs': configSource(reactBlueprint) },
    });

    const rules = await cli(dir, ['rules']);

    expect(rules.code).toBe(0);
    expect(rules.output).toContain('· not emitted');
    expect(rules.output).toContain('✓ emits');

    const json = await cli(dir, ['rules', '--json']);
    const parsed = JSON.parse(json.output) as { structural: { rule: string; active: boolean }[] };

    expect(parsed.structural.find((row) => row.rule === 'no-restricted-syntax')?.active).toBe(false);
    expect(parsed.structural.find((row) => row.rule === 'no-restricted-imports')?.active).toBe(true);
  });
});

describe('doctor and the playbook define "done" identically (field issue #13)', () => {
  it('doctor stays red while authoring artifacts remain, green once deleted', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    // The early-exit route: playbook written, preset scaffolded over it.
    await cli(dir, ['init', '--authoring', '--no-install']);
    await cli(dir, ['init', '--structure', 'flat', '--preset', '--no-install']);
    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));

    // Wiring is complete but the playbook still sits on disk — the state
    // where doctor used to say "Adoption complete" and a careless agent
    // stopped, leaving blueprint-authoring.md in the repo forever.
    const mid = await cli(dir, ['doctor']);

    expect(mid.code).toBe(1);
    expect(mid.output).toContain('blueprint-authoring.md');
    expect(mid.output).toContain('the playbook\'s final step deletes them');

    rm(`${dir}/blueprint-authoring.md`);
    rm(`${dir}/.claude/commands/blueprint-author.md`);

    const done = await cli(dir, ['doctor']);

    expect(done.code).toBe(0);
    expect(done.output).toContain('6 of 7 checks passed');
    expect(done.output).not.toContain('blueprint-authoring.md');
  });

  it('the missing-layer note reads as runway, never as a todo', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'blueprint.config.mjs': configSource(reactBlueprint) },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(0);
    // Six of these once sent an agent toward deleting the preset skeleton —
    // the note itself now carries the keep-is-default verdict.
    expect(inspect.output).toContain('runway, not a todo');
    expect(inspect.output).toContain('slimming is the owner\'s call');
  });
});

describe('one output, one story — no snippet contradicts its own prose (field issue #12)', () => {
  it('impact names a vacuous zero instead of a reassuring one', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactBlueprint),
        // Source exists, but nothing under a declared layer — the state
        // inspect already warns about; impact must tell the same story.
        'src/App.jsx': 'export const App = () => null;',
      },
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('0 hits — vacuous: the layer globs match no files');
    // "No red" is an emitLint claim — the anti-bypass guard is outside
    // impact's scope, and a field agent nearly shipped on the headline
    // alone (field issue #17): the zero line states its own reach.
    expect(impact.output).toContain('scope: emitLint only');
  });

  it('the wiring snippet on a TS repo is the TS version, not prose-corrected JS', async () => {
    const dir = repo({
      packageJson: {
        name: 'fixture',
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      },
      files: {
        'eslint.config.mjs': 'export default [];',
        'src/App.tsx': 'export const App = () => null;',
      },
    });

    const init = await cli(dir, ['init', '--structure', 'flat', '--preset', '--no-install']);

    expect(init.code).toBe(0);

    expect(init.output)
      .toContain('...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports }) ];');

    expect(init.output).not.toContain('On a TypeScript');
  });

  it('the authoring hand-off promises a baseline only if debt exists', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    const init = await cli(dir, ['init', '--authoring', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).toContain('locking a baseline only when debt exists');
    expect(init.output).not.toContain('and locking a baseline):');
  });
});

describe('selfOnly survives every esquery, and the fold gets its selectors (batch 13)', () => {
  const selfOnly: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'views', does: 'pages' },
        {
          name: 'contexts',
          does: 'shared state',
          allowedImporters: [{ layer: 'views', selfOnly: true }],
        },
      ],
    },
  };

  const emittedSelectors = () =>
    emitLint(selfOnly)
      .flatMap((entry) =>
        (entry.rules?.['no-restricted-syntax'] as unknown[] | undefined)?.slice(1) ?? [])
      .map((item) => (item as { selector: string }).selector);

  it('the emitted selector parses and matches on esquery 1.6 — the crash line', () => {
    // esquery below 1.7 has no `\/` escape in its regex literal: the old
    // selector truncated to `^~app\` and threw "Invalid regular expression"
    // on EVERY file of the layer — killing the project's own `eslint .` and
    // `blueprint impact` alike (field issue #19). The pinned legacy version
    // is the regression guard; this repo's own esquery is too new to crash.
    const legacy = createRequire(import.meta.url)('esquery-legacy') as {
      parse: (selector: string) => unknown;
      matches: (node: object, ast: unknown) => boolean;
    };

    const selectors = emittedSelectors();

    expect(selectors).toHaveLength(1);

    for (const selector of selectors) {
      const ast = legacy.parse(selector);

      const ban = (value: string) =>
        legacy.matches({ type: 'ExportAllDeclaration', source: { type: 'Literal', value } }, ast);

      expect(ban('~app/contexts/user')).toBe(true);
      expect(ban('~app/hooks/useX')).toBe(false);
    }
  });

  it('impact reports the re-export instead of crashing', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(selfOnly),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'src/contexts/user.jsx': 'export const user = 1;',
        'src/views/Home.jsx': 'export { user } from \'~app/contexts/user\';\n',
      },
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('no-restricted-syntax');
    expect(impact.output).toContain('Home.jsx');
  });

  it('rules carries the selectors a fold needs — no emitLint dump (field issue #20)', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'blueprint.config.mjs': configSource(selfOnly) },
    });

    const json = await cli(dir, ['rules', '--json']);

    const parsed = JSON.parse(json.output) as {
      bans: {
        layer: string;
        selfOnly: { target: string; selectors: string[]; jsLiteral: string[]; note: string }[];
      }[];
    };

    const views = parsed.bans.find((entry) => entry.layer === 'views');

    expect(views?.selfOnly[0].target).toBe('contexts');
    expect(views?.selfOnly[0].selectors).toEqual(emittedSelectors());

    // The paste form, end to end through the CLI: a rendered selector loses its
    // / escape inside a JS string literal and the regex then ends at the bare
    // `/` — silently, lint green (field run #125). Parsing the literal is what the
    // paste does, so this asserts the round trip rather than the spelling.
    expect(views?.selfOnly[0].jsLiteral.map((literal) => JSON.parse(literal) as string))
      .toEqual(emittedSelectors());

    expect(JSON.parse(`"${emittedSelectors()[0]}"`)).not.toBe(emittedSelectors()[0]);

    // The text catalog prints the same strings — an agent without --json
    // still never needs to dump emitLint.
    const text = await cli(dir, ['rules']);

    expect(text.output).toContain('Paste these verbatim, quotes included');
    expect(text.output).toContain(views?.selfOnly[0].jsLiteral[0]);
    // And the caveat is in BOTH shapes, from one string. It reached only the text
    // form for three releases, so #117 raised the doubt #23 had already answered —
    // through `--json`, which is where the playbook's merge step sends a fold.
    expect(text.output).toContain(views?.selfOnly[0].note);
  });
});

describe('merge caveats meet the agent at the point of need (batch 14)', () => {
  it('init names TS7016 and its remedies when the existing config is eslint.config.ts', async () => {
    // The field repo's eslint.config.ts sat in a tsconfig without allowJs:
    // importing ./blueprint.config.mjs turned the repo's own tsc gate red,
    // and the fix was the agent's invention — init knew the stack and the
    // config shape but never said it (field issue #22).
    const dir = repo({
      packageJson: {
        name: 'fixture',
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      },
      files: {
        'eslint.config.ts': 'export default [];',
        'src/App.tsx': 'export const App = () => null;',
      },
    });

    const init = await cli(dir, ['init', '--structure', 'flat', '--preset', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).toContain('TS7016');
    expect(init.output).toContain('allowJs');
    expect(init.output).toContain('blueprint.config.d.mts');
  });

  it('the early-exit checklist orders a real lint run and a real build run', async () => {
    // Two runs in the same batch added the build check by hand: init edits
    // tsconfig/vite for the alias, and doctor's alias check reads wiring as
    // text — the "only a real run proves it" logic has to cover both edits
    // (field issues #21–#22).
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('only a real run proves the config loads');
    expect(playbook).toContain('build once too');
    expect(playbook).toContain('never as a compile');
  });
});

describe('the file default is real — module is optional (batch 15)', () => {
  it('a config that never mentions module validates and inspects clean', async () => {
    // The field shape verbatim: Method step 5 said "plain files → the file
    // default", validation demanded module.entry — two edit-run cycles plus
    // a deliberate repro before the agent could prove the tool contradicted
    // itself (field issue #23).
    const noModule: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [{ name: 'components', does: 'render UI' }],
      },
    };

    const bare = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(noModule),
        'src/components/Button.jsx': 'export const Button = 1;',
      },
    });

    const inspect = await cli(bare, ['inspect']);

    expect(inspect.code).toBe(0);
    expect(inspect.output).not.toContain('module.entry');

    // Partial declaration — the exact second repro from the field.
    const layoutOnly = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource({
          ...noModule,
          architecture: {
            ...noModule.architecture,
            layers: [{ name: 'components', does: 'render UI', layout: 'file' }],
          },
        }),
        'src/components/Button.jsx': 'export const Button = 1;',
      },
    });

    expect((await cli(layoutOnly, ['inspect'])).code).toBe(0);
  });

  it('an empty entry still fails loud, now naming the default as the way out', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource({
          framework: 'react',
          architecture: {
            alias: '~app',
            layers: [{ name: 'components', does: 'render UI', entry: '' }],
          },
        }),
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('omit it for the');
  });

  it('the playbook sketch says the module shape keys are optional', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('declare neither key');
    expect(playbook).toContain('Omitting both keys IS the');
  });
});

describe('init and doctor tell one alias story; integrated contracts stay fresh (batch 16)', () => {
  it('a tsconfig-paths bridge plugin silences the vite instruct — init agrees with doctor (field #25)', async () => {
    // The field repo: alias in tsconfig paths, vite-tsconfig-paths bridging
    // it — init still said "add resolve.alias" while doctor passed the same
    // state untouched. Two authorities, two verdicts, minutes of probing.
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactBlueprint),
        'tsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'vite.config.ts': 'import tsconfigPaths from \'vite-tsconfig-paths\';\n'
          + 'export default { plugins: [tsconfigPaths()] };\n',
        'src/components/Button.jsx': 'export const Button = 1;',
      },
    });

    const init = await cli(dir, ['init', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).not.toContain('resolve.alias');

    const doctor = await cli(dir, ['doctor']);

    expect(doctor.output).toContain('✓ import alias wired to the toolchain');
  });

  it('a marker-integrated CLAUDE.md is refreshed by the next init (field #26)', async () => {
    // The field repro inverted: the reference now ships WITH its markers, so
    // a verbatim integration keeps the block refreshable — the run that
    // integrated by guesswork ended with a permanently stale layer flow.
    // (First init scaffolds the config instead of loading one: an in-process
    // ESM import of blueprint.config.mjs would be cached across cli() calls,
    // which real per-process runs never hit.)
    const dir = repo({
      packageJson: react(),
      files: {
        'CLAUDE.md': '# My app\n\nhand-written notes\n',
        'src/components/Button.jsx': 'export const Button = 1;',
      },
    });

    const init = await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).toContain('KEEP the');

    const reference = read(dir, 'CLAUDE.blueprint.md') ?? '';

    expect(reference.startsWith('<!-- BLUEPRINT:START -->')).toBe(true);

    // Integrate verbatim (markers included), delete the reference, then
    // change the config — the exact sequence that went stale in the field.
    write(dir, 'CLAUDE.md', `# My app\n\nhand-written notes\n\n${reference}`);
    rm(`${dir}/CLAUDE.blueprint.md`);

    write(dir, 'blueprint.config.mjs', configSource({
      ...reactBlueprint,
      architecture: {
        ...reactBlueprint.architecture,
        layers: [
          { name: 'components', does: 'render UI' },
          { name: 'api', does: 'data access' },
        ],
      },
    }));

    const second = await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(second.code).toBe(0);

    const merged = read(dir, 'CLAUDE.md') ?? '';

    expect(merged).toContain('hand-written notes'); // outside the markers — untouched
    expect(merged).toContain('`api`'); // inside the markers — refreshed
    expect(merged).not.toContain('`containers`'); // the scaffold-era flow is gone
  });
});

describe('an offset additional alias really joins the bans (batch 19)', () => {
  // Field issue #29: additionalAliases: { '~root': '.' } emitted
  // `~root/<layer>` patterns no real import ever used — the whole ~root
  // leg of every structural ban was a silent no-op, inspect was equally
  // blind, and the closing report almost claimed a protection that did
  // not exist.
  const rooted: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      additionalAliases: { '~root': '.' },
      layers: [
        { name: 'views', does: 'pages' },
        {
          name: 'contexts',
          does: 'shared state',
          allowedImporters: [{ layer: 'views', selfOnly: true }],
        },
      ],
    },
  };

  const spec = (): RepoSpec => ({
    packageJson: react(),
    files: {
      'blueprint.config.mjs': configSource(rooted),
      'jsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~app/*': ['./src/*'], '~root/*': ['./*'] } },
      }),
      'src/contexts/user.jsx': 'export const user = 1;',
      'src/views/Home.jsx': 'export { user } from \'~root/src/contexts/user\';\n',
    },
  });

  it('impact and inspect both flag the ~root/src re-export', async () => {
    const impact = await cli(repo(spec()), ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('no-restricted-syntax');
    expect(impact.output).toContain('Home.jsx');

    const inspect = await cli(repo(spec()), ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('selfonly-reexport');
  });

  it('rules prints the offset selectors a fold would copy', async () => {
    const json = await cli(repo(spec()), ['rules', '--json']);

    const parsed = JSON.parse(json.output) as {
      bans: { layer: string; selfOnly: { selectors: string[] }[] }[];
    };

    const selectors = parsed.bans
      .find((entry) => entry.layer === 'views')?.selfOnly[0]?.selectors ?? [];

    expect(selectors.some((selector) => selector.includes('~root\\u002Fsrc\\u002Fcontexts'))).toBe(true);
  });
});

describe('locked debt stays green under the baseline ratchet (field issue #10)', () => {
  it('inspect --baseline suppresses locked debt — the live-verified repro', async () => {
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--no-install']);
    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));

    // The field repro: create debt, lock it, then run the gate line.
    // Code inside a declared layer first, so the repo is a brownfield tree with one
    // stray rather than a tree that is ENTIRELY the stray — the latter is a total
    // structure mismatch (1 of 1 folders undeclared, every declared layer absent)
    // and locks a second finding that has nothing to do with the ratchet.
    write(dir, 'src/components/Card/index.tsx', 'export const Card = 1;');
    write(dir, 'src/random/x.ts', 'export const x = 1;'); // undeclared folder → error

    expect((await cli(dir, ['inspect'])).code).toBe(1);
    expect((await cli(dir, ['inspect', '--update-baseline'])).code).toBe(0);

    const gate = await cli(dir, ['inspect', '--baseline']);

    // Plain inspect stays red forever on debt the tool itself told the adopter
    // to lock; --baseline is the one uniform gate line that treats a missing
    // ledger as empty and locked debt as suppressed.
    expect(gate.code).toBe(0);
    expect(gate.output).toContain('1 baselined finding(s) suppressed');
  });
});

describe('init output reads correctly when skimmed (field issues #34, #36)', () => {
  it('a deletion does not wear the writes\' ✓', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    // A plain init leaves a pristine preset scaffold; --authoring reclaims it
    // so the playbook can author the real one.
    expect((await cli(dir, ['init', '--structure', 'flat', '--no-install'])).code).toBe(0);

    const authoring = await cli(dir, ['init', '--authoring', '--no-install']);

    expect(authoring.code).toBe(0);
    // The field agent filtered init's output for `write` and missed its own
    // config being reclaimed, then spent commands hunting the disappearance.
    // The cause was always in the note; the mark is what makes the line stop
    // a skimming reader.
    expect(authoring.output).toContain('− rm: blueprint.config.mjs (pristine preset scaffold');
    expect(authoring.output).not.toContain('✓ rm:');
    expect(authoring.output).toContain('✓ write: blueprint-authoring.md');
  });

  it('the install line does not stutter its own kind', async () => {
    const dir = repo({ packageJson: react() });

    const plan = await cli(dir, ['init', '--structure', 'flat', '--dry-run']);

    expect(plan.code).toBe(0);
    expect(plan.output).toContain('would install: eslint,');
    expect(plan.output).not.toContain('install: install');
  });
});

describe('the playbook only invites tools that run yet (field issue #35)', () => {
  it('impact is named as post-init, not part of the drafting loop', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    expect((await cli(dir, ['init', '--authoring', '--no-install'])).code).toBe(0);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    // Both brownfield agents of this run read "inspect and impact are
    // read-only and cheap" as licence to run impact while drafting — impact
    // lints, so it needs the plugins init installs, and greeted them with a
    // load error instead. inspect is the drafting-loop tool; impact joins at
    // step 9.
    expect(playbook).toContain('then let `inspect` correct you');
    expect(playbook).toContain('but is NOT available at this point');
    expect(playbook).toContain('joins the loop at Method step 10');
    expect(playbook).not.toContain('`inspect` and `impact` are read-only');
    // The drafting-loop step names inspect alone; impact appears only with
    // init in front of it. (The dep failure itself cannot be staged here —
    // this suite supplies the real plugins by design; impact.test.ts owns
    // the message.)
    expect(playbook).toContain('Validate — the loop that keeps you honest.** Run `npx blueprint inspect`.');
  });
});

describe('the required deps install on the stack the project is on (field issues #37, #41)', () => {
  it('importBlock rides import-x — config, install set and catalog agree', async () => {
    const dir = repo({ packageJson: react({ typescript: '^5.0.0' }) });

    const init = await cli(dir, ['init', '--structure', 'flat', '--no-install']);

    expect(init.code).toBe(0);
    // npm resolves the required-deps list as a unit, so one carrier the
    // project cannot satisfy fails the whole install and leaves init's plan
    // half-applied. eslint-plugin-import caps its eslint peer at 9 (#37), so
    // it cannot be installed at all on this baseline. import-x peers on
    // @typescript-eslint/utils@^8.56 (#41) — allowed deliberately now that
    // the baseline is ESLint 10, which no tree reaches while holding
    // typescript-eslint below 8.56; see ALLOWED_CARRIER_PEERS. The stack
    // fixtures below are what would catch that reasoning being wrong.
    expect(init.output).toContain('eslint-plugin-import-x');
    expect(init.output).not.toContain('eslint-plugin-import-lite');
    expect(init.output).not.toContain(' eslint-plugin-import ');

    const config = read(dir, 'eslint.config.mjs') ?? '';

    expect(config).toContain('import imports from \'eslint-plugin-import-x\';');

    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));

    const rules = await cli(dir, ['rules']);

    expect(rules.output).toContain('importBlock → import-x/first + import-x/no-duplicates');
  });

  it('the emitted import-x rules actually fire under the real eslint', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactPreset({ name: 'fixture' })),
        // Both importBlock mistakes, in a declared layer: a module imported
        // twice, and an import sitting below code.
        'src/components/Dup.jsx':
          'import { a } from \'./m\';\n'
          + 'import { b } from \'./m\';\n'
          + 'export const Dup = () => [a, b];\n',
        'src/components/Late.jsx':
          'export const x = 1;\n'
          + 'import { c } from \'./m\';\n'
          + 'export const Late = () => c;\n',
      },
    });

    // impact lints with the emitted config through the project's own eslint,
    // so a carrier swap that only looked right in the generated text would
    // report zero here instead of the two hits below.
    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('import-x/no-duplicates');
    expect(impact.output).toContain('import-x/first');
  });
});

describe('a merge that drops a carrier cannot pass doctor (field issue #40)', () => {
  it('the ✓ states its own scope instead of implying every rule is alive', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactBlueprint),
        'eslint.config.mjs': wiredEslintConfig(reactBlueprint),
        'src/components/A.jsx': 'export const A = 1;\n',
      },
    });

    const doctor = await cli(dir, ['doctor']);

    // A bare "emitted rules survive" read as a promise about ALL of them; the
    // field agent trusted it over a merge that had silently lost ~68 rules.
    expect(doctor.output).toContain('emitted rules survive the merged eslint config (');
    expect(doctor.output).toContain('thresholds, package-ownership entries, and a merged entry');

    // The reach, not just the rule families: the check resolves one path per layer, so
    // an entry that replaces blueprint's on PART of a layer passes — the probe lands on
    // a sibling that still carries the selectors. `pickProbes` said "sample, not a
    // proof" in a source comment; the adopter reading the ✓ never saw it.
    expect(doctor.output).toContain('one probe per emitted entry');
    expect(doctor.output).toContain('scoped to only part of one entry\'s files are not compared');
  });

  it('the playbook names --print-config, the step both field runs invented', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = (read(dir, 'blueprint-authoring.md') ?? '').replace(/\s+/g, ' ');

    // Two independent runs reached for it unprompted — one to catch a dropped
    // plugin, one to check their own house rules had survived. It was the
    // missing step in a verification the playbook called sufficient.
    expect(playbook).toContain('npx eslint --print-config');
    expect(playbook).toContain('A green lint is not proof the gates are ATTACHED');
    expect(playbook).toContain('proves only that the config parses');
  });

  it('points --print-config at the remainder, not at what doctor already does', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = (read(dir, 'blueprint-authoring.md') ?? '').replace(/\s+/g, ' ');

    // The step landed in the same commit that widened doctor to verify carrier
    // survival, so the playbook was asking for a sweep the gate already ran —
    // two field runs noticed the overlap (#43, #44).
    expect(playbook).toContain('you do not need to print configs by hand on this path');
    expect(playbook).toContain('the survival of your OWN rules');

    // Three ways a correct config reads as broken through this command. Each
    // cost a field agent a detour: a bare rule name looked MISSING, an unarmed
    // layer looked dropped, and selfOnly looked absent from the wrong layer.
    expect(playbook).toContain('never bare `max-len`');
    expect(playbook).toContain('does not appear at all');
    expect(playbook).toContain('resolves on the IMPORTER layer');
  });

  it('says why the carriers install even with no gate declared', async () => {
    const dir = repo({
      packageJson: react(),
      files: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`src/components/C${i}.jsx`, `export const c${i} = 1;`]),
      ),
    });

    await cli(dir, ['init', '--no-install']);

    const playbook = (read(dir, 'blueprint-authoring.md') ?? '').replace(/\s+/g, ' ');

    // Three separate runs paused on "I declared no gates, why is it installing
    // these" — harmless, but unstated. The reason is the one-line upgrade path.
    expect(playbook).toContain('Declared no gates from those families?');
    expect(playbook).toContain('deliberate, not over-installation');
  });
});

describe('one violation, one name per channel (field issue #48)', () => {
  it('inspect names the rule that carries each finding, through the real CLI', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource({
          ...reactBlueprint,
          architecture: {
            ...reactBlueprint.architecture,
            layers: reactBlueprint.architecture.layers.map((l) => ({ ...l, layout: 'folder' as const })),
          },
        }),
        'src/components/Card/index.js': 'export const Card = 1;\n',
        'src/components/Card/inner.js': 'export const inner = 1;\n',
        // Reaches inside a folder-layout module — inspect's [deep-import],
        // emitted as one more pattern group on no-restricted-imports.
        'src/services/api.js': 'import { inner } from \'~app/components/Card/inner\';\nexport const api = inner;\n',
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.output).toContain('[deep-import]');
    // The bridge: searching a resolved config for `blueprint/deep-import`
    // finds nothing, because the ban folds into no-restricted-imports. The
    // finding says so itself now.
    expect(inspect.output).toContain('(lint: no-restricted-imports)');
  });

  it('the playbook warns that finding names are not rule ids', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = (read(dir, 'blueprint-authoring.md') ?? '').replace(/\s+/g, ' ');

    expect(playbook).toContain('inspect\'s finding names are not ESLint rule ids');
    expect(playbook).toContain('finds nothing and proves nothing');
  });
});

describe('"ONE entry" is per collision, not per rule key (field issue #51)', () => {
  it('the playbook scopes the combine instruction to the entry you actually collide with', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'src/App.jsx': 'export const App = () => null;' },
    });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = (read(dir, 'blueprint-authoring.md') ?? '').replace(/\s+/g, ' ');

    // A selfOnly layer emits its ban on EVERY importer layer, so one rule key
    // owns several scoped entries. "Combine into ONE entry", read literally
    // against a house rule overlapping just one of them, imposes that rule on
    // files it never governed.
    expect(playbook).toContain('"ONE entry" means one per COLLISION, not one for the whole rule key');
    expect(playbook).toContain('emits `no-restricted-syntax` on BOTH importer layers');
    expect(playbook).toContain('leave the others exactly as emitted');
    // ONE wrong turn, not two. This case used to name narrowing as the silent
    // twin of widening — "a replaced entry and a deleted ban" — and #163 is an
    // agent acting on it. A narrow entry replaces nothing on the files it does
    // not match, so the excluded layers keep what the spread emitted.
    expect(playbook).toContain('is the way to get this wrong');
    expect(playbook).toContain('Scoping it narrowly is NOT the opposite error');
    expect(playbook).not.toContain('narrowing it to exclude them');
    // And the gate that catches the loss that IS real, so the warning does not
    // read as "be careful".
    expect(playbook).toContain('probes every layer separately and names the one that lost its selectors');
  });
});

describe('the handbook does not promise a gate that does not exist (field issue #52)', () => {
  it('a generated handbook marks which machine holds each declared rule', async () => {
    const dir = repo({ packageJson: react() });

    expect((await cli(dir, ['init', '--structure', 'flat', '--no-install'])).code).toBe(0);

    const handbook = read(dir, 'docs/architecture-handbook.md') ?? '';

    // The handbook is the artifact meant to outlive the adoption, read by
    // people who will not have `blueprint rules` open beside it. It printed
    // `error` beside every declared rule under "`error` fails lint" — true of
    // most, false of cycles (inspect's finding) and deadCode (knip's job).
    expect(handbook).toContain('| Rule | Tier | Option | Enforced by |');
    expect(handbook).not.toContain('`error` fails lint · `warn` is advisory');
    expect(handbook).toContain('The tier is what the enforcing machine does with a violation');

    // The preset declares cycles; whatever else it declares, no row may claim
    // lint enforcement for a rule the lint config never carries.
    const rows = handbook.split('\n').filter((line) => line.startsWith('| `'));
    const cycles = rows.find((line) => line.startsWith('| `cycles`'));

    expect(cycles).toContain('`blueprint inspect`');
    expect(cycles).not.toContain('| lint |');
  });
});

/**
 * The two relative-import gates once read the same `../Sibling` differently —
 * `structure-lint`'s folder layout meant entry-only, blueprint's meant "the
 * neighbour is untouchable", and an adopting agent carried the stricter
 * reading across without noticing the names had drifted. Fifteen imports that
 * had always worked were filed as pre-existing debt, and the only remedy the
 * output offered was "extract to a lower layer" — the first stone of a
 * `utils/` junk drawer. Folder layout is entry-only now, on both gates.
 */
describe('a folder layer shares by the sibling entry, not by sinking (cards)', () => {
  const cards: Blueprint = {
    name: 'cards',
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'components', does: 'ui', layout: 'folder' },
        { name: 'hooks', does: 'stateful units', layout: 'folder' },
      ],
    },
  };

  const at = (files: Record<string, string>): RepoSpec => ({
    packageJson: react(),
    files: {
      'blueprint.config.mjs': configSource(cards),
      'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
      'src/hooks/useBreakpoint/index.jsx': 'export const useBreakpoint = () => 1;',
      'src/hooks/useBreakpoint/media.jsx': 'export const media = 1;',
      ...files,
    },
  });

  it('accepts a sibling by its entry', async () => {
    const dir = repo(at({
      'src/hooks/useCardsAnimate/index.jsx':
        'import { useBreakpoint } from \'../useBreakpoint\';\nexport default useBreakpoint;\n',
    }));

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.output).not.toContain('relative-escape');
  });

  it('refuses to reach past it, and names the entry to use instead', async () => {
    const dir = repo(at({
      'src/hooks/useCardsAnimate/index.jsx':
        'import { media } from \'../useBreakpoint/media\';\nexport default media;\n',
    }));

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.output).toContain('relative-escape');
    expect(inspect.output).toContain('index');
  });
});

/**
 * A merged `no-restricted-syntax` entry rebuilt from `rules --json` carried
 * the selectors and nothing else, because selectors were all that output had.
 * The emitted block also exempts test files, so the rebuilt entry started
 * governing them: 34 errors in one test file when the adopter's own rule
 * collided there — and, where nothing collides, blueprint's own selfOnly ban
 * quietly reaching tests behind a green lint (field issue #60). Both halves
 * of the entry now come from the same command.
 */
describe('the merge recipe hands over the whole entry, not just its selectors (#60)', () => {
  const selfOnly: Blueprint = {
    name: 'merge',
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'views', does: 'screens' },
        { name: 'contexts', does: 'shared state', allowedImporters: [{ layer: 'views', selfOnly: true }] },
      ],
    },
  };

  const dir = (): string => repo({
    packageJson: react(),
    files: { 'blueprint.config.mjs': configSource(selfOnly) },
  });

  it('carries the test exemption in --json, beside the selectors it belongs to', async () => {
    const out = await cli(dir(), ['rules', '--json']);
    const views = JSON.parse(out.output).bans.find((b: { layer: string }) => b.layer === 'views');

    expect(views.selfOnly[0].selectors.length).toBeGreaterThan(0);

    expect(views.testExemptions).toEqual(
      expect.arrayContaining([expect.stringContaining('*.test.')]),
    );
  });

  it('prints the ignores line to paste, next to the selectors to copy', async () => {
    const out = await cli(dir(), ['rules']);

    expect(out.output).toContain('Paste these verbatim, quotes included');
    expect(out.output).toContain('ignores: [');
    expect(out.output).toContain('*.test.');
  });
});

describe('a claim states the condition it needs (field runs #95–#97)', () => {
  const brownfield = (): RepoSpec => ({
    packageJson: react(),
    files: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`src/legacy/mod${i}.js`, 'export const x = 1;\n']),
    ),
  });

  const playbookOf = async (spec: RepoSpec): Promise<string> => {
    const dir = repo(spec);

    await cli(dir, ['init', '--authoring', '--no-install']);

    return read(dir, 'blueprint-authoring.md') ?? '';
  };

  it('releases a single-config reader from the selfOnly collision note', async () => {
    // #75–#77 taught this note to say the ENTRY is live even when the ban is a blank.
    // It said so as "it collides today" — but a collision needs a SECOND entry of the
    // id, which only a merge brings. On the early-exit path there is one generated
    // config and nothing to collide with, and a field agent spent the item deciding
    // the note did not apply to it. inspect cannot see whether a merge is coming, so
    // the note carries the condition instead of asserting the consequence.
    const dir = repo({
      packageJson: react(),
      files: { 'src/components/Button.jsx': 'export const Button = () => null;\n' },
    });

    write(dir, 'blueprint.config.mjs', configSource({
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [
          { name: 'components', does: 'render UI' },
          { name: 'contexts', does: 'state', allowedImporters: [{ layer: 'components', selfOnly: true }] },
        ],
      },
    }));

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.output).toContain('IF a second no-restricted-syntax');
    expect(inspect.output).toContain('That condition is the whole note');
    expect(inspect.output).toContain('nothing here to act on');
  });

  it('writes the syntax for the gate value it asks you to carry', async () => {
    // The playbook tells you to translate a house threshold by carrying its value, and
    // no channel — playbook, `rules` catalog, error text — showed the shape. A field
    // agent could not tell `{ value: 1200 }` from `['error', 1200]` and routed around
    // the instruction. The object form stays a comment: the `rules:` line is copied
    // verbatim, and a gate nobody is translating is the owner's tuning, not adoption's.
    const playbook = await playbookOf(brownfield());

    expect(playbook).toContain('maxLines: { tier: \'error\', value: 1200 }');
    expect(playbook).toContain('`tier` is required in that form');
    expect(playbook).toContain('rules: { cycles: \'error\', unusedVars: \'error\' },');
  });

  it('resolves a scope mismatch by the collision, not by widening either side', async () => {
    // #163: the answer used to be "match blueprint's glob", justified by an asymmetry
    // that is false — narrowing the hand-written entry cannot make blueprint's ban lose
    // a file, because the spread still carries it wherever that entry does not match.
    // An agent followed the instruction and took 38 errors in one test file for it.
    // Measured per direction in renderCombinedEntry's doc comment.
    const playbook = await playbookOf(brownfield());

    expect(playbook).toContain('do not reconcile them — the collision is the entry');
    expect(playbook).toContain('leave your original entry in place');
    expect(playbook).toContain('Three entries then cover three sets');

    // The arrangement is order-dependent, and the constraint is carried by the entry
    // the reader writes: last in the array is after the spread and after their own
    // entry both. Stated as "move your own entry up" instead — which this paragraph
    // said first — it satisfies the same ordering by silently re-deciding every OTHER
    // rule key that entry sets; measured, one that also set `no-restricted-imports`
    // flips to blueprint's paths on the move. That remedy must not come back.
    expect(playbook).toContain('combined one last, yours wherever it already sits');
    expect(playbook).toContain('is the wrong repair');
    expect(playbook).not.toContain('has to stay ABOVE the combined entry');
    expect(playbook).not.toContain('has to move up');

    // Two probes in the affected layer, not one: the recommended shape makes files
    // in a single layer resolve different entries on purpose, and doctor resolves
    // one path per layer — its own ✓ says a part-of-a-layer entry is not compared.
    expect(playbook).toContain('takes TWO probes rather than one');
    expect(playbook).toContain('a file INSIDE the collision and a file OUTSIDE it');

    // The mechanism the instruction rests on, and the qualifier that makes it true.
    // Without these the recommendation reads as a preference a reader can trade away.
    expect(playbook).toContain('on the files both of them match');
    expect(playbook).toContain('an entry does nothing at all to a file outside its own');
    expect(playbook).toContain('Scoping it narrowly is NOT the opposite error');

    // The two losses that ARE silent, so correcting the false one does not read as
    // "scope no longer matters". Neither is about how wide the entry is.
    expect(playbook).toContain('the two silent losses are about what the entry CONTAINS');
    expect(playbook).toContain('Fold your own original entry away');

    // The old wording asserted the inverted asymmetry. It must not survive anywhere.
    expect(playbook).not.toContain('the SAME file scope');
    expect(playbook).not.toContain('failure directions are not symmetric');
    expect(playbook).not.toContain('widen yours to blueprint\'s glob');
  });

  it('counts a drawn diagram as part of what the document says', async () => {
    // The stale-vs-runway tiebreak asked whether the prose mentions the layer. A field
    // agent read the per-layer sections, found nothing, and dropped a clause the same
    // file's mermaid graph was still drawing — the tiebreak decided on half the
    // evidence. And once a clause IS downgraded, the drawing disagrees with the config:
    // that is the repo's document, so it gets named in the report, not redrawn.
    const playbook = await playbookOf(brownfield());

    expect(playbook).toContain('A drawn diagram is part of what');
    expect(playbook).toContain('before calling a clause unmentioned');
    expect(playbook).toContain('Leave it disagreeing');
    expect(playbook).toContain('not adoption\'s to edit');
  });
});

describe('a check is asked for, not answered in advance (field runs #99-#100)', () => {
  const brownfield = (): RepoSpec => ({
    packageJson: react(),
    files: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`src/legacy/mod${i}.js`, 'export const x = 1;\n']),
    ),
  });

  const playbookOf = async (spec: RepoSpec): Promise<string> => {
    const dir = repo(spec);

    await cli(dir, ['init', '--authoring', '--no-install']);

    return read(dir, 'blueprint-authoring.md') ?? '';
  };

  it('sends you to the tsconfig instead of asserting what it contains', async () => {
    // The batch-12 fix wrote a universal: "A Vite + TS starter keeps `vite.config.ts`
    // inside a tsconfig project, so `tsc -b` type-checks the vite edit too". The
    // harness's own starter fixture disproves it — a single root config at
    // `include: ["src"]` leaves the vite config outside every project, and one field
    // agent proved it by injecting a type error there (`tsc -b` exit 0) against a
    // control in `src/` (exit 1). A hedge followed two clauses later, and the second
    // agent of the same run did follow it — but the leading sentence asserted the
    // RESULT of a check that varies per repo, and an agent trusting it reports a
    // verified vite edit that was never read.
    // Forced onto a starter: the early-exit checklist is the only path that asks for
    // a build, and the only path all three of these agents were on.
    const playbook = await playbookOf({ packageJson: react() });

    // This fixture has no vite config at all, so the measurement declines and the
    // read-it-yourself wording stands — which is the only case it is for now.
    expect(playbook).toContain('is a fact about THIS repo, and');
    expect(playbook).toContain('this run could not settle it');
    expect(playbook).toContain('it exits 0 whatever you put in it');
    expect(playbook).toContain('Never report that a build verified the vite edit');

    // …and the old universal is gone, not merely qualified.
    expect(playbook).not.toContain('A Vite + TS starter keeps');
  });

  it('decides the one artifact cell that has nothing to decide it', async () => {
    // Three consecutive batches reported this as a coin flip. Naming all four states
    // (batch 12) told the reader where they were and still left one cell undecided:
    // no ignore rules AND no VCS means "leave them to the repo's own ignore rules"
    // points at rules that do not exist, for an owner with no `git status` to see them
    // in. That cell resolves the same way the build choice does — do not leave the
    // artifact behind.
    const playbook = await playbookOf({ packageJson: react() });

    expect(playbook).toContain('One of the four cells decides itself');
    expect(playbook).toContain('remove what your own verification step created');
    expect(playbook).toContain('The tree you hand back is the tree');
    expect(playbook).toContain('In the other three cells leave the artifacts alone');
  });

  it('names the three fields a re-adoption loses without an error', async () => {
    // The matrix-invisible list carried four clause shapes and no config FIELDS. A
    // re-adopting agent reproduced `naming`, `principles` and `lintOverrides` only
    // because it had read the config it was replacing; a blind one following the
    // schema sketch drops all three, and nothing goes red — the agent contract just
    // comes back shorter and an emitted override quietly stops being emitted.
    const playbook = await playbookOf(brownfield());

    // The rule, not a list — a list of five would have gone stale the next time a
    // field was added, which is how this one got to three-of-eight in the first place.
    expect(flattenProse(playbook)).toContain('any field in the prior config that the schema sketch below does not show');
    expect(flattenProse(playbook)).toContain('The sketch is a starting shape, not the field list');
    expect(playbook).toContain('Diff the prior config against yours field by field');

    // …and `sourceRoot` called out by name, because its loss is a different order of
    // damage from a shorter contract: every layer glob points at nothing.
    expect(flattenProse(playbook)).toContain('every layer glob silently points at nothing');
  });

  it('mentions every config field an adopter could have to reproduce', async () => {
    // `defineBlueprint`'s allow-lists are the authoritative field set and are private,
    // so they are restated here (CLAUDE.md: a string list is one contract per member).
    // Add a field to the schema and forget the playbook, and this turns red rather
    // than shipping a document that silently cannot describe the config it validates.
    const fields = [
      'name', 'framework', 'architecture', 'rules', 'principles', 'componentShape',
      'playbook', 'emit',
      'alias', 'additionalAliases', 'sourceRoot', 'layers', 'module', 'layerFiles',
      'layerFilesIgnore', 'testFiles', 'naming',
      'does', 'mustNot', 'owns', 'allowedImporters', 'lintOverrides',
    ];

    const playbook = await playbookOf(brownfield());

    for (const field of fields) {
      expect(playbook, `playbook never names the \`${field}\` field`).toContain(field);
    }
  });
});

describe('a fact reaches the reader before the red, not after (field run #101)', () => {
  const brownfield = (): RepoSpec => ({
    packageJson: react(),
    files: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`src/legacy/mod${i}.js`, 'export const x = 1;\n']),
    ),
  });

  it('names the runway inspect does not report', async () => {
    // "Declared-but-empty layers (and an alias no import uses yet) are the runway …
    // `inspect` tracks it honestly" grouped three things and was true of one. A field
    // agent hit the `owns` shape (a preset's `hooks` owns `zustand`, which the repo
    // does not install) and could not tell runway from over-declaration. That one is
    // now an `owns-not-installed` note, leaving the unused alias as the only shape
    // with no finding behind it — so the playbook has to say two, not one.
    const dir = repo(brownfield());

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('Runway comes in three shapes');
    expect(playbook).toContain('`inspect` names two of them');
    expect(playbook).toContain('gets none — nothing imports it');
    expect(flattenProse(playbook)).toContain('recognize yourself rather than read off a report');
  });

  it('says a cross-layer detector swap moves when the failure fires', async () => {
    // "Pick one detector and record it (the catalog's perf note usually argues for the
    // inspect side)" read as a free choice. Two field runs derived the missing half
    // themselves: dropping a lint-time cycle rule for blueprint's `cycles` gate moves
    // interception off whatever runs lint — pre-commit, editor, CI — onto a gate that
    // may be wired nowhere yet. Same-layer twins are a pure duplicate; this is not.
    const dir = repo(brownfield());

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(playbook).toContain('the deciding axis is WHEN the failure appears');
    expect(playbook).toContain('are a pure duplicate');
    expect(playbook).toContain('only if you are also placing');
  });

  it('warns that the comparison is textual where the copying happens', async () => {
    // wiring says "the comparison is textual, not semantic" — in the failure detail,
    // which a correct merge never sees. The adopter needs it while choosing how to
    // write an escape: a field agent could not tell whether `\/` for the emitted `/`
    // (the same string at runtime) would read as missing, and over-constrained. The
    // caveat now heads the block that prints both the pattern groups and the selectors.
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource({
          framework: 'react',
          architecture: {
            alias: '~app',
            layers: [
              { name: 'views', does: 'screens' },
              { name: 'contexts', does: 'state', allowedImporters: [{ layer: 'views', selfOnly: true }] },
            ],
          },
        }),
      },
    });

    const out = await cli(dir, ['rules']);

    expect(out.output).toContain('it compares TEXTUALLY');
    expect(out.output).toContain('reordered or a selector respelled');
    expect(out.output).toContain('Copy, do not retype');

    // The selector block points at it rather than restating it.
    expect(out.output).toContain('per the caveat above');
  });
});

describe('a principle names its own boundary (field runs #104, #106)', () => {
  it('bridges `noEmit` against the tsbuildinfo the build writes anyway', async () => {
    // The artifact line named `*.tsbuildinfo` as normal build output. An agent that
    // had just opened the tsconfig — because the paragraph above tells it to — read
    // `noEmit: true` there and then watched `tsc -b` write the file, and had to reason
    // out that build mode's book-keeping is not emit. Two truths, no bridge.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';

    expect(flattenProse(playbook)).toContain('writes a `*.tsbuildinfo` even under `noEmit: true`');
    expect(flattenProse(playbook)).toContain('book-keeping of what it already checked');
    expect(flattenProse(playbook)).toContain('the two settings do not conflict');
  });

  it('names the third state its own diagram rule opened up', async () => {
    // The tiebreak read as a partition and is not one. Broadening "mentioned" to
    // include a diagram (field run #97) removed the stale branch's trigger without
    // widening the runway branch's, leaving "mentioned, never described as intent"
    // owned by neither — the common case, and the one #107's agent landed in: `icons`
    // drawn in a mermaid graph, described nowhere, its code living under `assets/`.
    // Both agents reached the right answer through the keep-is-default fallback, and
    // both said reading the prose alone was a tightrope.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const flat = flattenProse(read(dir, 'blueprint-authoring.md') ?? '');

    expect(flat).toContain('Those two branches are not a partition');
    expect(flat).toContain('mentioned, but nowhere described as intent');
    expect(flat).toContain('neither branch fires. Do not force it into one');

    // And the hand-back is a specific question, not a verdict picked by proximity.
    expect(flat).toContain('hand the owner the specific question');
    expect(flat).toContain('the owner knows which of the two');
  });

  it('sorts untracked files into the three kinds, only one of them yours', async () => {
    // The cell that decides itself says "remove what your own verification step
    // created" — and in a tree with no VCS and no ignore rules, nothing else marks
    // the difference. `init` installs 96 packages and rewrites the lockfile, which are
    // as untracked as `dist/`. A field agent extended the principle correctly (keep the
    // deliverable, remove the verification product, leave what was already there) and
    // said it had extended it. The playbook states the split now.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const playbook = read(dir, 'blueprint-authoring.md') ?? '';
    const flat = flattenProse(playbook);

    expect(flat).toContain('is narrower than "untracked"');

    for (const kind of ['dist/', '*.tsbuildinfo', 'node_modules/', 'lockfile']) {
      expect(flat, `the cleanup split never names ${kind}`).toContain(kind);
    }

    expect(flat).toContain('already in the tree before you started');
    expect(flat).toContain('deciding it by "did I run the command that made it?" does not');
  });

  it('reconciles the dormant ignore rule with the cell that leaves artifacts alone', async () => {
    // Two sentences in this passage disagreed, and a field agent quoted both: a
    // `.gitignore` listing `dist` in a non-git tree is "a rule with nothing to enforce
    // it", while the same cell was grouped under "leave the artifacts alone — ignore
    // rules cover them". It withdrew the item only because `tsc -b` wrote its
    // tsbuildinfo into `node_modules/.tmp` and it never reached the decision (#109).
    // The test that reconciles them is declared, not enforced.
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--authoring', '--no-install']);

    const flat = flattenProse(read(dir, 'blueprint-authoring.md') ?? '');

    expect(flat).toContain('the distinction is declared against enforced');
    expect(flat).toContain('takes effect the moment anyone runs `git init`');
    expect(flat).toContain('the one with no declaration anywhere');
    expect(flat).toContain('enforced today is not the test; declared at all is');
  });

  it('states the reach of "your own lint passing confirms it"', async () => {
    // #85 taught the playbook that a proof step states its reach, and the sweep then
    // covered the playbook only. The same sentence shape sits in the emitted eslint
    // reference, where the merge decision is made: on a repo whose layers hold no
    // files, a green lint proves this config loads, not that the parser reaches layer
    // files. A field agent named the gap and judged it correctly anyway.
    const dir = repo({
      packageJson: react({ typescript: '^5.0.0' }),
      files: {
        'eslint.config.js': 'export default [];\n',
        'tsconfig.json': '{"compilerOptions":{"strict":true}}\n',
        'src/App.tsx': 'export const App = () => null;\n',
      },
    });

    await cli(dir, ['init', '--structure', 'flat', '--preset', '--no-install']);

    const reference = read(dir, 'eslint.config.blueprint.mjs') ?? '';

    expect(reference).toContain('as far as the files it actually parsed');
    expect(reference).toContain('proves this config loads, not that the');
    expect(reference).toContain('Skipping the block is still right either way');
  });
});

describe('the build clause is measured, not argued (field runs #104-#111)', () => {
  const withVite = (tsconfigs: Record<string, string>) => ({
    packageJson: react(),
    files: { 'vite.config.ts': 'export default {}\n', ...tsconfigs },
  });

  const playbookOf = async (spec: RepoSpec): Promise<string> => {
    const dir = repo(spec);

    await cli(dir, ['init', '--authoring', '--no-install']);

    return read(dir, 'blueprint-authoring.md') ?? '';
  };

  it('names `tsc -b` alone when a tsconfig project pulls the vite config in', async () => {
    // The modern Vite + TS template. This is the shape the playbook first ASSERTED
    // was universal (a finding three batches running), then told the agent to go and
    // check. Now init reads the tsconfig graph and the playbook states the answer.
    const flat = flattenProse(await playbookOf(withVite({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.node.json" }] }\n',
      'tsconfig.node.json': '{ "include": ["vite.config.ts"] }\n',
    })));

    expect(flat).toContain('that is measured, not assumed');
    expect(flat).toContain('`tsconfig.node.json` pulls `vite.config.ts` into a tsconfig');
    expect(flat).toContain('the one build that read both files');

    // The instruction it replaces is gone — not softened, gone.
    expect(flat).not.toContain('read it, do not assume it');
  });

  it('names the split when no project pulls it in, and says which config it read', async () => {
    // The shape this repo's own harness stages, where a field agent proved `tsc -b`
    // never reads the vite config by injecting a type error into it.
    const flat = flattenProse(await playbookOf(withVite({
      'tsconfig.json': '{ "include": ["src"], "compilerOptions": { "noEmit": true } }\n',
    })));

    expect(flat).toContain('and then the vite build, separately');
    expect(flat).toContain('No tsconfig project in this repo pulls `vite.config.ts` in');
    expect(flat).toContain('(`tsconfig.json` was read for it)');
    expect(flat).toContain('only the split lets you report which edit each one verified');
  });

  it('keeps the read-it-yourself wording exactly where the reader declined', async () => {
    // An `exclude` list is one of the shapes the reader will not resolve, and the
    // fallback is the point: "go and look" is right when the tool could not tell.
    const flat = flattenProse(await playbookOf(withVite({
      'tsconfig.json': '{ "include": ["**/*"], "exclude": ["vite.config.ts"] }\n',
    })));

    expect(flat).toContain('this run could not settle it');
    expect(flat).toContain('Open the tsconfig(s) and see which one you have');
    expect(flat).not.toContain('that is measured, not assumed');
  });

  it('forbids the over-claim on all three branches', async () => {
    // The one sentence that must survive whichever way the measurement goes: the
    // report must never say a build verified an edit it never read.
    const specs = [
      withVite({ 'tsconfig.json': '{ "include": ["vite.config.ts"] }\n' }),
      withVite({ 'tsconfig.json': '{ "include": ["src"] }\n' }),
      withVite({ 'tsconfig.json': '{ "extends": "./base.json" }\n' }),
    ];

    for (const spec of specs) {
      expect(flattenProse(await playbookOf(spec)))
        .toContain('Never report that a build verified the vite edit');
    }
  });
});

/**
 * The fixture DSL's own behaviour, rather than an adoption scenario.
 *
 * It lives here because `conformance.ts` is the file this test file is named
 * after, and because the DSL is now mutated like any other source: it drives
 * every scenario above, so a defect in it does not fail — it makes a batch of
 * scenarios pass against the wrong thing.
 */
describe('the fixture DSL itself', () => {
  it('puts console back after a run', () => {
    // `cli()` swaps console.log/error to capture output and restores them in a
    // finally. Skip the restore and every later console call in the process
    // appends to an array nobody reads: the next scenario's `output` comes back
    // empty and its assertions pass against nothing. A whole batch of green with
    // no evidence behind it, which is worse than a red.
    const log = console.log;
    const error = console.error;

    return cli(repo(), ['--version']).then((result) => {
      expect(result.code).toBe(0);
      expect(console.log).toBe(log);
      expect(console.error).toBe(error);
    });
  });

  it('names the manifest it writes when the spec does not', () => {
    // detect reads `pkg.name` into `projectName`, which titles the handbook and
    // is quoted into the generated config. A nameless default would run every
    // scenario that does not care about the name against a manifest npm rejects.
    expect(JSON.parse(read(repo(), 'package.json') ?? 'null')).toEqual({ name: 'fixture' });

    // And a spec that DOES name it wins — the default is a fallback, not a floor.
    expect(JSON.parse(read(repo({ packageJson: react() }), 'package.json') ?? 'null'))
      .toMatchObject({ name: 'fixture', dependencies: { react: '^18.0.0' } });
  });

  it('removes a path that is already gone without throwing', () => {
    // Scenarios delete artifacts mid-test (the authoring cleanup, for one) and
    // the afterEach sweeps the same paths again. Without `force`, that second
    // removal throws ENOENT out of teardown and takes the rest of the queue's
    // cleanup with it — leaving temp dirs behind on every later failure.
    const dir = makeRepo();

    rm(dir);
    expect(() => rm(dir)).not.toThrow();
    expect(read(dir, 'package.json')).toBeNull();
  });
});

/**
 * `emit.handbook` and `emit.agents[].path` are adopter-supplied strings that
 * reached `fs.writeFileSync` unchecked: `../CLAUDE.md` wrote one directory up, an
 * absolute path wrote wherever it pointed, and both runs printed ✓ beside the
 * escaping path. `SECURITY.md` puts "anything outside the project root" in scope,
 * so the tool was contradicting its own stated boundary — and because blueprint's
 * pitch is that an *agent* authors the config, the realistic input is a relative
 * path off by one directory rather than a hostile one. Refused in the planner, so
 * the refusal is atomic and `--dry-run` cannot print a plan the run would reject.
 */
describe('init writes only inside the repo it runs in', () => {
  const escaping = (emit: Blueprint['emit']): Blueprint => ({
    ...reactPreset({ name: 'fixture' }),
    emit,
  });

  /**
   * The project root is a subdirectory of the fixture, so a path that leaves the root
   * still lands inside what this test owns and removes. Pointing an escape at the
   * system temp directory is an assertion about shared global state, and it poisoned
   * itself once: a mutation run executed a mutant with the guard removed, the write
   * landed there for real, and every later run then saw the file it asserts is absent.
   */
  const nested = (): { dir: string; outside: string } => {
    const fixture = repo({ packageJson: react() });
    const dir = path.join(fixture, 'project');

    write(dir, 'package.json', JSON.stringify(react()));

    return { dir, outside: fixture };
  };

  /** Everything the refusal has to say, in the one channel the agent is guaranteed. */
  const assertRefused = (init: CliResult, dir: string, offending: string): void => {
    const output = flattenProse(init.output);

    expect(init.code).toBe(1);
    expect(output).toContain(offending);
    expect(output).toContain('outside the project root');
    expect(output).toContain('nothing was written');
    expect(output).toContain('emit.handbook');
    expect(output).toContain('emit.agents[].path');

    // Atomic: the eslint config sits below the handbook in plan order, so a guard
    // that fired per action would have written it before reaching the bad one.
    expect(read(dir, 'eslint.config.mjs')).toBeNull();
    expect(read(dir, 'docs/architecture-handbook.md')).toBeNull();
    expect(fs.existsSync(path.resolve(dir, offending))).toBe(false);
  };

  it('refuses an emit.handbook above the root and leaves the tree untouched', async () => {
    const { dir } = nested();

    write(dir, 'blueprint.config.mjs', configSource(escaping({ handbook: '../escaped-handbook.md' })));

    assertRefused(await cli(dir, ['init', '--no-install']), dir, '../escaped-handbook.md');
  });

  it('refuses an absolute emit.agents path, however ordinary the directory', async () => {
    // Absolute, and pointing at the fixture that contains the project — containment
    // is judged against the project root, not against how exotic the path looks.
    const { dir, outside } = nested();
    const target = path.join(outside, 'escaped-contract.md');

    write(dir, 'blueprint.config.mjs', configSource(escaping({ agents: [{ target: 'claude', path: target }] })));

    assertRefused(await cli(dir, ['init', '--no-install']), dir, target);
  });
});

/**
 * The ratchet's identity used to include the finding's message. This repo rewords
 * findings as it learns to explain them better — two of the commits before this one
 * did nothing else — and each such release silently retired every baseline entry for
 * the rules it touched: the recorded text stopped matching, the same old debt came
 * back as `fresh`, the recorded entry counted as `stale`, and a brownfield CI went
 * red on an upgrade that changed no code. Identity is now the rule, the path and a
 * subject, none of which a rewording touches. A baseline recorded under the old key
 * is refused rather than reinterpreted: read under the new one it would suppress
 * nothing, which is the wall of red the ledger exists to prevent, arriving with no
 * stated cause.
 */
describe('a baseline survives a reworded finding, and an old one says so', () => {
  const withDebt = (): string => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactBlueprint),
        // A declared layer holding code, so the tree is not ENTIRELY the stray —
        // that is a total structure mismatch, which locks a second error and is a
        // different subject from the one this ratchet fixture is about.
        'src/components/Card/index.js': 'export const Card = 1;',
        // An undeclared folder holding code: one error-tier finding to lock.
        'src/random/x.js': 'export const x = 1;',
      },
    });

    return dir;
  };

  it('records the subject and the version, and keeps the message for the diff', async () => {
    const dir = withDebt();

    expect((await cli(dir, ['inspect', '--update-baseline'])).code).toBe(0);

    const document = JSON.parse(read(dir, '.blueprint-baseline.json') ?? '{}');

    expect(document.version).toBe(3);
    expect(document.findings[0].subject).toBe('');
    expect(document.findings[0].path).toBe('src/random');
    // Written, and read by nothing — it is what makes the diff of a regenerated
    // ledger legible, so a rewording shows up as exactly that: a text change that
    // suppresses the same debt.
    expect(document.findings[0].message).toContain('not a declared layer');
  });

  it('still suppresses the debt after the message text is edited under it', async () => {
    const dir = withDebt();

    expect((await cli(dir, ['inspect', '--update-baseline'])).code).toBe(0);

    // Stand in for the next release rewording that finding: same rule, same path,
    // same subject, different sentence. Under the old key this alone turned the gate
    // red and reported the entry as stale.
    const document = JSON.parse(read(dir, '.blueprint-baseline.json') ?? '{}');

    document.findings[0].message = 'Some future release explains this differently.';
    write(dir, '.blueprint-baseline.json', JSON.stringify(document));

    const gate = await cli(dir, ['inspect', '--baseline']);

    expect(gate.code).toBe(0);
    expect(gate.output).toContain('1 baselined finding(s) suppressed.');
    expect(gate.output).not.toContain('no longer occur');
  });

  it('refuses a baseline recorded under the old key, and says what to run', async () => {
    const dir = withDebt();

    write(dir, '.blueprint-baseline.json', JSON.stringify({
      version: 1,
      findings: [{
        rule: 'undeclared-folder',
        path: 'src/random',
        message: '"random" is not a declared layer — declare it, or move its code into a module of an existing layer.',
      }],
    }));

    const gate = await cli(dir, ['inspect', '--baseline']);
    const output = flattenProse(gate.output);

    expect(gate.code).toBe(1);
    // Four things the agent cannot get anywhere else: that this is an upgrade and
    // not corruption, which version it read, the command, and — the one that decides
    // whether running it needs a hand audit first — that re-keying suppresses the
    // same debt rather than quietly widening what the gate ignores.
    expect(output).toContain('version 1');
    expect(output).toContain('version 3');
    expect(output).toContain('--update-baseline');
    expect(output).toContain('nothing is suppressed that was not suppressed before');

    // And the command it names is one that works: the re-keyed ledger gates green.
    expect((await cli(dir, ['inspect', '--update-baseline'])).code).toBe(0);
    expect((await cli(dir, ['inspect', '--baseline'])).code).toBe(0);
  });
});

/**
 * `scan`'s own doc comment has said "best-effort regex" since it was written, and that
 * honesty reached nobody: it lived in the source, and no CLI surface, doc page or
 * README carried it. An adopting agent's priors fill that gap with "tools resolve
 * imports properly", so a clean architecture report reads as a verdict on the
 * dependency graph rather than on what a text scan could see — and clean is exactly
 * where the gap costs something. One text, at every surface that reports a
 * graph-derived fact, with the correction attached: the hard gates run on the AST, so
 * "the survey is approximate" must not be read as "the gates are approximate".
 */
describe('an output that reports the import graph says how the graph was read', () => {
  const adopted = (files: Record<string, string> = {}): string =>
    repo({
      packageJson: react(),
      files: { 'blueprint.config.mjs': configSource(reactBlueprint), ...files },
    });

  it('closes a passing architecture report with the derivation, not only a failing one', async () => {
    // A run that exits 0 is the one that matters: a report with nothing to act on
    // reads as a verdict on the dependency graph, and the reader has no other way to
    // learn what kind of verdict it is.
    const passing = await cli(adopted(), ['inspect']);

    expect(passing.code).toBe(0);
    expect(passing.output).toContain('0 error(s)');
    expect(flattenProse(passing.output)).toContain('source text, not a parsed AST');
    expect(flattenProse(passing.output)).toContain('they run in ESLint, on the AST');
  });

  it('carries it into the JSON payload, the only channel a parsing agent has', async () => {
    const json = await cli(adopted(), ['inspect', '--json']);
    const parsed = JSON.parse(json.output);

    expect(parsed.ok).toBe(true);
    expect(parsed.derivation).toContain('source text, not a parsed AST');
  });

  it('closes both deps renderings with it too', async () => {
    // Both layers are declared and file-shaped in this fixture, so the keys are the layer
    // names and there is one real edge between them.
    const dir = adopted({
      'src/services/api.js': 'export const api = 1;',
      'src/components/Cart.js': 'import { api } from \'~app/services/api\';\nexport const Cart = () => api;',
    });

    const leaderboard = await cli(dir, ['deps']);
    // `services` is a file-layout layer in this preset, so the answer is at layer granularity.
    const module = await cli(dir, ['deps', 'services']);

    expect(flattenProse(leaderboard.output)).toContain('source text, not a parsed AST');
    expect(flattenProse(module.output)).toContain('source text, not a parsed AST');
    // The blast-radius answer needs it most: a fan-in of 1 that a computed import
    // made 2 is a wrong decision, not just an incomplete list.
    expect(module.output).toContain('imported by (1)');
  });
});

describe('the inner layer flow reaches inside a module (real eslint)', () => {
  // #185 gave `files:` the module dimension; the alias patterns inside those
  // entries did not follow, so a modular repo's same-layer, upward-flow and
  // past-the-entry bans were emitted against `~app/hooks/**` — a path no
  // modular import spells. All three were green here, and `inspect` reported
  // them, which is two gates disagreeing with the lint half silent.
  //
  // In this layer rather than the unit tests because that is where the real
  // linter reads the emitted config: the unit suite asserts the patterns, and
  // a pattern that is correct and unreachable looks identical to one that
  // bites until ESLint resolves the entry that carries it.
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'GameStage', does: 'the run, rendered', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage' },
      ],
      layers: [
        { name: 'components', does: 'render UI', layout: 'folder' },
        { name: 'hooks', does: 'reactive state', layout: 'folder' },
      ],
    },
  };

  const modularRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        ...files,
      },
    });

  it('flags the same-layer, upward and past-the-entry edges inside one module', async () => {
    const dir = modularRepo({
      'src/GameStage/hooks/useRun/index.jsx':
        'import { useTick } from "~app/GameStage/hooks/useTick";\n'
        + 'import { Hud } from "~app/GameStage/components/Hud";\n'
        + 'export const useRun = () => [useTick, Hud];\n',
      'src/GameStage/hooks/useTick/index.jsx': 'export const useTick = 1;\n',
      'src/GameStage/components/Hud/index.jsx':
        'import { impl } from "~app/GameStage/hooks/useRun/impl";\n'
        + 'export const Hud = impl;\n',
      'src/GameStage/components/Hud/impl.jsx': 'export const impl = 1;\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);

    // Three violations, one rule. Before this they were zero — the count is
    // the assertion, because a partial fix reads the same as a whole one on a
    // `toContain` of the rule id alone.
    expect(impact.output).toContain('3  no-restricted-imports — 2 file(s)');
  });

  it('leaves the legal edges of the same module alone', async () => {
    // The other direction, or the test above passes on a config that bans
    // everything — which is the failure mode a wildcard module segment has.
    const dir = modularRepo({
      'src/GameStage/components/Hud/index.jsx':
        'import { useRun } from "~app/GameStage/hooks/useRun";\n'
        + 'export const Hud = useRun;\n',
      'src/GameStage/hooks/useRun/index.jsx':
        'import { tick } from "../useTick";\n'
        + 'export const useRun = tick;\n',
      'src/GameStage/hooks/useTick/index.jsx': 'export const tick = 1;\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('0 hits');
    expect(impact.output).not.toContain('no-restricted-imports');
  });
});

describe('governing BETWEEN modules (real eslint)', () => {
  // The RFC's second depth. `impact` runs the project's own ESLint over the
  // emitted config, so every count below is the real linter resolving the real
  // entries — the layer where a ban that is correct and unreachable stops
  // looking identical to one that bites.
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'GameStage', does: 'the run, rendered', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage' },
        { name: 'common', does: 'the loop core' },
      ],
      layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
      // Generated files an adopter excludes — and the emitted entry carrying
      // them holds no `rules` at all, which the fixture's plugin stub has to
      // survive reading.
      layerFilesIgnore: ['src/**/*.gen.jsx'],
    },
  };

  const modularRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        'src/Combat/hooks/useDamage/index.jsx': 'export const useDamage = 1;\n',
        'src/common/index.jsx': 'export const loop = 1;\n',
        ...files,
      },
    });

  it('reddens an undeclared edge and a reach past a declared entry', async () => {
    const dir = modularRepo({
      // GameStage names Combat and nothing else.
      'src/GameStage/hooks/useRun/index.jsx':
        'import { loop } from "~app/common";\n'
        + 'import { useDamage } from "~app/Combat/hooks/useDamage";\n'
        + 'export const useRun = () => [loop, useDamage];\n',
      // …and the declared one at its entry is legal.
      'src/GameStage/GameStage.jsx':
        'import { attack } from "~app/Combat";\nexport const GameStage = attack;\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    // Exactly two: the undeclared module, and the reach past a declared one.
    // The count is the assertion — a partial fix reads the same as a whole one
    // on a `toContain` of the rule id alone.
    expect(impact.output).toContain('2  no-restricted-imports — 1 file(s)');
  });

  it('reddens a pass-through in all four spellings, and leaves a wrapper green', async () => {
    const dir = modularRepo({
      'src/GameStage/index.jsx': 'export { attack } from "~app/Combat";\n',
      'src/GameStage/two.jsx': 'export * from "~app/Combat";\n',
      'src/GameStage/three.jsx':
        'import { attack } from "~app/Combat";\nexport { attack };\n',
      'src/GameStage/four.jsx':
        'import { attack as ca } from "~app/Combat";\nexport default ca;\n',
      // Composition, not a pass-through — the boundary that matters.
      'src/GameStage/five.jsx':
        'import { attack } from "~app/Combat";\n'
        + 'export const startGame = () => attack();\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('4  blueprint/no-module-reexport — 4 file(s)');
    expect(impact.output).not.toContain('five.jsx');
  });

  it('says the same thing through inspect, on the same file', async () => {
    // Two gates, one repo. The lint half is what an adopter's CI runs and the
    // inspect half is what the report says; a disagreement here presents as
    // one of them going quiet rather than as a contradiction anyone can see.
    const dir = modularRepo({
      'src/GameStage/index.jsx': 'export { attack } from "~app/Combat";\n',
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('[module-reexport] src/GameStage/index.jsx');
    expect(inspect.output).toContain('buys nothing');
    // The migration table names where the finding is actually enforced, so a
    // reader searching the resolved config finds the id that is in it.
    expect(inspect.output).toContain('(lint: blueprint/no-module-reexport)');
  });

  it('keeps doctor green on a correctly-wired modular repo', async () => {
    // The expectations move with the emitter or doctor reports every emitted
    // pattern as lost on a repo whose wiring is perfect.
    const dir = modularRepo({
      'src/GameStage/hooks/useRun/index.jsx': 'export const useRun = 1;\n',
      'eslint.config.mjs': wiredEslintConfig(modular),
    });

    const doctor = await cli(dir, ['doctor']);

    expect(doctor.output).toContain('✓ emitted rules survive the merged eslint config (');
    expect(doctor.output).not.toContain('skipped');
  });
});

describe('the upward edge is red in both gates (real eslint)', () => {
  // #196's rules required that the alias and relative paths reach the same
  // verdict on a layer reaching its module root. That closed with one gate
  // false, and it was invisible from the source side: the code that would have
  // emitted the ban is correct code nobody wrote, and everything around it
  // passed. Found by rendering the config and reading it.
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'GameStage', does: 'the run, rendered', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage' },
      ],
      layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
    },
  };

  const modularRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'src/GameStage/index.jsx': 'export const stage = 1;\n',
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        ...files,
      },
    });

  it('reddens both alias spellings, and keeps the relative one red', async () => {
    const dir = modularRepo({
      'src/GameStage/hooks/useRun/index.jsx':
        'import { stage } from "~app/GameStage";\n'
        + 'export const useRun = stage;\n',
      'src/GameStage/hooks/useTick/index.jsx':
        'import { stage } from "~app/GameStage/index";\n'
        + 'export const useTick = stage;\n',
      'src/GameStage/hooks/useHit/index.jsx':
        'import { stage } from "../../../GameStage";\n'
        + 'export const useHit = stage;\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    // Two through the new paths entry, one through relative-escape — the
    // property #196 asked for and could not have shown was true.
    expect(impact.output).toContain('2  no-restricted-imports — 2 file(s)');
    expect(impact.output).toContain('1  blueprint/relative-escape — 1 file(s)');
  });

  it('names the same file as inspect does', async () => {
    const dir = modularRepo({
      'src/GameStage/hooks/useRun/index.jsx':
        'import { stage } from "~app/GameStage";\n'
        + 'export const useRun = stage;\n',
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('[root-import] src/GameStage/hooks/useRun/index.jsx');

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('src/GameStage/hooks/useRun/index.jsx');
  });

  it('leaves a module reaching its own layers alone', async () => {
    // A group would have taken these with it, which is why the ban is an exact
    // `paths` entry.
    const dir = modularRepo({
      'src/GameStage/GameStage.jsx':
        'import { useRun } from "~app/GameStage/hooks/useRun";\n'
        + 'export const GameStage = useRun;\n',
      'src/GameStage/hooks/useRun/index.jsx': 'export const useRun = 1;\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('0 hits');
  });

  it('keeps doctor green, and red when the paths are folded away', async () => {
    const dir = modularRepo({
      'src/GameStage/hooks/useRun/index.jsx': 'export const useRun = 1;\n',
      'eslint.config.mjs': wiredEslintConfig(modular),
    });

    const green = await cli(dir, ['doctor']);

    expect(green.output).toContain('✓ emitted rules survive the merged eslint config (');
    expect(green.output).toContain('the module-root ban');

    // A later entry that kept the patterns and dropped the paths — green
    // everywhere else, and the upward edge back to being lint-legal.
    const gutting = '  { "files": ["src/GameStage/hooks/**/*.jsx"], '
      + '"rules": { "no-restricted-imports": ["error", { "patterns": [] }] } },';

    const red = await cli(repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'src/GameStage/hooks/useRun/index.jsx': 'export const useRun = 1;\n',
        'eslint.config.mjs': wiredEslintConfig(modular, gutting),
      },
    }), ['doctor']);

    expect(red.code).toBe(1);
    expect(red.output).toContain('lost the module-root ban');
  });
});

describe('doctor probes the module dimension (real eslint)', () => {
  // Green is not the same as checking. A doctor that does not know the
  // dimension exists is green for the wrong reason, and one probe per layer is
  // exactly that: whichever module sorted first speaks for all of them.
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'app', does: 'routing only', layers: false, imports: ['GameStage'] },
        { name: 'GameStage', does: 'the run', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets' },
      ],
      layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
    },
  };

  const spec = (eslintConfig: string): RepoSpec => ({
    packageJson: react(),
    files: {
      'blueprint.config.mjs': configSource(modular),
      'jsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~app/*': ['./src/*'] } },
      }),
      'src/GameStage/hooks/useRun/index.jsx': 'export const useRun = 1;\n',
      'src/GameStage/GameStage.jsx': 'export const GameStage = 1;\n',
      'src/Combat/hooks/useHit/index.jsx': 'export const useHit = 1;\n',
      'src/app/routes/Game.jsx': 'export const Game = 1;\n',
      'eslint.config.mjs': eslintConfig,
    },
  });

  it('verifies an intact modular config, and says what it covered', async () => {
    const doctor = await cli(repo(spec(wiredEslintConfig(modular))), ['doctor']);

    expect(doctor.output).toContain('✓ emitted rules survive the merged eslint config (');
    expect(doctor.output).not.toContain('skipped');
    // The scope sentence says which granularity was sampled — read as "one per
    // layer" an adopter would trust a check that never ran on their module.
    expect(doctor.output).toContain('one probe per emitted entry');
    expect(doctor.code).toBe(0);
  });

  it('reddens when a merge guts ONE module and names that module', async () => {
    // The whole point. Sampled per layer, `Combat` would have been spoken for
    // by `GameStage` and this merge would have passed.
    const gutting = '  { "files": ["src/Combat/hooks/**/*.jsx"], '
      + '"rules": { "no-restricted-imports": ["error", { "patterns": [] }] } },';

    const doctor = await cli(repo(spec(wiredEslintConfig(modular, gutting))), ['doctor']);

    expect(doctor.code).toBe(1);
    expect(doctor.output).toContain('Combat/hooks: no-restricted-imports lost');
    // And it does not blame the module whose rules are intact.
    expect(doctor.output).not.toContain('GameStage/hooks: no-restricted-imports lost');
  });

  it('reddens when the gutted entry is a module\'s own root', async () => {
    // Unprobed until now: the entry governing a module's composition code.
    const gutting = '  { "files": ["src/GameStage/*.jsx"], '
      + '"rules": { "no-restricted-imports": ["error", { "patterns": [] }] } },';

    const doctor = await cli(repo(spec(wiredEslintConfig(modular, gutting))), ['doctor']);

    expect(doctor.code).toBe(1);
    expect(doctor.output).toContain('GameStage/(root): no-restricted-imports lost');
  });

  it('reddens when the gutted entry is a layers:false module', async () => {
    const gutting = '  { "files": ["src/app/**/*.jsx"], '
      + '"rules": { "no-restricted-imports": ["error", { "patterns": [] }] } },';

    const doctor = await cli(repo(spec(wiredEslintConfig(modular, gutting))), ['doctor']);

    expect(doctor.code).toBe(1);
    expect(doctor.output).toContain('app/(all): no-restricted-imports lost');
  });

  it('prints two lines when two modules lose the same thing', async () => {
    // An adopter reading one line fixes one module and leaves lint green on the
    // other, which is the cost the module in the label buys back.
    const gutting = '  { "files": ["src/**/hooks/**/*.jsx"], '
      + '"rules": { "no-restricted-imports": ["error", { "patterns": [] }] } },';

    const doctor = await cli(repo(spec(wiredEslintConfig(modular, gutting))), ['doctor']);

    expect(doctor.code).toBe(1);
    expect(doctor.output).toContain('GameStage/hooks: no-restricted-imports lost');
    expect(doctor.output).toContain('Combat/hooks: no-restricted-imports lost');
  });

  it('reddens when the merge drops the pass-through rule', async () => {
    const gutting = '  { "files": ["src/GameStage/**/*.jsx"], '
      + '"rules": { "blueprint/no-module-reexport": "off" } },';

    const doctor = await cli(repo(spec(wiredEslintConfig(modular, gutting))), ['doctor']);

    expect(doctor.code).toBe(1);
    expect(doctor.output).toContain('blueprint/no-module-reexport is missing or off');
  });

  it('probes a modular scaffold with no source files at all', async () => {
    // Nothing on disk, so every probe is synthetic — the arm that returned on
    // the first scope's stand-in, and the one a greenfield adoption rides on.
    const bare: RepoSpec = {
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'eslint.config.mjs': wiredEslintConfig(modular),
      },
    };

    const green = await cli(repo(bare), ['doctor']);

    expect(green.output).toContain('✓ emitted rules survive the merged eslint config (');
    expect(green.output).not.toContain('skipped');

    // …and a gutted module still reddens with zero files on disk.
    const gutting = '  { "files": ["src/Combat/hooks/**/*.js"], '
      + '"rules": { "no-restricted-imports": ["error", { "patterns": [] }] } },';

    const red = await cli(repo({
      ...bare,
      files: { ...bare.files, 'eslint.config.mjs': wiredEslintConfig(modular, gutting) },
    }), ['doctor']);

    expect(red.code).toBe(1);
    expect(red.output).toContain('Combat/hooks: no-restricted-imports lost');
  });
});

describe('the upward edge is red at every alias spelling (real eslint)', () => {
  // #220 closed the two spellings `no-restricted-imports` can express and stated
  // the residual at the site rather than leaving it to be found. This is the
  // residual: the root by its component's filename, which the RFC says is what
  // a single-component module's root is CALLED — the likely spelling, not the
  // exotic one.
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the player ship', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage' },
      ],
      layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
    },
  };

  const modularRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'src/Fighter/Fighter.jsx': 'export const Fighter = 1;\n',
        'src/Fighter/index.jsx': 'export { Fighter } from "./Fighter";\n',
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        ...files,
      },
    });

  it('reddens the root component filename, which paths could not reach', async () => {
    const dir = modularRepo({
      'src/Fighter/hooks/useX/index.jsx':
        'import { Fighter } from "~app/Fighter/Fighter";\n'
        + 'export const useX = Fighter;\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('1  blueprint/no-module-root-import — 1 file(s)');
  });

  it('keeps the two paths spellings red, through their own rule', async () => {
    const dir = modularRepo({
      'src/Fighter/hooks/useA/index.jsx':
        'import { Fighter } from "~app/Fighter";\nexport const useA = Fighter;\n',
      'src/Fighter/hooks/useB/index.jsx':
        'import { Fighter } from "~app/Fighter/index";\nexport const useB = Fighter;\n',
    });

    const impact = await cli(dir, ['impact']);

    // Both rules fire on both: the `paths` entry and the plugin rule each cover
    // these two, and neither has to be the only one that does.
    expect(impact.output).toContain('2  no-restricted-imports — 2 file(s)');
    expect(impact.output).toContain('2  blueprint/no-module-root-import — 2 file(s)');
  });

  it('leaves the legal edges of a layer file alone', async () => {
    // A same-layer sibling goes through a relative path — the alias spelling of
    // that edge is banned by its own rule since #208, and it is not this one's.
    const dir = modularRepo({
      'src/Fighter/hooks/useX/index.jsx':
        'import { y } from "../useY";\n'
        + 'import { attack } from "~app/Combat";\n'
        + 'export const useX = [y, attack];\n',
      'src/Fighter/hooks/useY/index.jsx': 'export const y = 1;\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('0 hits');
  });

  it('leaves the module root itself reaching down into its layers', async () => {
    const dir = modularRepo({
      'src/Fighter/Fighter.jsx':
        'import { useX } from "~app/Fighter/hooks/useX";\nexport const Fighter = useX;\n',
      'src/Fighter/hooks/useX/index.jsx': 'export const useX = 1;\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.code).toBe(0);
    expect(impact.output).toContain('0 hits');
  });

  it('says the same thing inspect says, on the same file', async () => {
    const dir = modularRepo({
      'src/Fighter/hooks/useX/index.jsx':
        'import { Fighter } from "~app/Fighter/Fighter";\n'
        + 'export const useX = Fighter;\n',
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(1);
    expect(inspect.output).toContain('[root-import] src/Fighter/hooks/useX/index.jsx');
    // The migration line names all three channels, so a reader searching the
    // resolved config finds the id that is actually holding their violation.
    expect(inspect.output).toContain('blueprint/no-module-root-import for every other alias spelling');
  });

  it('keeps doctor green, and reddens when the rule is switched off', async () => {
    const dir = modularRepo({
      'src/Fighter/hooks/useX/index.jsx': 'export const useX = 1;\n',
      'eslint.config.mjs': wiredEslintConfig(modular),
    });

    const green = await cli(dir, ['doctor']);

    expect(green.output).toContain('✓ emitted rules survive the merged eslint config (');
    expect(green.output).not.toContain('skipped');

    const gutting = '  { "files": ["src/Fighter/hooks/**/*.jsx"], '
      + '"rules": { "blueprint/no-module-root-import": "off" } },';

    const red = await cli(repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./src/*'] } },
        }),
        'src/Fighter/hooks/useX/index.jsx': 'export const useX = 1;\n',
        'eslint.config.mjs': wiredEslintConfig(modular, gutting),
      },
    }), ['doctor']);

    expect(red.code).toBe(1);
    expect(red.output).toContain('blueprint/no-module-root-import is missing or off');
  });
});

/**
 * `structure` is the one declaration every glob is expanded from, so a tree
 * matching neither model reports as N findings that each recommend the opposite
 * of the fix (#266). Three trees rather than two: the rule is "every top-level
 * source folder undeclared AND every declared position absent", and both halves
 * are vacuously true at zero folders — so the two mismatched directions were
 * chosen FROM the rule and only the third says what it does where it has no
 * data. That third one is a correct config on a one-minute-old repo.
 */
describe('the structure choice is one finding, in both directions and in neither at zero', () => {
  const modular = reactPreset({ name: 'fixture', structure: 'modular' });
  const flat = reactPreset({ name: 'fixture' });

  const at = (blueprint: Blueprint, files: Record<string, string>): RepoSpec => ({
    packageJson: react(),
    files: {
      'blueprint.config.mjs': configSource(blueprint),
      'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
      ...files,
    },
  });

  const layerTree = {
    'src/components/Btn.jsx': 'export const Btn = 1;\n',
    'src/hooks/useX.js': 'export const useX = 1;\n',
  };

  const moduleTree = {
    'src/app/index.js': 'export const boot = 1;\n',
    'src/common/index.js': 'export const shared = 1;\n',
  };

  it('reads a flat tree under a modular config as one decision, with its evidence', async () => {
    const inspect = await cli(repo(at(modular, layerTree)), ['inspect', '--json']);

    expect(errors(inspect)).toEqual([
      'structure-mismatch src',
      'undeclared-module src/components',
      'undeclared-module src/hooks',
    ]);
  });

  it('reads a modular tree under a flat config the same way, mirrored', async () => {
    const inspect = await cli(repo(at(flat, moduleTree)), ['inspect', '--json']);

    expect(errors(inspect)).toEqual([
      'structure-mismatch src',
      'undeclared-folder src/app',
      'undeclared-folder src/common',
    ]);
  });

  it('says nothing on a fresh template under a CORRECT modular config', async () => {
    // A Vite starter: root wiring, no top-level folder at all. "All undeclared"
    // is satisfied by zero folders, so an unfloored rule calls a right answer a
    // mismatch — and the two cases above cannot see that, because both were
    // built with folders in them.
    const inspect = await cli(repo(at(modular, {
      'src/main.jsx': 'export const main = 1;\n',
      'src/App.jsx': 'export const App = 1;\n',
    })), ['inspect', '--json']);

    expect(errors(inspect)).toEqual([]);
    // The runway notes still fire — this is the tool looking and finding nothing
    // wrong, not the tool declining to look.
    expect(notes(inspect, 'missing-module')).toEqual(['src/app', 'src/common']);
    expect(JSON.parse(inspect.output).ok).toBe(true);
  });
});

/**
 * The RFC's reason for expanding globs per declared module rather than putting a
 * wildcard in the module segment: a typo nobody declared must be matched by
 * nothing. Half governed and green is worse than ungoverned and red, so the gate
 * that reports it is `inspect` and the lint run stays silent by construction —
 * which is the one thing an adopter cannot infer from a green CI.
 */
describe('a mistyped module is ungoverned, and only one gate can say so (real eslint)', () => {
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the player ship', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage' },
      ],
      layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
    },
  };

  const modularRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        ...files,
      },
    });

  it('reports the typo as an undeclared module and leaves its files outside the net', async () => {
    const dir = modularRepo({
      'src/Fighter/index.jsx': 'export const Fighter = 1;\n',
      'src/Figthter/hooks/useX/index.jsx': 'export const useX = 1;\n',
    });

    const inspect = await cli(dir, ['inspect', '--json']);

    expect(errors(inspect)).toEqual(['undeclared-module src/Figthter']);

    const text = await cli(dir, ['inspect']);

    expect(text.output)
      .toContain('outside: src/Figthter/hooks/useX/index.jsx');

    // The other half of "ungoverned rather than unflagged": the layer glob is
    // built from the declared names, so the real linter has nothing to say here.
    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('0 hits');
  });

  it('keeps the module root itself inside the net, unlike the typo beside it', async () => {
    const dir = modularRepo({
      'src/Fighter/Fighter.jsx': 'export const Fighter = 1;\n',
      'src/Fighter/index.jsx': 'export { Fighter } from "./Fighter";\n',
    });

    const inspect = await cli(dir, ['inspect']);

    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([]);
    expect(inspect.output).toContain('Coverage: 3/3 source files inside layer nets');
  });

  it('reads a folder of test files as no module, and a folder of mocks as one', async () => {
    // Not symmetric, and the asymmetry is the testFiles glob rather than the
    // folder name: `*.test.*` is exempt everywhere, `__mocks__/x.jsx` is a source
    // file in a top-level folder nobody declared and is reported as exactly that.
    const dir = modularRepo({
      'src/Fighter/index.jsx': 'export const Fighter = 1;\n',
      'src/__tests__/smoke.test.jsx': 'export const smoke = 1;\n',
      'src/__mocks__/server.jsx': 'export const server = 1;\n',
    });

    const inspect = await cli(dir, ['inspect', '--json']);

    expect(errors(inspect)).toEqual(['undeclared-module src/__mocks__']);
  });
});

/**
 * Two of the three bans this decomposition recorded as "no evidence found" on a
 * modular tree. Both fire, in both gates, and the point of fossilizing them is
 * that neither has ever been red here: an ownership ban emitted against a path
 * no modular import spells looks exactly like one that bites (#185's shape).
 */
describe('ownership and the selfOnly ban bite inside a module (real eslint)', () => {
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'GameStage', does: 'the run, rendered', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage', owns: ['lodash'] },
      ],
      layers: [
        { name: 'hooks', does: 'reactive state', layout: 'folder' },
        {
          name: 'contexts',
          does: 'provide shared state',
          layout: 'folder',
          allowedImporters: [{ layer: 'hooks', selfOnly: true }],
        },
        { name: 'services', does: 'network', layout: 'folder', owns: ['axios'] },
      ],
    },
  };

  const modularRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react({ axios: '^1.0.0', lodash: '^4.0.0' }),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        // Both modules carry their entry, so every case below reports its own
        // subject alone — `no-entry` answers a module without one too.
        'src/GameStage/index.jsx': 'export const stage = 1;\n',
        ...files,
      },
    });

  it('reddens a layer-level owns and a module-level owns, in both gates', async () => {
    const dir = modularRepo({
      // `services` owns axios; a hooks unit reaching it is the layer dimension.
      'src/GameStage/hooks/useNet/index.jsx':
        'import axios from "axios";\nexport const useNet = axios;\n',
      // `Combat` owns lodash; GameStage reaching it is the MODULE dimension, which
      // bans the primitive in every other module rather than in every other layer.
      'src/GameStage/hooks/useSort/index.jsx':
        'import sortBy from "lodash";\nexport const useSort = sortBy;\n',
    });

    const inspect = await cli(dir, ['inspect', '--json']);

    expect(errors(inspect)).toEqual([
      'package-ownership src/GameStage/hooks/useNet/index.jsx',
      'package-ownership src/GameStage/hooks/useSort/index.jsx',
    ]);

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('2  no-restricted-imports — 2 file(s)');
  });

  it('reddens a selfOnly re-export inside a module, in both gates', async () => {
    const dir = modularRepo({
      'src/GameStage/contexts/Theme/index.jsx': 'export const Theme = 1;\n',
      'src/GameStage/hooks/useTheme/index.jsx':
        'export { Theme } from "~app/GameStage/contexts/Theme";\n',
    });

    const inspect = await cli(dir, ['inspect', '--json']);

    expect(errors(inspect))
      .toEqual(['selfonly-reexport src/GameStage/hooks/useTheme/index.jsx']);

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('1  no-restricted-syntax — 1 file(s)');
  });

  it('leaves the same unit DEPENDING on that context alone', async () => {
    // The ban is on forwarding it, not on using it — without this the case above
    // passes on a config that bans the layer outright.
    const dir = modularRepo({
      'src/GameStage/contexts/Theme/index.jsx': 'export const Theme = 1;\n',
      'src/GameStage/hooks/useTheme/index.jsx':
        'import { Theme } from "~app/GameStage/contexts/Theme";\n'
        + 'export const useTheme = () => Theme;\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([]);
    expect(impact.output).toContain('0 hits');
  });
});

/**
 * Three of the matrix's cross-module rows answer in both gates and two answer in
 * lint alone, and the difference is designed rather than a gap to close: `export
 * { X }` carries no `from`, so the text scan has no specifier to link back to the
 * import that bound the name. The plugin reads an AST and sees it.
 *
 * Written as one fixture holding both kinds, because the silence only means
 * something beside a spelling that DOES reach `inspect` in the same report — a
 * `not.toContain` alone passes on a run that produced nothing at all.
 *
 * Do not "fix" `inspect` here by putting a parser in the scanner: every report it
 * prints states this boundary, and the assertion below holds it to saying so.
 */
describe('the two-statement re-export is lint-only, and the report says why', () => {
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'GameStage', does: 'the run, rendered', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage' },
      ],
      layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
    },
  };

  const dir = (): string =>
    repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        // The spelling with a `from` clause — both gates.
        'src/GameStage/index.jsx': 'export * from "~app/Combat";\n',
        // The two-statement spellings — the plugin only.
        'src/GameStage/two.jsx':
          'import { attack } from "~app/Combat";\nexport { attack };\n',
        'src/GameStage/three.jsx':
          'import { attack } from "~app/Combat";\nexport { attack as go };\n',
      },
    });

  it('reddens all three in lint', async () => {
    const impact = await cli(dir(), ['impact']);

    expect(impact.output).toContain('3  blueprint/no-module-reexport — 3 file(s)');
  });

  it('reports only the `from` spelling through inspect, and states the boundary', async () => {
    const inspect = await cli(dir(), ['inspect', '--json']);

    // One entry, not three — and asserted as the whole list, so a scanner that
    // learned to follow a binding turns this red instead of passing quietly.
    expect(errors(inspect)).toEqual(['module-reexport src/GameStage/index.jsx']);

    const parsed = JSON.parse(inspect.output) as { derivation: string };

    expect(parsed.derivation).toContain('source text, not a parsed AST');

    expect(flattenProse(parsed.derivation))
      .toContain('The hard gates do not share the limit: they run in ESLint, on the AST');
  });
});

/**
 * The relative family under `modules`. One plugin rule carries five verdicts, so
 * the count is the assertion — four of the five firing reads identically to all
 * five on a `toContain` of the rule id, and `inspect` is what tells them apart by
 * naming a different finding for each depth.
 *
 * The same-layer rule is stated here in its current form, which two conformance
 * assertions and three test comments once had backwards: the alias spelling is
 * banned, a sibling's ENTRY is reachable relatively, and reaching past that entry
 * is not.
 */
describe('a relative escape is red at every depth inside a module (real eslint)', () => {
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'GameStage', does: 'the run, rendered', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage' },
      ],
      layers: [
        { name: 'components', does: 'render UI', layout: 'folder' },
        { name: 'hooks', does: 'reactive state', layout: 'folder' },
      ],
    },
  };

  const modularRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        'src/GameStage/index.jsx': 'export const stage = 1;\n',
        ...files,
      },
    });

  it('names a different verdict at each depth, and one rule holds all five', async () => {
    const dir = modularRepo({
      'src/GameStage/components/Card/index.jsx': 'export const Card = 1;\n',
      'src/GameStage/hooks/useB/index.jsx': 'export const b = 1;\n',
      'src/GameStage/hooks/useB/impl.jsx': 'export const impl = 1;\n',
      'src/GameStage/hooks/useModule/index.jsx':
        'import { attack } from "../../../Combat";\nexport const useModule = attack;\n',
      'src/GameStage/hooks/useEntry/index.jsx':
        'import { impl } from "../useB/impl";\nexport const useEntry = impl;\n',
      'src/GameStage/hooks/useLayer/index.jsx':
        'import { Card } from "../../components/Card";\nexport const useLayer = Card;\n',
      'src/GameStage/hooks/useRoot/index.jsx':
        'import { stage } from "../../index";\nexport const useRoot = stage;\n',
      'src/GameStage/hooks/useOut/index.jsx':
        'import { z } from "../../../../elsewhere";\nexport const useOut = z;\n',
    });

    const inspect = await cli(dir, ['inspect', '--json']);

    // Path order, which the scan guarantees by sorting each directory read rather
    // than trusting the filesystem to answer in name order (`scan.ts`).
    expect(errors(inspect)).toEqual([
      'entry-bypass src/GameStage/hooks/useEntry/index.jsx',
      'layer-escape src/GameStage/hooks/useLayer/index.jsx',
      'module-escape src/GameStage/hooks/useModule/index.jsx',
      'src-escape src/GameStage/hooks/useOut/index.jsx',
      'root-import src/GameStage/hooks/useRoot/index.jsx',
    ]);

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('5  blueprint/relative-escape — 5 file(s)');
  });

  it('leaves the one legal relative shape alone — the sibling by its entry', async () => {
    const dir = modularRepo({
      'src/GameStage/hooks/useB/index.jsx': 'export const b = 1;\n',
      'src/GameStage/hooks/useA/index.jsx':
        'import { b } from "../useB";\nexport const useA = b;\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([]);
    expect(impact.output).toContain('0 hits');
  });
});

/**
 * `no-entry` under `modules` measures a UNIT inside a layer inside a module —
 * three segments down — which is a different address from the flat case its depth
 * arithmetic was written for.
 *
 * A declared feature module with no root entry is NOT here: nothing in the tool
 * reports it, and this suite does not pin a silence nobody has taken a position
 * on. That gap is #282's.
 */
/**
 * `no-entry` answers two levels under one id — a unit folder inside a layer, and
 * the module itself — for the reason the unit rule was written on: the entry is
 * the folder's only public surface, so `~app/GameStage` and
 * `~app/GameStage/hooks/useRun` are each the one legal address of the thing they
 * name, and each resolves to that file.
 *
 * Both levels in one describe rather than two, because the pair is the claim:
 * each message has to say which level it means, and read apart neither case can
 * show that the other did not fire at the same address.
 */
describe('no-entry finds a unit and a module, and says which it means', () => {
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'GameStage', does: 'the run, rendered', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage' },
      ],
      layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
    },
  };

  const modularRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        ...files,
      },
    });

  /** The module entry, so a unit-level case reports the unit alone. */
  const stage = { 'src/GameStage/index.jsx': 'export const stage = 1;\n' };

  it('warns on a unit folder with no entry file', async () => {
    const inspect = await cli(modularRepo({
      ...stage,
      'src/GameStage/hooks/useRun/impl.jsx': 'export const impl = 1;\n',
    }), ['inspect', '--json']);

    expect(errors(inspect)).toEqual(['no-entry src/GameStage/hooks/useRun']);
  });

  it('says nothing once that unit has one', async () => {
    const inspect = await cli(modularRepo({
      ...stage,
      'src/GameStage/hooks/useRun/index.jsx': 'export const useRun = 1;\n',
      'src/GameStage/hooks/useRun/impl.jsx': 'export const impl = 1;\n',
    }), ['inspect', '--json']);

    expect(errors(inspect)).toEqual([]);
  });

  it('warns on a MODULE whose folder holds code and carries no entry', async () => {
    // The state the tool had no gate for: every unit below is well formed, the
    // module is declared, and the one address another module may write for it
    // resolves to nothing.
    const inspect = await cli(modularRepo({
      'src/GameStage/hooks/useRun/index.jsx': 'export const useRun = 1;\n',
    }), ['inspect', '--json']);

    expect(errors(inspect)).toEqual(['no-entry src/GameStage']);

    const message = (JSON.parse(inspect.output).findings as Finding[])
      .find((finding) => finding.path === 'src/GameStage')?.message ?? '';

    // The level, the address it breaks, and the file to add — the three things a
    // reader needs before they can act, and the word that tells this apart from
    // the unit case one line up.
    expect(message).toContain('Module "GameStage" has no "index" entry');
    expect(message).toContain('"~app/GameStage" is the only address');
    expect(message).toContain('Add `src/GameStage/index`');
  });

  it('says nothing once the module has one, and keeps the unit answer separate', async () => {
    const inspect = await cli(modularRepo({
      ...stage,
      'src/GameStage/hooks/useRun/index.jsx': 'export const useRun = 1;\n',
    }), ['inspect', '--json']);

    expect(errors(inspect)).toEqual([]);
  });

  it('leaves a declared module with no folder to missing-module alone', async () => {
    // Two findings over one state would answer it at two tiers with two
    // remedies — and `missing-module`'s is "runway, not a todo", which is the
    // right one for a module that has not been built yet.
    const inspect = await cli(repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/GameStage/index.jsx': 'export const stage = 1;\n',
      },
    }), ['inspect', '--json']);

    expect(errors(inspect)).toEqual([]);
    expect(notes(inspect, 'missing-module')).toEqual(['src/Combat']);
  });

  it('says nothing at either level on a flat project', async () => {
    // The module level exists only where `modules` is declared: flat has one
    // implicit module — `src/` itself — and no entry to ask it for.
    const flat: Blueprint = {
      framework: 'react',
      architecture: {
        alias: '~app',
        layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
      },
    };

    const inspect = await cli(repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(flat),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/hooks/useRun/index.jsx': 'export const useRun = 1;\n',
      },
    }), ['inspect', '--json']);

    expect(errors(inspect)).toEqual([]);
  });
});

/**
 * A module and a layer may carry the same name — they are different namespaces,
 * and `src/components/components/Card/` is unambiguous. What that costs is every
 * diagnostic having to say which one it means, and the three that can meet on one
 * repo are checked together here rather than one per fixture: read alone, each is
 * a sentence about "components" that the other two could contradict.
 */
describe('a module and a layer may share a name, and each diagnostic says which', () => {
  const shared: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'components', does: 'a domain that happens to be called components' },
        { name: 'Combat', does: 'bullets and damage' },
      ],
      layers: [
        { name: 'components', does: 'render UI', layout: 'folder' },
        { name: 'hooks', does: 'reactive state', layout: 'folder' },
      ],
    },
  };

  const sharedRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(shared),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        'src/components/index.jsx': 'export const surface = 1;\n',
        ...files,
      },
    });

  it('governs the layer inside the module of the same name', async () => {
    const dir = sharedRepo({
      'src/components/components/Card/index.jsx': 'export const Card = 1;\n',
    });

    const inspect = await cli(dir, ['inspect']);

    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([]);
    expect(inspect.output).toContain('Coverage: 3/3 source files inside layer nets');
  });

  it('reddens that layer file reaching up to the module root, in both gates', async () => {
    const dir = sharedRepo({
      'src/components/components/Card/index.jsx':
        'import { surface } from "~app/components";\nexport const Card = surface;\n',
    });

    const inspect = await cli(dir, ['inspect', '--json']);

    expect(errors(inspect))
      .toEqual(['root-import src/components/components/Card/index.jsx']);

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('1  blueprint/no-module-root-import — 1 file(s)');
  });

  it('uses both meanings in one report without either standing in for the other', async () => {
    const dir = sharedRepo({
      'src/components/hooks/useX/index.jsx':
        'import { z } from "~app/Zed";\nexport const useX = z;\n',
      'src/Zed/index.jsx': 'export const z = 1;\n',
    });

    const inspect = await cli(dir, ['inspect']);

    // The position hint reads "components" as the MODULE that reaches Zed…
    expect(inspect.output).toContain('Measured from its imports: "components" reaches it');

    // …while the runway note on the same report reads it as the LAYER that holds
    // no code in any module, and addresses itself at the source root because a
    // layer under `modules` has no folder of its own.
    expect(flattenProse(inspect.output))
      .toContain('Declared layer "components" holds no code in any module yet');

    expect(notes(await cli(dir, ['inspect', '--json']), 'missing-layer'))
      .toEqual(['components']);
  });
});

/**
 * The two architecture fields that move every glob's prefix. `sourceRoot: '.'`
 * puts the modules at the project root, and an additional alias is a second
 * spelling of the same tree — a ban that only knows the primary alias is a ban an
 * adopter walks around by typing the other name, with lint green.
 */
describe('sourceRoot and an additional alias reach inside modules (real eslint)', () => {
  const rooted: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      sourceRoot: '.',
      additionalAliases: { '~root': '.' },
      modules: [
        { name: 'GameStage', does: 'the run, rendered', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage' },
      ],
      layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
    },
  };

  const rootedRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(rooted),
        'jsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~app/*': ['./*'], '~root/*': ['./*'] } },
        }),
        'Combat/index.jsx': 'export const attack = 1;\n',
        'Combat/hooks/useDamage/index.jsx': 'export const useDamage = 1;\n',
        'GameStage/index.jsx': 'export const stage = 1;\n',
        ...files,
      },
    });

  it('reddens a reach past a declared entry spelled with the offset alias', async () => {
    const dir = rootedRepo({
      'GameStage/hooks/useRun/index.jsx':
        'import { useDamage } from "~root/Combat/hooks/useDamage";\n'
        + 'export const useRun = useDamage;\n',
    });

    const inspect = await cli(dir, ['inspect', '--json']);

    expect(errors(inspect)).toEqual(['deep-import GameStage/hooks/useRun/index.jsx']);

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('1  no-restricted-imports — 1 file(s)');
  });

  it('reddens the upward edge spelled with the offset alias too', async () => {
    const dir = rootedRepo({
      'GameStage/hooks/useRun/index.jsx':
        'import { stage } from "~root/GameStage";\nexport const useRun = stage;\n',
    });

    const inspect = await cli(dir, ['inspect', '--json']);

    expect(errors(inspect)).toEqual(['root-import GameStage/hooks/useRun/index.jsx']);

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('1  blueprint/no-module-root-import — 1 file(s)');
  });
});

/**
 * A hand-written `layerFiles` under `modules` must carry `{module}` — the config
 * is rejected without one — and this is the layer that shows the accepted glob
 * actually governs: a placeholder that expands to the wrong prefix passes
 * validation and reaches nothing, which reads exactly like a clean repo.
 */
describe('a custom layerFiles carrying {module} governs the same tree (real eslint)', () => {
  const custom: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      layerFiles: 'src/{module}/{layer}/**/*.jsx',
      modules: [
        { name: 'GameStage', does: 'the run, rendered', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage' },
      ],
      layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
    },
  };

  it('reaches inside the modules the placeholder expands to, in both gates', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(custom),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        'src/Combat/hooks/useDamage/index.jsx': 'export const useDamage = 1;\n',
        'src/GameStage/index.jsx': 'export const stage = 1;\n',
        'src/GameStage/hooks/useRun/index.jsx':
          'import { useDamage } from "~app/Combat/hooks/useDamage";\n'
          + 'export const useRun = useDamage;\n',
      },
    });

    const inspect = await cli(dir, ['inspect', '--json']);

    expect(errors(inspect)).toEqual(['deep-import src/GameStage/hooks/useRun/index.jsx']);

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('1  no-restricted-imports — 1 file(s)');
  });
});

/**
 * A `layers: false` module keeps its position in the outer flow and drops only
 * the inner layer vocabulary, so a router's own folder names never have to be
 * declared — and the module's `imports` still bind inside them.
 *
 * **Both gates, on the same file, in the same case.** The module is one zone in
 * the emitted config — no layer glob inside it, and its own entry widened from
 * `src/app/*` to `src/app/**&#47;*` — so lint reaches every file below the root,
 * and this suite asks `inspect` for the same verdict on the same import. It used
 * to ask only lint: `inspect` was silent below the root and pinning that silence
 * would have made an unowned hole into intended behaviour.
 *
 * The negatives carry as much as the positives here. Four shapes are green in a
 * real lint run inside such a module — the module's own alias root, a relative
 * path that stays in it, a relative path that LEAVES it, and a declared edge
 * through the entry — and each is asserted green rather than left unmentioned,
 * because a fix that opens this zone by widening the layer guard reddens the
 * first three against a lint run that never moves.
 */
describe('a layers:false module answers in both gates, below its root too (real eslint)', () => {
  const routed: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'app', does: 'routing only', layers: false, imports: ['GameStage'] },
        { name: 'GameStage', does: 'the run, rendered', owns: ['zustand'] },
        { name: 'Combat', does: 'bullets and damage' },
      ],
      layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
    },
  };

  const routedRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react({ zustand: '^4.0.0' }),
      files: {
        'blueprint.config.mjs': configSource(routed),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/GameStage/index.jsx': 'export const stage = 1;\n',
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        'src/app/index.jsx': 'export const App = 1;\n',
        ...files,
      },
    });

  it('counts a nested route file inside the net rather than outside every glob', async () => {
    // Read as "root files only" this module's internals would sit outside every
    // net, and a boundary could be broken in `routes/` with lint fully green.
    const dir = routedRepo({
      'src/app/routes/Game/screen.jsx': 'export const Game = 1;\n',
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.output).toContain('Coverage: 4/4 source files inside layer nets');
  });

  it('reddens an undeclared edge and a pass-through from inside routes/, in both gates', async () => {
    const dir = routedRepo({
      'src/app/routes/Game/screen.jsx':
        'import { attack } from "~app/Combat";\nexport const Game = attack;\n',
      'src/app/routes/Menu/screen.jsx': 'export * from "~app/GameStage";\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('1  no-restricted-imports — 1 file(s)');
    expect(impact.output).toContain('1  blueprint/no-module-reexport — 1 file(s)');

    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([
      'undeclared-dependency src/app/routes/Game/screen.jsx',
      'module-reexport src/app/routes/Menu/screen.jsx',
    ]);
  });

  it('answers the module root and a file below it identically', async () => {
    // The root was the one address that already worked, so the pair is the
    // claim: a fix reaching only the root leaves the depth that broke.
    const dir = routedRepo({
      'src/app/index.jsx':
        'import { attack } from "~app/Combat";\nexport const App = attack;\n',
      'src/app/routes/Game/screen.jsx':
        'import { attack } from "~app/Combat";\nexport const Game = attack;\n',
    });

    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([
      'undeclared-dependency src/app/index.jsx',
      'undeclared-dependency src/app/routes/Game/screen.jsx',
    ]);

    expect((await cli(dir, ['impact'])).output).toContain('2  no-restricted-imports — 2 file(s)');
  });

  it('reddens a reach past a declared dependency\'s entry, and a module-owned package', async () => {
    // The other two things `ModuleDef.layers` promises still reach inside: the
    // entry-only ban on a declared edge, and `owns`. Both are emitted onto this
    // module's own entry, so both have to answer here.
    const dir = routedRepo({
      'src/GameStage/hooks/useRun/index.jsx': 'export const useRun = 1;\n',
      'src/app/routes/Game/screen.jsx':
        'import { useRun } from "~app/GameStage/hooks/useRun";\nexport const Game = useRun;\n',
      'src/app/routes/Menu/screen.jsx':
        'import create from "zustand";\nexport const Menu = create;\n',
    });

    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([
      'deep-import src/app/routes/Game/screen.jsx',
      'package-ownership src/app/routes/Menu/screen.jsx',
    ]);

    expect((await cli(dir, ['impact'])).output).toContain('2  no-restricted-imports — 2 file(s)');
  });

  it('leaves the declared edge alone at the same depth, in both gates', async () => {
    const dir = routedRepo({
      'src/app/routes/Game/screen.jsx':
        'import { stage } from "~app/GameStage";\nexport const Game = stage;\n',
    });

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('0 hits');
    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([]);
  });

  it('keeps the layer vocabulary out of it — three shapes lint runs green over', async () => {
    // Each is legal precisely because the module has no layers: `routes` is not
    // a layer to leave, the module root is not above anything inside it, and a
    // relative path that leaves the module is caught by a plugin rule that
    // registers no visitor here. Opened by widening the layer guard instead of
    // splitting the pass by zone, the first two turn red on their own.
    const dir = routedRepo({
      'src/app/lib/shared.jsx': 'export const shared = 1;\n',
      'src/app/routes/Game.jsx':
        'import { shared } from "../lib/shared";\n'
        + 'import { App } from "~app/app";\n'
        + 'import { stage } from "../../GameStage/index";\n'
        + 'export const Game = [shared, App, stage];\n',
    });

    expect((await cli(dir, ['impact'])).output).toContain('0 hits');
    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([]);
  });

  it('does not extend the same reach to a LAYERED module\'s undeclared folder', async () => {
    // The other side of the line, on the same config and in the same suite, or
    // "governed below the root" reads as a claim about depth. `GameStage` is
    // layered, so `scratch/` is matched by no glob at all — the layer globs
    // expand to declared layers and `resolveModuleFiles` stops at
    // `src/GameStage/*`. Both gates stay quiet, and coverage names the file,
    // which is the difference from a silence nobody reports.
    const dir = routedRepo({
      'src/GameStage/scratch/x.jsx':
        'import { attack } from "~app/Combat";\nexport const x = attack;\n',
    });

    expect((await cli(dir, ['impact'])).output).toContain('0 hits');
    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([]);

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.output).toContain('Coverage: 3/4 source files inside layer nets');
    expect(inspect.output).toContain('outside: src/GameStage/scratch/x.jsx');
  });
});

/**
 * The other zone no layer glob reaches, in both gates on the same tree: a
 * LAYERED module's own root. Its emitted entry is `src/<Module>/*` and it
 * carries the cross-module groups, the unit-entry group over its own layers,
 * the module-level `owns` bans and `blueprint/no-module-reexport` — and nothing
 * from the layer level. `blueprint/relative-escape` never registers on it
 * either: the rule opens on the file's segment at layer depth, which at a root
 * is the filename.
 *
 * The negatives are the point here. Four judgments were red at a root against a
 * lint run green on every one of them, and the ownership one printed that
 * filename where its own sentence promises a layer. So each is asserted green in
 * BOTH gates rather than left unmentioned — read only in `inspect`, a repair
 * that silences the zone wholesale and one that fixes it look identical.
 */
describe('a layered module\'s root answers to its module\'s entry, in both gates (real eslint)', () => {
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot, rendered', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage', owns: ['rot-js'] },
        { name: 'Shared', does: 'primitives' },
      ],
      layers: [{ name: 'hooks', does: 'reactive state', layout: 'folder' }],
    },
  };

  const modularRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react({ 'rot-js': '^2.0.0', zustand: '^4.0.0' }),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/Fighter/index.jsx': 'export const Fighter = 1;\n',
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        'src/Shared/index.jsx': 'export const shared = 1;\n',
        'src/Fighter/hooks/useRun/index.jsx': 'export const useRun = 1;\n',
        ...files,
      },
    });

  it('keeps the layer vocabulary out of the root — four shapes lint runs green over', async () => {
    // A layer's `owns` is emitted onto the layer entries and this file is under
    // none of them; the other three are one fact, that the relative rule
    // registers no visitor here. Read as a layer the root has `Fighter.jsx` for
    // a layer name, and the ownership message said so out loud.
    const dir = modularRepo({
      'src/Fighter/Fighter.jsx':
        'import create from "zustand";\n'
        + 'import { attack } from "../Combat/index";\n'
        + 'import { useRun } from "./hooks/useRun/internals";\n'
        + 'export const Fighter = [create, attack, useRun];\n',
      'src/Fighter/hooks/useRun/internals.jsx': 'export const useRun = 1;\n',
    });

    expect((await cli(dir, ['impact'])).output).toContain('0 hits');
    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([]);
  });

  it('reddens what that entry does ban, at the root, in both gates', async () => {
    // The other half of the same claim: the zone is judged by its own entry, not
    // silenced. Four bans ride it and all four have to answer here.
    const dir = modularRepo({
      'src/Fighter/Fighter.jsx':
        'import ROT from "rot-js";\n'
        + 'import { shared } from "~app/Shared";\n'
        + 'import { useRun } from "~app/Fighter/hooks/useRun/internals";\n'
        + 'export const Fighter = [ROT, shared, useRun];\n',
      'src/Fighter/hooks/useRun/internals.jsx': 'export const useRun = 1;\n',
      'src/Fighter/Forward.jsx': 'export * from "~app/Combat";\n',
    });

    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([
      'package-ownership src/Fighter/Fighter.jsx',
      'undeclared-dependency src/Fighter/Fighter.jsx',
      'deep-import src/Fighter/Fighter.jsx',
      'module-reexport src/Fighter/Forward.jsx',
    ]);

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('3  no-restricted-imports — 1 file(s)');
    expect(impact.output).toContain('1  blueprint/no-module-reexport — 1 file(s)');
  });

  it('names a module, never the root\'s own filename, in what it does report', async () => {
    // The repair stated as its outcome. The filename did not get reworded out
    // of the sentence — the judgment that had only a filename to put there is
    // the one that no longer runs at this address.
    const dir = modularRepo({
      'src/Fighter/Fighter.jsx': 'import ROT from "rot-js";\nexport const Fighter = ROT;\n',
    });

    const inspect = await cli(dir, ['inspect', '--json']);
    const findings = JSON.parse(inspect.output).findings as Finding[];
    const ownership = findings.find((finding) => finding.rule === 'package-ownership');

    expect(ownership?.message).toContain('is owned by module Combat — not importable from "Fighter"');
    expect(ownership?.message).not.toContain('Fighter.jsx');
  });

  it('answers a layer file in the same module the other way, on the same imports', async () => {
    // The control that makes the silences above a statement about the zone and
    // not about the config: under a layer entry, both judgments come back.
    const dir = modularRepo({
      'src/Fighter/hooks/useRun/index.jsx':
        'import { attack } from "../../../Combat/index";\nexport const useRun = attack;\n',
    });

    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([
      'module-escape src/Fighter/hooks/useRun/index.jsx',
    ]);

    expect((await cli(dir, ['impact'])).output).toContain('1  blueprint/relative-escape — 1 file(s)');
  });

  it('extends none of it to an undeclared top folder at the same depth', async () => {
    // `scratch/notes.jsx` has the root's shape and none of its governance: no
    // module entry and no layer glob is expanded for a name `modules` does not
    // carry. `undeclared-module` reports the folder, and its own message says
    // lint stays green — which two errors under it in the same report used to
    // contradict three lines later.
    const dir = modularRepo({
      'src/scratch/notes.jsx':
        'import create from "zustand";\nexport * from "~app/Combat";\nexport const notes = create;\n',
    });

    expect((await cli(dir, ['impact'])).output).toContain('0 hits');
    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual(['undeclared-module src/scratch']);

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.output).toContain('lint stays green throughout');
    expect(inspect.output).toContain('outside: src/scratch/notes.jsx');
  });
});

/**
 * One level deeper than the folder above, where the misread thing is a layer's
 * NAME rather than a root's depth. The layer globs are expanded over the
 * DECLARED module list, so `src/scratch/hooks/` is reached by nothing while
 * carrying a declared layer's name at exactly the depth the per-file pass reads.
 *
 * Read in `inspect` alone, a repair that silences the position and one that
 * silences the whole layer zone look identical — so every case here runs the
 * same file twice, once under `scratch` and once under `Fighter`, and asserts
 * the real lint run at both. The control is the case: eight judgments and six
 * lint messages inside the declared module, none of either outside it.
 */
describe('an undeclared folder is not governed by a layer that shares its name (real eslint)', () => {
  const modular: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot, rendered', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets and damage', owns: ['rot-js'] },
      ],
      layers: [
        { name: 'components', does: 'render UI', layout: 'folder', owns: ['clsx'] },
        { name: 'hooks', does: 'reactive state', layout: 'folder', owns: ['zustand'] },
      ],
    },
  };

  const modularRepo = (files: Record<string, string>): string =>
    repo({
      packageJson: react({ clsx: '^2.0.0', 'rot-js': '^2.0.0', zustand: '^4.0.0' }),
      files: {
        'blueprint.config.mjs': configSource(modular),
        'jsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
        'src/Fighter/index.jsx': 'export const Fighter = 1;\n',
        'src/Combat/index.jsx': 'export const attack = 1;\n',
        'src/Fighter/hooks/useY/index.jsx': 'export const useY = 1;\n',
        'src/Fighter/hooks/useY/impl.jsx': 'export const impl = 1;\n',
        ...files,
      },
    });

  /** The same unit, addressing its own top folder, under either name. */
  const unit = (top: string): string =>
    'import cx from "clsx";\n'
    + 'import ROT from "rot-js";\n'
    + `import { impl } from "~app/${top}/hooks/useY/impl";\n`
    + 'import { away } from "../../../../outside/thing";\n'
    + 'export * from "~app/Combat";\n'
    + 'export const useX = [cx, ROT, impl, away];\n';

  it('judges the unit inside a declared module, in both gates', async () => {
    // The control, and it runs first because everything below is a silence.
    // Six findings against five lint messages, on one path: `deep-import` and
    // `flow-violation` are two verdicts about ONE specifier, which
    // `no-restricted-imports` reports once.
    const dir = modularRepo({ 'src/Fighter/hooks/useX/index.jsx': unit('Fighter') });

    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual([
      'package-ownership src/Fighter/hooks/useX/index.jsx',
      'package-ownership src/Fighter/hooks/useX/index.jsx',
      'deep-import src/Fighter/hooks/useX/index.jsx',
      'flow-violation src/Fighter/hooks/useX/index.jsx',
      'src-escape src/Fighter/hooks/useX/index.jsx',
      'module-reexport src/Fighter/hooks/useX/index.jsx',
    ]);

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('3  no-restricted-imports — 1 file(s)');
    expect(impact.output).toContain('1  blueprint/relative-escape — 1 file(s)');
    expect(impact.output).toContain('1  blueprint/no-module-reexport — 1 file(s)');
    expect(impact.output).toContain('5 hit(s)');
  });

  it('says nothing about the same unit under an undeclared top folder, matching lint', async () => {
    const dir = modularRepo({ 'src/scratch/hooks/useX/index.jsx': unit('scratch') });

    expect((await cli(dir, ['impact'])).output).toContain('0 hits');
    expect(errors(await cli(dir, ['inspect', '--json']))).toEqual(['undeclared-module src/scratch']);
  });

  it('leaves the folder note and the coverage line, which are the two that can act', async () => {
    // What has to survive: the finding addressed at the level an adopter can
    // act on, and the line that names the file as outside the nets. Silencing
    // the position without them would hide the folder instead of stating it.
    const dir = modularRepo({ 'src/scratch/hooks/useX/index.jsx': unit('scratch') });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.output).toContain('lint stays green throughout');
    expect(inspect.output).toContain('outside: src/scratch/hooks/useX/index.jsx');
  });

  it('asks for a unit entry inside the module and not inside the undeclared folder', async () => {
    // `no-entry`'s unit branch read the same layer name, and its own twin one
    // level up has asked `modules` since it was written.
    const inside = modularRepo({ 'src/Fighter/hooks/useNoEntry/thing.jsx': 'export const x = 1;\n' });

    expect(errors(await cli(inside, ['inspect', '--json'])))
      .toEqual(['no-entry src/Fighter/hooks/useNoEntry']);

    const outside = modularRepo({ 'src/scratch/hooks/useNoEntry/thing.jsx': 'export const x = 1;\n' });

    expect(errors(await cli(outside, ['inspect', '--json'])))
      .toEqual(['undeclared-module src/scratch']);
  });
});

/**
 * The modular adoption path, end to end through the real CLI — every other
 * `init` fixture in this file passes `--structure flat`, so nothing here has ever
 * run the modular arm on a real tree.
 *
 * `init` writes the DECLARED POSITIONS at the source root, which under `modules`
 * is the modules and never the layers: a layer folder there is an undeclared
 * module, which the same tool reports at error tier and tells you not to create.
 */
describe('init --structure modular builds the declared modules, and its report agrees', () => {
  const scaffolded = async (): Promise<string> => {
    const dir = repo({ packageJson: react() });

    const init = await cli(dir, ['init', '--structure', 'modular', '--preset', '--no-install']);

    expect(init.code).toBe(0);

    // The scaffolded config imports the package; offline fixtures have no
    // node_modules, so swap in the equivalent preset as data (as the flat
    // greenfield case above does).
    write(dir, 'blueprint.config.mjs', configSource(reactPreset({
      name: 'fixture',
      structure: 'modular',
    })));

    return dir;
  };

  it('writes the two declared modules and no layer folder at the source root', async () => {
    const dir = repo({ packageJson: react() });

    const init = await cli(dir, ['init', '--structure', 'modular', '--preset', '--no-install']);

    expect(init.code).toBe(0);
    expect(read(dir, 'src/app/index.js')).not.toBeNull();
    expect(read(dir, 'src/app/main.jsx')).not.toBeNull();
    expect(read(dir, 'src/common/index.js')).not.toBeNull();

    // One contract per member: every layer the modular preset declares, none of
    // which may exist as a folder of its own.
    for (const layer of ['components', 'hooks', 'contexts', 'services']) {
      expect(fs.existsSync(path.join(dir, 'src', layer))).toBe(false);
    }

    // …and no third module invented for a domain the tool has never seen.
    expect(fs.readdirSync(path.join(dir, 'src')).sort()).toEqual(['app', 'common']);
  });

  it('inspects that tree as clean, with one runway note per declared layer', async () => {
    const dir = await scaffolded();

    const inspect = await cli(dir, ['inspect', '--json']);

    expect(errors(inspect)).toEqual([]);

    // The count IS the claim here, unlike everywhere else in this section. Four
    // notes, one per declared layer, because a fresh scaffold has no module using
    // any layer yet: written as "no findings" it is false on the tree the scaffold
    // produces, and written as "exit 0" it passes while the notes disappear.
    expect(notes(inspect, 'missing-layer'))
      .toEqual(['components', 'hooks', 'contexts', 'services']);

    // And zero of the other one — the module notes the pre-scaffold tree carried
    // are what building the declared positions retires. `missing-layer` could move
    // to three or five without touching this.
    expect(notes(inspect, 'missing-module')).toEqual([]);

    const text = await cli(dir, ['inspect']);

    expect(text.code).toBe(0);
    expect(text.output).toContain('0 error(s), 0 warning(s)');
    expect(text.output).toContain('Coverage: 3/3 source files inside layer nets');
  });

  it('passes doctor on the tree it just built', async () => {
    const doctor = await cli(await scaffolded(), ['doctor']);

    expect(doctor.code).toBe(0);
    expect(doctor.output).toContain('✓ architecture clean');
  });

  it('refuses to guess the structure on a greenfield tree, and names the criterion', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'src/main.jsx': 'export const main = 1;\n',
        'src/App.jsx': 'export const App = 1;\n',
      },
    });

    const init = await cli(dir, ['init', '--preset', '--no-install']);

    expect(init.code).toBe(1);
    expect(init.output).toContain('blueprint init needs --structure here');

    expect(flattenProse(init.output))
      .toContain('below the brownfield threshold (10) — there is nothing here to measure');

    // Both answers, spelled as the commands that satisfy the refusal.
    expect(init.output).toContain('blueprint init --structure flat');
    expect(init.output).toContain('blueprint init --structure modular');
    expect(read(dir, 'blueprint.config.mjs')).toBeNull();
  });
});

/**
 * Most of this section pins what the tool does. This one pins whether a sentence
 * the tool prints about ITSELF is still true.
 *
 * `init`'s codeStyle note says the modular scaffold's own entries are inside the
 * gate and already conform to all ~68 rules, which is why `eslint . --fix` is a
 * no-op there. Nothing else in the repo guards that: a `codeStyle` default moves,
 * or the scaffolded content gains a line, and an emitted document keeps asserting
 * a conformance the tree no longer has. It fails differently from its neighbours
 * — not when behaviour changes, but when a default moves under a sentence nobody
 * re-read (#279).
 */
describe('the codeStyle note\'s claim about its own output is still true (real eslint)', () => {
  const adopted = async (): Promise<{ dir: string; init: CliResult }> => {
    const dir = repo({ packageJson: react() });

    const init = await cli(dir, ['init', '--structure', 'modular', '--preset', '--no-install']);

    write(dir, 'blueprint.config.mjs', configSource(reactPreset({
      name: 'fixture',
      structure: 'modular',
    })));

    return { dir, init };
  };

  it('states the reason the run itself can be checked against', async () => {
    const { init } = await adopted();

    expect(flattenProse(init.output))
      .toContain('the module entries above are inside the gate, not outside it');

    expect(flattenProse(init.output))
      .toContain('already conforming to all ~68 rules');
  });

  it('runs the real linter over the scaffold and finds nothing to fix', async () => {
    const { dir } = await adopted();

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('0 hits');
  });

  it('and that zero is the files conforming, not the gate failing to reach them', async () => {
    // Without this the case above is the vacuous green it exists to disprove: a
    // scaffold outside every glob lints clean for the reason the note denies.
    const { dir } = await adopted();

    write(dir, 'src/app/index.js', 'export const boot = "double"\n');

    const impact = await cli(dir, ['impact']);

    expect(impact.output).toContain('1  @stylistic/quotes — 1 file(s)');
    expect(impact.output).toContain('1  @stylistic/semi — 1 file(s)');
    expect(impact.output).toContain('src/app/index.js');
  });
});

/**
 * The handbook and the agent contract are read by an agent with nothing beside
 * them, and #187's own acceptance was a byte baseline — a throwaway process check
 * rather than a standing suite. So this is the only place that holds the emitted
 * documents to describing the tree their config declares, on a real `init` run
 * rather than on an emitter called in isolation.
 *
 * Asserted on what the documents SAY: a fixture checking that a handbook exists
 * passes on a handbook describing the flat shape, which is the state this release
 * measured — a 161-line handbook from a config declaring two modules, in which
 * neither module was named once.
 */
describe('the emitted documents describe the structure their config declares', () => {
  const emitted = async (structure: 'flat' | 'modular'): Promise<string> => {
    const dir = repo({ packageJson: react() });

    const init = await cli(dir, ['init', '--structure', structure, '--preset', '--no-install']);

    expect(init.code).toBe(0);

    return dir;
  };

  it('names the declared modules and draws the module tree in the handbook', async () => {
    const handbook = read(await emitted('modular'), 'docs/architecture-handbook.md') as string;

    expect(handbook).toContain('## Modules');
    expect(handbook).toContain('| `app` |');
    expect(handbook).toContain('| `common` |');
    // The drawn tree is a code fence, so its assertions stay raw — modules at the
    // root, a layer one level inside one of them.
    expect(handbook).toContain('├─ app/');
    expect(handbook).toContain('└─ common/');
    expect(handbook).toContain('# a layer, inside the module');
    expect(handbook).toContain('# a module — its root composes the layers below');

    expect(flattenProse(handbook))
      .toContain('A module declared `layers: false` opts out of the inner layer vocabulary');
  });

  it('puts no layer at the source root in that handbook', async () => {
    const handbook = read(await emitted('modular'), 'docs/architecture-handbook.md') as string;

    expect(flattenProse(handbook))
      .toContain('a layer has no folder of its own, so its address is `src/<module>/<layer>/`');

    // The flat handbook's unit-shape fence is rooted at a layer name in column
    // one; the modular one must not draw that, or two of the tool's own outputs
    // disagree about where a layer lives.
    expect(handbook).not.toContain('\ncomponents/\n');
  });

  it('carries the outer flow and the module rules into the contract an adopter reads', async () => {
    // CLAUDE.md gets the COMPACT contract — 14 lines, and the one nearly every
    // adopter reads. The full contract goes only to Cursor / Windsurf rule files.
    const contract = read(await emitted('modular'), 'CLAUDE.md') as string;

    expect(contract).toContain('Module flow: `app` → `common`');

    expect(flattenProse(contract))
      .toContain('Nothing inside a module imports its own root.');

    // The pass-through ban at the width it actually ships at: every file in the
    // module, not only its entry.
    expect(flattenProse(contract))
      .toContain('no file in a module — **every** file, not only its entry — re-exports another');

    expect(contract).toContain('module imports, module-root imports, module re-exports');
  });

  it('gains nothing modular on a flat config', async () => {
    const dir = await emitted('flat');
    const handbook = read(dir, 'docs/architecture-handbook.md') as string;
    const contract = read(dir, 'CLAUDE.md') as string;

    // Each negative is paired with a positive on the SAME document, because a
    // `not.toContain` is satisfied by a document that says nothing at all — an
    // empty or unwritten file passes every absence assertion here on its own.
    expect(handbook).not.toContain('## Modules');
    // The flat handbook is where a layer at the source root belongs.
    expect(handbook).toContain('\npages/\n');
    expect(contract).not.toContain('Module flow:');
    expect(contract).toContain('Layer flow: `pages` → `containers`');
  });
});

/**
 * `inspect` and `deps` read one module graph, and nothing made them answer the
 * same tree in the same run until this block existed. They disagreed: `inspect`
 * reported a `cycle` inside `src/scratch/`, `deps` ranked its two units and then
 * closed with a note calling that folder invisible to itself, and three lines
 * above both, `undeclared-module` said nothing governs it.
 *
 * In this layer rather than the unit suites because agreement between two
 * commands is not a property either one has. Each was internally consistent,
 * each was covered, and both read `buildModuleGraph` — only running them over
 * one fixture shows the seam. `deps` is also the second consumer that made this
 * its own ticket, so the fixture it is measured on has to be the same one.
 */
describe('the two graph readers agree about an ungoverned folder (real CLI)', () => {
  const governedTwice: Blueprint = {
    framework: 'react',
    architecture: {
      alias: '~app',
      modules: [
        { name: 'Fighter', does: 'the pilot', imports: ['Combat'] },
        { name: 'Combat', does: 'bullets' },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder' },
      ],
    },
  };

  // `hooks` is a declared layer NAME inside `scratch`, and nothing more: no
  // layer glob is expanded for a top folder the declared list has not got.
  const tree = (files: Record<string, string> = {}) =>
    repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(governedTwice),
        'src/Combat/index.js': 'export const C = 1;',
        'src/Combat/hooks/useHit/index.js': 'export const hit = 1;',
        'src/Fighter/index.js': 'import { C } from \'~app/Combat\';\nexport const F = C;',
        'src/scratch/hooks/useA/index.js': 'import { b } from \'../useB\';\nexport const a = b;',
        'src/scratch/hooks/useB/index.js': 'import { a } from \'../useA\';\nexport const b = a;',
        ...files,
      },
    });

  it('reports the folder once, as ungoverned, and never as a cycle', async () => {
    const inspected = await cli(tree(), ['inspect', '--json']);

    // The whole list: a `not.toContain('cycle')` stays green when a second
    // finding appears beside it, and the defect was two findings about one
    // folder rather than one wrong one.
    expect(errors(inspected)).toEqual(['undeclared-module src/scratch']);
  });

  it('keeps it out of both deps rankings while still naming it skipped', async () => {
    const parsed = JSON.parse((await cli(tree(), ['deps', '--json'])).output);

    expect(parsed.skipped).toEqual(['scratch']);

    expect(parsed.modules.map((entry: { module: string }) => entry.module).sort())
      .toEqual(['Combat', 'Fighter']);

    expect(parsed.units.map((entry: { unit: string }) => entry.unit))
      .toEqual(['Combat/hooks/useHit']);
  });

  it('answers a query inside it with the reason, in the declared level\'s noun', async () => {
    const answer = await cli(tree(), ['deps', 'scratch/hooks/useA']);

    expect(answer.output).toContain('"scratch/" is not a declared module');
    expect(answer.output).toContain('nothing governs it');
    // Not a fan-in report closing with a sentence about module boundaries, for
    // a folder no module boundary reaches.
    expect(answer.output).not.toContain('imported by');
  });

  it('drops an edge a declared module makes into it, in both commands', async () => {
    const dir = tree({
      'src/Fighter/hooks/useAim/index.js':
        'import { a } from \'../../../scratch/hooks/useA\';\nexport const aim = a;',
    });

    const inspected = await cli(dir, ['inspect', '--json']);
    const deps = JSON.parse((await cli(dir, ['deps', '--json'])).output);

    expect(errors(inspected)).toEqual([
      'undeclared-module src/scratch',
      'module-escape src/Fighter/hooks/useAim/index.js',
    ]);

    expect(deps.modules.map((entry: { module: string }) => entry.module)).not.toContain('scratch');

    // Nothing is lost by dropping the edge: the relationship is reported by the
    // reader built for undeclared roots, in the finding that owns the question.
    const undeclared = (JSON.parse(inspected.output).findings as Finding[])
      .find((finding) => finding.rule === 'undeclared-module');

    expect(undeclared?.message).toContain('"Fighter" reaches it');
  });
});
