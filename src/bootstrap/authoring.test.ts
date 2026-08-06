import { describe, expect, it } from 'vitest';

import { AGENT_PROMPT, AUTHORING_FILE, authoringActions, authoringBrief, BROWNFIELD_MIN_FILES, COMMAND_FILE } from './authoring';
// Test-only helper from the test-only module — the playbook is hand-wrapped
// prose, so an assertion that needs a whole sentence flattens it first rather
// than naming the column the source broke at.
//
// This edge runs UPWARD against the layering (`bootstrap` sits well above
// `conformance`, which imports `../cli`), and it is allowed for one reason: the
// layer rule governs the SHIPPED graph, and neither rolldown input
// (`src/index.ts`, `src/cli/cli.ts`) reaches `conformance` or any `*.test.ts`.
// Both suites assert on the same emitted prose, so one definition of "wrap-
// independent" beats two. The cost is real and worth knowing before copying the
// move: importing `conformance` pulls the whole CLI into this unit test's import
// graph. That is why it stays confined to test files — the same import from a
// non-test file in `bootstrap` would be a genuine layering break, not this
// exception.
import { flattenProse } from '../conformance';
import { LINT_GATED_RULE_IDS, METRIC_GATES } from '../emit/lint';
import type { SurveyResult } from '../survey';

const survey: SurveyResult = {
  framework: 'react',
  typescript: true,
  packageManager: 'npm',
  aliases: { '@': 'src' },
  rootFiles: ['main.tsx'],
  folders: [
    {
      folder: 'resources',
      files: 100,
      directFiles: 0,
      childFolders: 20,
      indexedChildren: 17,
      maxDepth: 5,
    },
  ],
  edges: [{ from: 'resources', to: 'components', count: 42 }],
  selfAliasImports: { components: 7 },
  testEvidence: [{ pattern: '**/*.test.*', files: 12 }],
  packageUsage: [{ package: 'axios', folders: ['services'] }],
  unresolved: [{ prefix: '~root', count: 12 }],
  totalFiles: 120,
};

describe('authoringActions', () => {
  it('writes the playbook, the command file, installs the package, then instructs', () => {
    const actions = authoringActions(survey, { packageManager: 'pnpm', needsInstall: true, hadClaudeDir: false });

    expect(actions.map((action) => action.kind)).toEqual(['write', 'write', 'install', 'instruct']);

    const [playbook, command, install, instruct] = actions;

    expect(playbook).toMatchObject({ path: AUTHORING_FILE });
    expect(command).toMatchObject({ path: COMMAND_FILE });
    expect(command.kind === 'write' && command.content).toBe(`${AGENT_PROMPT}\n`);

    // The config the agent writes imports the package — it must be installed.
    expect(install.kind === 'install' && install.command).toBe('pnpm add -D @kekkai/blueprint');

    // The bridge into the playbook: an agent that just ran init must read its
    // own next step here (the homepage prompt no longer carries it), not read
    // "have an agent execute it" as someone else's job and hand back.
    expect(instruct.note).toContain('If you are the agent that ran this');
    expect(instruct.note).toContain('execute it to the end yourself, autonomously');
    expect(instruct.note).toContain('early exit the playbook prescribes IS completion');

    // The human-driven fallback still carries both launch commands and the
    // preset escape hatch.
    expect(instruct.note).toContain(`claude "${AGENT_PROMPT}"`);
    expect(instruct.note).toContain(`codex "${AGENT_PROMPT}"`);
    expect(instruct.note).toContain('init --preset');
  });

  it('skips the install action when the package is already a dependency', () => {
    const actions = authoringActions(survey, { packageManager: 'npm', needsInstall: false, hadClaudeDir: false });

    expect(actions.map((action) => action.kind)).toEqual(['write', 'write', 'instruct']);
  });

  it('downgrades to an instruct with the exact command under --no-install', () => {
    const actions = authoringActions(survey, {
      packageManager: 'npm',
      needsInstall: true, hadClaudeDir: false,
      install: false,
    });

    const skipped = actions.find(
      (action) => action.kind === 'instruct' && action.note.includes('Install skipped'),
    );

    expect(skipped?.note).toContain('npm install -D @kekkai/blueprint');
  });
});

