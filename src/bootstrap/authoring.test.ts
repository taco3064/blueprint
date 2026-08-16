import { describe, expect, it } from 'vitest';

import {
  AGENT_PROMPT,
  AUTHORING_FILE,
  authoringActions,
  authoringBrief,
  BROWNFIELD_MIN_FILES,
  COMMAND_FILE,
} from './authoring';
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
  ownableImports: [],
  packageUsage: [{ package: 'axios', folders: ['services'] }],
  unresolved: [{ prefix: '~root', count: 12 }],
  totalFiles: 120,
};

const brief = authoringBrief(
  survey,
  'pnpm add -D @kekkai/blueprint',
  { claudeDir: { hadDir: false, otherCommands: 0 } },
);

/** The same playbook below the brownfield threshold, where the early exit leads. */
const small = authoringBrief(
  { ...survey, totalFiles: 3 },
  'npm install -D @kekkai/blueprint',
  { claudeDir: { hadDir: false, otherCommands: 0 } },
);

describe('authoringActions', () => {
  it('writes the playbook, the command file, installs the package, then instructs', () => {
    const actions = authoringActions(
      survey,
      {
        packageManager: 'pnpm',
        needsInstall: true,
        claudeDir: { hadDir: false, otherCommands: 0 },
        viteTs: null,
        tscOut: null,
      },
    );

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
    const actions = authoringActions(
      survey,
      {
        packageManager: 'npm',
        needsInstall: false,
        claudeDir: { hadDir: false, otherCommands: 0 },
        viteTs: null,
        tscOut: null,
      },
    );

    expect(actions.map((action) => action.kind)).toEqual(['write', 'write', 'instruct']);
  });

  it('downgrades to an instruct with the exact command under --no-install', () => {
    const actions = authoringActions(survey, {
      packageManager: 'npm',
      needsInstall: true,
      claudeDir: { hadDir: false, otherCommands: 0 },
      viteTs: null,
      tscOut: null,
      install: false,
    });

    const skipped = actions.find(
      (action) => action.kind === 'instruct' && action.note.includes('Install skipped'),
    );

    expect(skipped?.note).toContain('npm install -D @kekkai/blueprint');
  });
});

describe('authoringBrief', () => {
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
    // The conclusion must come before the method, not sit buried inside it.
    expect(small.indexOf('Read this first')).toBeGreaterThan(-1);
    expect(small.indexOf('Read this first')).toBeLessThan(small.indexOf('## Prerequisites'));
    expect(small).toContain('counted 3 source file(s)');

    // The full method stays below — the count can be wrong about structure.
    expect(small).toContain('## Method');

    // At or above the threshold the verdict block stays out of the playbook.
    expect(brief).not.toContain('Read this first');
  });

  it('carries the whole early-exit checklist in that verdict block (batch 10)', () => {
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
  });

  it('reads exactly the threshold as brownfield, one below it as the early exit', () => {
    const install = 'npm install -D @kekkai/blueprint';
    const facts = { claudeDir: { hadDir: false, otherCommands: 0 } };
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
});

describe('authoringBrief · the method it prescribes', () => {
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

    expect(flattenProse(brief)).toContain(
      '`impact` is the same kind of read-only feedback but is NOT available at this point',
    );

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
});

describe('authoringBrief · how its prose is wrapped', () => {
  it('never breaks a line mid-sentence, whichever conditional arm renders', () => {
    // The sentence-per-line pass came with four invariants, and all four are
    // preservation properties — no word lost, fences byte-identical, list markers
    // counted, continuations indented. None of them can see the goal itself, so one
    // sentence stayed split: a lead-in element ending in "and" sat directly above a
    // `renderBuildArtifacts()` call, and the `\n` join put a break inside it. It read
    // fine rendered and could not be grepped, which is the defect the pass existed to
    // remove. A conjunction, preposition or comma at end of line is the unambiguous
    // form of it — deliberately narrow, because plenty of legitimate lines (list
    // items, catalog bullets) end without terminal punctuation.
    const arms = [
      authoringBrief(survey, 'npm i', { claudeDir: { hadDir: false, otherCommands: 0 } }),
      authoringBrief(
        survey,
        'npm i',
        { claudeDir: { hadDir: true, otherCommands: 0 }, next: true },
      ),
      authoringBrief(
        { ...survey, totalFiles: 3 },
        'npm i',
        { claudeDir: { hadDir: false, otherCommands: 0 } },
      ),
      authoringBrief({ ...survey, totalFiles: 3 }, 'npm i', {
        claudeDir: { hadDir: true, otherCommands: 0 },
        viteTs: { verdict: 'covered', viteFile: 'vite.config.ts', tsconfig: 'tsconfig.node.json' },
      }),
      authoringBrief({ ...survey, totalFiles: 3 }, 'npm i', {
        claudeDir: { hadDir: false, otherCommands: 0 },
        viteTs: { verdict: 'outside', viteFile: 'vite.config.ts', tsconfig: 'tsconfig.json' },
      }),
    ];

    for (const text of arms) {
      let fenced = false;

      const dangling = text.split('\n').filter((line) => {
        if (line.trimStart().startsWith('```')) {
          fenced = !fenced;

          return false;
        }

        return !fenced && /(,|\b(and|or|but|of|with|which|that)) *$/.test(line);
      });

      expect(dangling).toEqual([]);
    }
  });
});

describe('authoringBrief · what the closing sections carry', () => {
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
    const nextBrief = authoringBrief(
      survey,
      'npm install -D @kekkai/blueprint',
      { next: true, claudeDir: { hadDir: false, otherCommands: 0 } },
    );

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
    const standalone = authoringBrief(
      survey,
      'npm install -D @kekkai/blueprint',
      { claudeDir: { hadDir: false, otherCommands: 0 } },
    );

    expect(standalone).not.toContain('Next.js project');

    expect(
      authoringBrief(
        survey,
        'npm install -D @kekkai/blueprint',
        { next: true, claudeDir: { hadDir: false, otherCommands: 0 } },
      ),
    )
      .toContain('Next.js project');
  });
});
