import { afterEach, describe, expect, it } from 'vitest';

// Test-only import of the full emit module — src keeps the patterns-leaf
// boundary; the fixture needs emitLint's real selectors, not a paraphrase.
import { reactPreset } from '../presets';
import {
  cli,
  configSource,
  flattenProse,
  makeRepo,
  react,
  reactBlueprint,
  read,
  rm,
  write,
} from './conformance';
import type { RepoSpec } from './conformance';

const dirs: string[] = [];

const repo = (spec: RepoSpec = {}): string => {
  const dir = makeRepo(spec);

  dirs.push(dir);

  return dir;
};

afterEach(() => {
  while (dirs.length) {
    rm(dirs.pop() as string);
  }
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
      version: 2,
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

  it('a draft config that never mentions module.private validates and runs', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'src/components/Button.tsx': 'export const Button = 1;',
        // Hand-written draft-first config — the field shape that tripped on
        // "private is required": omitting it now means none.
        'blueprint.config.mjs': [
          'export default {',
          '  framework: \'react\',',
          '  architecture: {',
          '    alias: \'~app\',',
          '    layers: [{ name: \'components\', does: \'render UI\' }],',
          '    module: { layout: \'flat\', entry: \'index\' },',
          '  },',
          '  rules: {},',
          '};',
          '',
        ].join('\n'),
      },
    });

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.code).toBe(0);
    expect(inspect.output).not.toContain('module.private');
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
    await cli(dir, ['init', '--preset', '--no-install']);
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

describe('locked debt stays green under the baseline ratchet (field issue #10)', () => {
  it('inspect --baseline suppresses locked debt — the live-verified repro', async () => {
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--no-install']);
    write(dir, 'blueprint.config.mjs', configSource(reactPreset({ name: 'fixture' })));

    // The field repro: create debt, lock it, then run the gate line.
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

describe('a baseline survives a reworded finding, and an old one says so', () => {
  const withDebt = (): string => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource(reactBlueprint),
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

    expect(document.version).toBe(2);
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
        message: '"random" is not a declared layer — declare it, '
          + 'or move its code into a module of an existing layer.',
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
    expect(output).toContain('version 2');
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

  it('closes a passing architecture report with the derivation, '
    + 'not only a failing one', async () => {
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
    // Both layers are declared and flat in this fixture, so the keys are the layer
    // names and there is one real edge between them.
    const dir = adopted({
      'src/services/api.js': 'export const api = 1;',
      'src/components/Cart.js': 'import { api } from \'~app/services/api\';\nexport const Cart = '
        + '() => api;',
    });

    const leaderboard = await cli(dir, ['deps']);
    // `services` is a flat layer in this preset, so the answer is at layer granularity.
    const module = await cli(dir, ['deps', 'services']);

    expect(flattenProse(leaderboard.output)).toContain('source text, not a parsed AST');
    expect(flattenProse(module.output)).toContain('source text, not a parsed AST');
    // The blast-radius answer needs it most: a fan-in of 1 that a computed import
    // made 2 is a wrong decision, not just an incomplete list.
    expect(module.output).toContain('imported by (1)');
  });
});