describe('authoringBrief', () => {
  const brief = authoringBrief(survey, 'pnpm add -D @kekkai/blueprint', { hadClaudeDir: false });

  it('opens with the install prerequisite', () => {
    expect(brief).toContain('## Prerequisites');
    expect(brief).toContain('pnpm add -D @kekkai/blueprint');
  });

  it('tells the executing agent to run autonomously — the only place that framing lives', () => {
    // The homepage prompt dropped "work autonomously"; the tool output has to
    // carry it now. The header is the first line the agent reads on opening.
    //
    // The banner is a blockquote, so its lines carry a `> ` continuation marker.
    // Flattening alone folded that marker into the sentence — `do > not stop` —
    // asserting a string the emitted document does not contain, and crossing the
    // line `flattenProse` itself draws: whitespace collapses, structure does not.
    // Strip the marker first, then flatten, and the needle is the real sentence.
    const banner = flattenProse(brief.replace(/^> /gm, ''));

    expect(banner).toContain('autonomously — do not stop to ask for confirmation');

    // Structure, asserted as position rather than as a line break: the framing
    // has to sit in the opening banner, not somewhere below the method.
    expect(banner.indexOf('autonomously')).toBeLessThan(banner.indexOf('## Prerequisites'));
  });

  /**
   * The emitted table of contents, in order, as one contract instead of twelve
   * adjacencies nobody asserts.
   *
   * The split turned the document's order into a list of `render*` calls, which
   * is a shape an edit or a merge can permute — and permuting it is invisible to
   * every other assertion here, because a reordered document still contains every
   * string. Measured on this suite before the test existed: swapping
   * `renderMethod()` and `renderSemantics()` in the composition left all 1154
   * tests green, emitting a playbook whose semantics section precedes the method
   * it refers to.
   *
   * It is the same failure the boundary fix in this refactor had to be caught by
   * hand: a partition that is shifted, or a sequence that is permuted, satisfies
   * containment. So the guard is the sequence itself, and `it.each` over pairs
   * would not do — the contract is the ORDER, which only the whole list carries.
   */
  const SECTIONS = [
    '## Prerequisites',
    '## Goal and boundary',
    '## Method',
    '## Semantics the linter holds you to',
    '## Rule catalog — ask this file, not the bundle',
    '## Config schema sketch',
    '## Acceptance gates',
    '## If you stop midway',
    '## Survey evidence',
  ];

  const headings = (text: string): string[] =>
    text.split('\n').filter((line) => line.startsWith('## '));

  it('emits every section once, in order', () => {
    expect(headings(brief)).toEqual(SECTIONS);
  });

  it('prepends the verdict below the threshold and reorders nothing else', () => {
    const small = authoringBrief({ ...survey, totalFiles: 3 }, 'npm install -D @kekkai/blueprint', { hadClaudeDir: false });

    // The one conditional section, and it leads — the conclusion before the method.
    expect(headings(small)).toEqual([
      '## Read this first — the survey already points at the exit',
      ...SECTIONS,
    ]);
  });

  it('carries the goal boundary: author and baseline, never refactor', () => {
    expect(brief).toContain('Out of scope: fixing the debt');
    expect(brief).toContain('--update-baseline');
  });

  it('sanctions the preset early exit — a starter deserves no ceremony', () => {
    expect(brief).toContain('Early exit is a legitimate verdict');
    expect(brief).toContain('(10 source files)'); // the real threshold, interpolated
    expect(brief).toContain('npx blueprint init --preset');
  });

  it('leads with the early-exit verdict below the threshold (batch 10)', () => {
    const small = authoringBrief({ ...survey, totalFiles: 3 }, 'npm install -D @kekkai/blueprint', { hadClaudeDir: false });

    // The conclusion must come before the method, not sit buried inside it.
    expect(small.indexOf('Read this first')).toBeGreaterThan(-1);
    expect(small.indexOf('Read this first')).toBeLessThan(small.indexOf('## Prerequisites'));
    expect(small).toContain('counted 3 source file(s)');

    // The full method stays below — the count can be wrong about structure.
    expect(small).toContain('## Method');

    // Field issues #7/#8: "execute fully" vs "early exit" read as a
    // contradiction, and the exit's own steps were scattered — the verdict
    // block now carries the resolution and the complete checklist.
    expect(flattenProse(small)).toContain('IS executing the playbook fully');
    expect(flattenProse(small)).toContain('trivially true is true');
    expect(small).toContain('now-empty');

    // Issue #9's second catch: the old step 3 promised 'no reference file
    // is ever written' — false on a repo with its own eslint config. The
    // checklist now carries the merge step conditionally.
    expect(small).toContain('Did init write');
    expect(small).toContain('DELETE the reference');
    expect(flattenProse(small)).toContain('inspect --baseline');

    // Every starter run re-derived "why bother on an empty repo" in its
    // judgment section — the answer lived only on the docs site. Doctrine
    // that answers a recurring doubt belongs in the agent's channel.
    expect(small).toContain('emptiness is the point');
    expect(flattenProse(small)).toContain('adopts two years and 400 files later');

    // Final field round: the checklist claimed completeness while omitting
    // the tool declaration Method step 9 mandates — a literal walk emitted
    // two contracts with doctor green. Step 1 carries the declaration now.
    expect(small).toContain('--preset --agent claude');
    expect(small).toContain('one run emits one contract');

    // At or above the threshold the verdict block stays out of the playbook.
    expect(brief).not.toContain('Read this first');
  });

  it('reads exactly the threshold as brownfield, one below it as the early exit', () => {
    const install = 'npm install -D @kekkai/blueprint';
    const facts = { hadClaudeDir: false };
    const at = authoringBrief({ ...survey, totalFiles: BROWNFIELD_MIN_FILES }, install, facts);

    const below = authoringBrief(
      { ...survey, totalFiles: BROWNFIELD_MIN_FILES - 1 },
      install,
      facts,
    );

    // 120 and 3 leave the boundary itself unasserted, and what sits either
    // side of it is a different playbook — not a shade of wording.
    expect(at).not.toContain('Read this first');
    expect(below).toContain('Read this first');
  });

  it('authorizes drafting first — the loop corrects, the archive stalls (batch 12)', () => {
    // Field diagnosis of a slow run: half tool opacity (the rule catalog
    // fixed that), half an agent's understand-everything-first instinct.
    // The playbook now explicitly licenses the fast path.
    expect(brief).toContain('Work the loop, not the archive');
    expect(brief).toContain('NOT a syllabus');
    expect(brief).toContain('agents that drafted first finished');
    expect(brief).toContain('note the gap in your report instead');
  });

  it('keeps impact OUT of the drafting loop — it needs init\'s plugins (field issue #35)', () => {
    // Both brownfield agents of run #35/#36 read "let the tools correct you:
    // inspect and impact are read-only and cheap" as a licence to run impact
    // while drafting, and hit the @stylistic load error. Only inspect runs
    // config-only; impact lints, so it waits for the deps init installs.
    expect(brief).toContain('then let `inspect` correct you');
    expect(flattenProse(brief)).toContain('needs nothing installed');
    expect(flattenProse(brief)).toContain('`impact` is the same kind of read-only feedback but is NOT available at this point');
    expect(flattenProse(brief)).toContain('joins the loop at Method step 9, after init');
  });

  it('forbids manufacturing a net — the empty-net twin of manufactured debt', () => {
    // Batch 9: an agent invented a `*` layer so coverage would be non-zero.
    expect(brief).toContain('An empty net is equally legitimate');
    expect(flattenProse(brief)).toContain('Never invent a layer');
    expect(flattenProse(brief)).toContain('belongs to the project\'s own lint');

    // Field issue #1: the inverse stance was missing — a preset's declared-
    // but-empty layers are the runway, and the tool must say keep vs slim.
    expect(brief).toContain('runway, not a manufactured net');
  });

  it('keeps deliverables and gates zero-debt-consistent — no mandatory ledger', () => {
    // Batch 4's fight, previously alive inside our own gates: a clean repo
    // writes no baseline file, so neither deliverable nor gate may demand one.
    expect(brief).toContain('only when debt exists');
    expect(brief).toContain('correctly absent when it does not');
    expect(brief).not.toContain('after the baseline is locked');
  });

  it('puts existing intent documents senior to the matrix', () => {
    expect(brief).toContain('Look for existing intent documents first');
    expect(brief).toContain('structure.config.json');
    expect(brief).toContain('senior');
    expect(flattenProse(brief)).toContain('check the documents from step 1 before dropping it');
  });

  it('encodes the method: intent over zero-findings, per-layer shapes, ownership', () => {
    expect(brief).toContain('never contort the order to make findings zero');
    expect(brief).toContain('module: { layout: \'folder\', entry: \'index\' }');
    expect(brief).toContain('owns');
    expect(brief).toContain('findings explosion');
  });

  it('downgrades stale intent clauses instead of trusting documents blindly', () => {
    expect(brief).toContain('cross-check every translated clause');
    expect(brief).toContain('record the conflict in your report');
  });

  it('carries the full rule catalog so nobody reads the minified bundle (batch 12)', () => {
    expect(brief).toContain('## Rule catalog — ask this file, not the bundle');
    expect(brief).toContain('always emitted');
    expect(brief).toContain('emit.lint.severity');

    // Every machine-gated id is in the catalog — a new gate cannot ship
    // without its catalog line, or this loop names the omission.
    for (const id of LINT_GATED_RULE_IDS) {
      expect(brief).toContain(`\`${id}\``);
    }

    // Metric thresholds interpolate from METRIC_GATES — never hand-copied.
    for (const gate of METRIC_GATES) {
      expect(brief).toContain(`\`${gate.id}\` → \`${gate.rule}\` (default ${gate.fallback})`);
    }

    expect(brief).toContain('never an ESLint line');
    expect(brief).toContain('`deadCode` — knip\'s job');

    // Two field traps travel with the method: the structure-lint token and
    // the retired tool's stale footprint (batch 12).
    expect(brief).toContain('`{folder}` placeholder is blueprint\'s');
    expect(brief).toContain('footprint in the same pass');

    // Field issue #4: an agent dropped a house rule because the catalog
    // never said owns covers named imports; another had to eval emitLint to
    // learn no-selfOnly means no syntax rule. The catalog answers both now.
    expect(brief).toContain('named-import granularity');
    expect(brief).toContain('no selfOnly, no syntax rule');
    expect(brief).toContain('`additionalAliases`');
    expect(brief).toContain('DELETE its config file');

    // Field issue #5: the one remaining bundle eval was key-collision
    // archaeology — the catalog states scope and key-level merge guidance.
    expect(brief).toContain('root wiring sits outside all of them');
    expect(brief).toContain('collisions are decided by rule KEY');
    expect(brief).toContain('flag and config end up saying the same thing');

    // Field issues #7/#8: the schema's full owns/additionalAliases shapes
    // live here (never only in dist), the test-file exemption is named as
    // a deliberate relaxation, and impact gates the suppress-all run.
    expect(brief).toContain('nothing else lives only in dist');
    expect(brief).toContain('additionalAliases');
    expect(brief).toContain('Test files are EXEMPT');
    expect(brief).toContain('zero hits means SKIP this command');
  });

  it('states the lint semantics up front so nobody reverse-engineers the bundle', () => {
    expect(brief).toContain('## Semantics the linter holds you to');
    expect(brief).toContain('same-layer *relative*');
    expect(brief).toContain('blueprint/relative-escape');
    expect(brief).toContain('Same-folder imports via the alias');
    expect(brief).toContain('argsIgnorePattern');
    expect(brief).toContain('eslint wired');

    // Folder layout: siblings are banned outright — not "entry-only", which
    // would send authors into a wiring explosion; the fix differs by layout.
    expect(brief).toContain('must not import each other');
    expect(brief).toContain('layout-dependent');
  });

  it('teaches the merge traps: flat-config override, DAG linearization, honest zero', () => {
    // Same rule in a later entry REPLACES the earlier — ordering cannot save
    // a rule both sides set; the only fix is merging into one entry.
    expect(brief).toContain('the later entry *replaces* the earlier');
    expect(brief).toContain('into ONE entry');
    expect(brief).toContain('survived the merge');

    // Intent docs often draw a DAG; the linear order is a transitive relaxation.
    expect(brief).toContain('Linearize, then verify against the matrix');

    // Zero findings is a valid end state — never manufacture debt to lock.
    expect(flattenProse(brief)).toContain('zero lint hits is a complete outcome');
    expect(brief).toContain('manufacturing debt just to demo the ratchet');

    // First live field run: --suppress-all on a clean lint wrote an empty
    // ledger — the ceremony ban now covers the lint side explicitly.
    expect(brief).toContain('an empty ledger is ceremony');
  });

  // The five members of `printConfigCaveats`, restated because the source keeps
  // the function private. Before they were one shared unit each site carried its
  // own paraphrase, and only two of the five were asserted anywhere — the other
  // three could be deleted with the whole suite green, which is how the two
  // copies drifted four ways in the first place. One case per member now.
  const caveats = [
    ['plugin prefix', 'plugin prefix (`@stylistic/max-len`, never bare `max-len`)'],
    ['empty layer', 'holds no files does not appear at all (inspect\'s `declaratory-self-only` note, not a loss)'],
    ['selfOnly importer', 'resolves on the IMPORTER layer inspect names, not on the layer being protected'],
    ['finding ids', '**inspect\'s finding names are not ESLint rule ids**'],
    ['migration pointer', 'migration steps name the carrying rule for each finding, and mark the ones no lint run will ever show'],
  ] as const;

  it.each(caveats)('warns that %s makes a correct config look broken', (_label, text) => {
    expect(flattenProse(brief)).toContain(text);
  });

  it('carries the caveats on both paths that reach --print-config, from one source', () => {
    const small = authoringBrief({ ...survey, totalFiles: 3 }, 'npm install -D @kekkai/blueprint', { hadClaudeDir: false });
    const occurrences = (text: string) => text.split('resolved keys carry their').length - 1;

    // Method step 9's merge always renders; the early-exit checklist's lint step
    // only below the threshold. Two sites, one text — assert the count, or a
    // future edit can quietly go back to maintaining two copies by hand.
    expect(occurrences(brief)).toBe(1);
    expect(occurrences(small)).toBe(2);

    // Same indent-agnostic text at both, which is the point of sharing it: three
    // spaces inside the numbered checklist item, five inside the merge bullet.
    for (const [, text] of caveats) expect(flattenProse(small)).toContain(text);
  });

  it('indents every caveat line for the list its site sits in', () => {
    const small = authoringBrief({ ...survey, totalFiles: 3 }, 'npm install -D @kekkai/blueprint', { hadClaudeDir: false });

    // Raw, never flattened: the indent IS the assertion, and `flattenProse`
    // collapses exactly what is under test. Three spaces continues a numbered
    // checklist item, five continues a bullet nested under one — pass the wrong
    // one and the emitted markdown list breaks while every other assertion here
    // stays green. Stryker cannot see it either: `StringLiteral` is excluded by
    // measurement, which its config calls the boundary around prose and NOT
    // around a discrete contract per literal. Two indents are that contract.
    const indents = (text: string) => text
      .split(', or a correct config looks broken:')
      .slice(1)
      .map((rest) => rest
        .split('will ever show.')[0]
        .split('\n')
        .slice(1)
        .map((line) => line.length - line.trimStart().length))
      .map((widths) => [...new Set(widths)]);

    // One entry per site, in document order, each holding exactly one width —
    // so a mixed indent inside a block fails as loudly as a wrong one.
    expect(indents(brief)).toEqual([[5]]);
    expect(indents(small)).toEqual([[3], [5]]);
  });

  it('embeds the survey evidence and the schema sketch', () => {
    expect(brief).toContain('resources → components');
    expect(brief).toContain('~root/…'); // the unresolved-alias hint travels with the evidence
    expect(brief).toContain('defineBlueprint');
    expect(brief).toContain('allowedImporters');
  });

  it('states the failure semantics: resumable, nothing lost', () => {
    expect(brief).toContain('Nothing is lost');
    expect(brief).toContain(COMMAND_FILE);
  });

  it('carries the Next.js route-tree guidance when next is true', () => {
    const nextBrief = authoringBrief(survey, 'npm install -D @kekkai/blueprint', { next: true, hadClaudeDir: false });

    expect(nextBrief).toContain('Next.js project');
    expect(nextBrief).toContain('app` → `components');
    expect(nextBrief).toContain('Never scaffold or');
  });

  it('finishes with the integration details: declare the tool, merge hand-written files', () => {
    expect(brief).toContain('emit: { agents: [\'claude\'] }');
    expect(brief).toContain('.blueprint.md');
    expect(brief).toContain('link, don\'t duplicate');
  });

  it('makes consolidation a precondition when the overlapping tool sets the same rules', () => {
    // "flag it, don't decide it" self-destructs when both tools emit
    // no-restricted-* — the entries overwrite each other (batch 8).
    expect(brief).toContain('flag it, don\'t decide it');
    expect(brief).toContain('mechanically impossible');
    expect(brief).toContain('becomes a wiring precondition');
  });
});

describe('authoringBrief · the Next.js note', () => {
  it('stays out unless the caller asks for it', () => {
    // `next` is only set when init detected a Next route tree it could not place.
    // Defaulting it the other way hands every brief a paragraph about a framework
    // the repo may not use, and tells the reader to declare a layer that is not
    // there.
    const standalone = authoringBrief(survey, 'npm install -D @kekkai/blueprint', { hadClaudeDir: false });

    expect(standalone).not.toContain('Next.js project');

    expect(authoringBrief(survey, 'npm install -D @kekkai/blueprint', { next: true, hadClaudeDir: false }))
      .toContain('Next.js project');
  });
});
