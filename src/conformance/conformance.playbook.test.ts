import { afterEach, describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
// Test-only import of the full emit module — src keeps the patterns-leaf
// boundary; the fixture needs emitLint's real selectors, not a paraphrase.
import {
  cli,
  configSource,
  flattenProse,
  makeRepo,
  react,
  read,
  rm,
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

describe('brownfield playbook — semantics stated, nothing reverse-engineered (batches 1–3)', () => {
  it('says a skipped doctor check is neither green nor red, '
    + 'and still exits 0 (field run #129)', async () => {
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
    expect(playbook).toContain('must not import each other'); // folder ≠ entry-only (batch 6 fix)
    expect(playbook).toContain('is a complete outcome'); // zero debt is legitimate (batch 4)
    expect(playbook).toContain('into ONE entry'); // flat-config merge trap (batches 5–6)
    expect(playbook).toContain('includes test files'); // survey/inspect count gap (batch 2)

    expect(playbook).toContain(
      'cross-check every translated clause',
    ); // stale intent docs (batch 2)

    expect(read(dir, '.claude/commands/blueprint-author.md')).toContain('blueprint-authoring.md');
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

    expect(flattenProse(playbook)).toContain(
      'only the split lets you say which edit each one verified',
    );

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
        'tsconfig.app.json': '{ "compilerOptions": { "noEmit": true, "tsBuildInfoFile": '
          + '"./node_modules/.tmp/app.tsbuildinfo" }, "include": ["src"] }',
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

    await cli(dir, ['init', '--no-install']);

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

    const init = await cli(dir, ['init', '--no-install']);

    expect(init.code).toBe(0);
    // The reference is written, so a merge is genuinely ahead of the reader.
    expect(read(dir, 'eslint.config.blueprint.mjs')).toContain('emitLint');
    expect(init.output).toContain('An entry is more than its selectors');
    expect(init.output).toContain('`npx blueprint rules --json` carries both');
    expect(init.output).toContain('Doctor compares selectors, not scope');
  });
});

describe('merge caveats meet the agent at the point of need (batch 14)', () => {
  it('init names TS7016 and its remedies when the existing config is '
    + 'eslint.config.ts', async () => {
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

    const init = await cli(dir, ['init', '--preset', '--no-install']);

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
    expect(playbook).toContain('joins the loop at Method step 9');
    expect(playbook).not.toContain('`inspect` and `impact` are read-only');

    // The drafting-loop step names inspect alone; impact appears only with
    // init in front of it. (The dep failure itself cannot be staged here —
    // this suite supplies the real plugins by design; impact.test.ts owns
    // the message.)
    expect(playbook).toContain(
      'Validate — the loop that keeps you honest.** Run `npx blueprint inspect`.',
    );
  });
});

describe('"ONE entry" is per collision, not per rule key (field issue #51)', () => {
  it('the playbook scopes the combine instruction to the entry you actually collide '
    + 'with', async () => {
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
    expect(playbook).toContain(
      '"ONE entry" means one per COLLISION, not one for the whole rule key',
    );

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
    expect(playbook).toContain(
      'probes every layer separately and names the one that lost its selectors',
    );
  });
});

describe('the merge recipe hands over the whole entry, not just its selectors (#60)', () => {
  const selfOnly: Blueprint = {
    name: 'merge',
    framework: 'react',
    architecture: {
      alias: '~app',
      layers: [
        { name: 'views', does: 'screens' },
        {
          name: 'contexts',
          does: 'shared state',
          allowedImporters: [{ layer: 'views', selfOnly: true }],
        },
      ],
      folder: { layout: 'flat', entry: 'index', private: [] },
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
