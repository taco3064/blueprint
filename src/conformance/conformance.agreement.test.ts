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
  wiredEslintConfig,
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

    await cli(dir, ['init', '--no-install']);

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

    const init = await cli(dir, ['init', '--no-install']);

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

    const init = await cli(dir, ['init', '--no-install']);

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

    await cli(dir, ['init', '--no-install']);

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
const owningRepo = (): string => repo({
  packageJson: react(),
  files: {
    'blueprint.config.mjs': configSource(owning),
    'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~app/*': ['./src/*'] } } }),
    'eslint.config.mjs': wiredEslintConfig(owning),
    'src/components/f.jsx': 'export const f = () => 1;\n',
    'src/services/api.js': 'export const api = 1;\n',
  },
});

describe('what a second output knows about the first (field runs #75–#77)', () => {
  it('rules and doctor agree on what doctor compares (field run #159)', async () => {
    // Two live outputs, same repo, opposite instructions for a merge. `rules` closed its
    // per-layer block with "Everything below is what doctor compares" — and the block
    // below it prints a `packages:` column, while doctor's own ✓ says
    // "package-ownership entries … are not compared". A folding agent reading `rules`
    // would skip the `--print-config` pass the playbook asks for precisely because
    // doctor cannot see that column. Neither sentence was asserted, so they drifted.
    const dir = owningRepo();

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
      .toContain('`no-import`, `globals` and the selfOnly selectors are what doctor compares');

    expect(flattenProse(rules.output)).toContain('`packages` is not compared by');
    expect(flattenProse(rules.output)).toContain('--print-config');
  });

  it('carries that same caveat into `rules --json`, beside the column', async () => {
    // #117's shape: that fix put the caveat in the text and left the JSON bare, and the
    // same doubt came back three releases later through the channel the playbook sends a
    // folding agent to.
    const dir = owningRepo();

    const rules = await cli(dir, ['rules']);
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
          {
            name: 'contexts',
            does: 'cross-tree state',
            allowedImporters: [{ layer: 'components', selfOnly: true }],
          },
        ],
        folder: { layout: 'flat', entry: 'index', private: [] },
      },
    }));

    const inspect = await cli(dir, ['inspect']);

    expect(inspect.output).toContain('is declaratory');
    expect(inspect.output).toContain('ENTRY is emitted today');
    expect(inspect.output).toContain('merges neither into the other');
    expect(inspect.output).toContain('"Cannot fire" is about the ban, not about the entry');
  });
});

describe('what the playbook checks before it claims it (field runs #75–#77)', () => {
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

  it('does not call `.claude/commands/` empty when the owner has commands there (field run '
    + '#139)', async () => {
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

  it('names the detected runner where it can, and none where it cannot (field run '
    + '#141)', async () => {
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
    await cli(pnpmRepo, ['init', '--preset', '--no-install']);

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

  it('names the same cleanup targets everywhere it instructs cleanup (field run '
    + '#124)', async () => {
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

describe('one story per state — the tools do not contradict each other (field run #10)', () => {
  it('doctor never claims a baseline on a truly clean repo', async () => {
    const dir = repo({ packageJson: react() });

    await cli(dir, ['init', '--no-install']);
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

    const init = await cli(dir, ['init', '--preset', '--no-install']);

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

describe('one violation, one name per channel (field issue #48)', () => {
  it('inspect names the rule that carries each finding, through the real CLI', async () => {
    const dir = repo({
      packageJson: react(),
      files: {
        'blueprint.config.mjs': configSource({
          ...reactBlueprint,
          architecture: {
            ...reactBlueprint.architecture,
            folder: { layout: 'folder', entry: 'index', private: [] },
          },
        }),
        'src/components/Card/index.js': 'export const Card = 1;\n',
        'src/components/Card/inner.js': 'export const inner = 1;\n',
        // Reaches inside a folder-layout feature folder — inspect's [deep-import],
        // emitted as one more pattern group on no-restricted-imports.
        'src/services/api.js': 'import { inner } from \'~app/components/Card/inner\';\nexport '
          + 'const api = inner;\n',
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
