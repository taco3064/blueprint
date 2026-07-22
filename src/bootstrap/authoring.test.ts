import { describe, expect, it } from 'vitest';

import { AGENT_PROMPT, AUTHORING_FILE, authoringActions, authoringBrief, COMMAND_FILE } from './authoring';
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
    const actions = authoringActions(survey, { packageManager: 'pnpm', needsInstall: true });

    expect(actions.map((action) => action.kind)).toEqual(['write', 'write', 'install', 'instruct']);

    const [playbook, command, install, instruct] = actions;

    expect(playbook).toMatchObject({ path: AUTHORING_FILE });
    expect(command).toMatchObject({ path: COMMAND_FILE });
    expect(command.kind === 'write' && command.content).toBe(`${AGENT_PROMPT}\n`);

    // The config the agent writes imports the package — it must be installed.
    expect(install.kind === 'install' && install.command).toBe('pnpm add -D @kekkai/blueprint');

    // The instruct carries both launch commands and the preset escape hatch.
    expect(instruct.note).toContain(`claude "${AGENT_PROMPT}"`);
    expect(instruct.note).toContain(`codex "${AGENT_PROMPT}"`);
    expect(instruct.note).toContain('init --preset');
  });

  it('skips the install action when the package is already a dependency', () => {
    const actions = authoringActions(survey, { packageManager: 'npm', needsInstall: false });

    expect(actions.map((action) => action.kind)).toEqual(['write', 'write', 'instruct']);
  });

  it('downgrades to an instruct with the exact command under --no-install', () => {
    const actions = authoringActions(survey, {
      packageManager: 'npm',
      needsInstall: true,
      install: false,
    });

    const skipped = actions.find(
      (action) => action.kind === 'instruct' && action.note.includes('Install skipped'),
    );

    expect(skipped?.note).toContain('npm install -D @kekkai/blueprint');
  });
});

describe('authoringBrief', () => {
  const brief = authoringBrief(survey, 'pnpm add -D @kekkai/blueprint');

  it('opens with the install prerequisite', () => {
    expect(brief).toContain('## Prerequisites');
    expect(brief).toContain('pnpm add -D @kekkai/blueprint');
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
    const small = authoringBrief({ ...survey, totalFiles: 3 }, 'npm install -D @kekkai/blueprint');

    // The conclusion must come before the method, not sit buried inside it.
    expect(small.indexOf('Read this first')).toBeGreaterThan(-1);
    expect(small.indexOf('Read this first')).toBeLessThan(small.indexOf('## Prerequisites'));
    expect(small).toContain('counted 3 source file(s)');

    // The full method stays below — the count can be wrong about structure.
    expect(small).toContain('## Method');

    // At or above the threshold the verdict block stays out of the playbook.
    expect(brief).not.toContain('Read this first');
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

  it('forbids manufacturing a net — the empty-net twin of manufactured debt', () => {
    // Batch 9: an agent invented a `*` layer so coverage would be non-zero.
    expect(brief).toContain('An empty net is equally legitimate');
    expect(brief).toContain('Never invent\na layer');
    expect(brief).toContain('belongs to\nthe project\'s own lint');

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
    expect(brief).toContain('check\n   the documents from step 1 before dropping it');
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
    expect(brief).toContain('zero\n     lint hits is a complete outcome');
    expect(brief).toContain('manufacturing debt just to demo the ratchet');

    // First live field run: --suppress-all on a clean lint wrote an empty
    // ledger — the ceremony ban now covers the lint side explicitly.
    expect(brief).toContain('an empty ledger is ceremony');
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
    const nextBrief = authoringBrief(survey, 'npm install -D @kekkai/blueprint', true);

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
