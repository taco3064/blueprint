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

describe('an instruction states its own reach too (field runs #91–#93)', () => {
  it('says the codeStyle --fix pass is a no-op while the layers are empty', async () => {
    // This text was added last round, and it prescribed running `--fix` and landing a
    // commit unconditionally. Two agents caught it independently: one downgraded it to
    // "when the first file lands in a layer", the other nearly filed it as a misleading
    // instruction. The playbook states reach for its lint and build steps in four
    // places; this instruct did not — the same class, in my own new sentence.
    const dir = repo({ packageJson: react() });

    const init = await cli(dir, ['init', '--no-install']);

    expect(init.code).toBe(0);
    expect(init.output).toContain('when there IS code inside a layer');
    expect(init.output).toContain('that pass is a no-op');
    expect(init.output).toContain('which is when the --fix pass earns its commit');
  });

  it('blames regenerated wording on the build, not on the version string (field run '
    + '#115)', async () => {
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

    await cli(dir, ['init', '--no-install']);

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

    write(
      dir,
      'blueprint.config.mjs',
      '// why 400: largest file is 117 lines\nexport default {};\n',
    );

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
          {
            name: 'contexts',
            does: 'state',
            allowedImporters: [{ layer: 'components', selfOnly: true }],
          },
        ],
        module: { layout: 'flat', entry: 'index', private: [] },
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
    expect(flattenProse(playbook)).toContain(
      'any field in the prior config that the schema sketch below does not show',
    );

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
              {
                name: 'contexts',
                does: 'state',
                allowedImporters: [{ layer: 'views', selfOnly: true }],
              },
            ],
            module: { layout: 'flat', entry: 'index', private: [] },
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

    await cli(dir, ['init', '--preset', '--no-install']);

    const reference = read(dir, 'eslint.config.blueprint.mjs') ?? '';

    expect(reference).toContain('as far as the files it actually parsed');
    expect(reference).toContain('proves this config loads, not that the');
    expect(reference).toContain('Skipping the block is still right either way');
  });
});
