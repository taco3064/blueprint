import { describe, expect, it } from 'vitest';

import { authoringBrief } from './authoring';
// The test-only helper from the test-only module. The upward import edge —
// `bootstrap` sits well above `conformance` — is what `authoring.test.ts`
// justifies at length; this file takes the same edge for the same reason.
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

describe('authoringBrief · the rule catalog', () => {
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
  });

  it('answers in the catalog every question a field agent had to eval the bundle for', () => {
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
});

describe('authoringBrief · the lint semantics it states', () => {
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
});

describe('authoringBrief · merging with an eslint config already there', () => {
  it('teaches the merge traps: flat-config override, DAG linearization, honest zero', () => {
    // Same rule in a later entry REPLACES the earlier, so a rule both sides set
    // needs one merged entry where they overlap. Ordering is not the fix there —
    // but it is load-bearing for the arrangement that carries the merge, which is
    // the assertion two blocks down.
    expect(brief).toContain('the later entry *replaces* the earlier');
    expect(brief).toContain('into ONE entry');
    expect(brief).toContain('survived the merge');

    // …but only on the files BOTH entries match (#163). Stated without that
    // qualifier, the sentence generated three downstream scope claims that were
    // false, so the qualifier is a contract of its own rather than a nicety.
    expect(brief).toContain('on the files both of them match');
    expect(brief).toContain('only the overlap has to be combined');

    // And the probe that catches the loss doctor cannot see: your own rule's files
    // outside the net, plus BOTH sides of the collision inside it — one file per
    // net stopped being enough once a part-of-a-net entry became the shape we
    // recommend, which is the blind spot wiring.ts's own SCOPE string names.
    expect(brief).toContain('takes TWO probes rather than one');
    expect(brief).toContain('one file your own rule governed outside that net');
    expect(brief).toContain('an entry scoped to part of a net is not compared');

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
    [
      'empty net',
      'holds no files does not appear at all (inspect\'s `declaratory-self-only` note, not a loss)',
    ],
    [
      'selfOnly importer',
      'resolves on the IMPORTER net inspect names, not on the net being protected',
    ],
    ['finding ids', '**inspect\'s finding names are not ESLint rule ids**'],
    [
      'migration pointer',
      'migration steps name the carrying rule for each finding, '
      + 'and mark the ones no lint run will ever show',
    ],
  ] as const;

  it.each(caveats)('warns that %s makes a correct config look broken', (_label, text) => {
    expect(flattenProse(brief)).toContain(text);
  });

  it('carries the caveats on both paths that reach --print-config, from one source', () => {
    const occurrences = (text: string) => text.split('resolved keys carry their').length - 1;

    // Method step 9's merge always renders; the early-exit checklist's lint step
    // only below the threshold. Two sites, one text — assert the count, or a
    // future edit can quietly go back to maintaining two copies by hand.
    expect(occurrences(brief)).toBe(1);
    expect(occurrences(small)).toBe(2);

    // Same indent-agnostic text at both, which is the point of sharing it: three
    // spaces inside the numbered checklist item, five inside the merge bullet.
    for (const [, text] of caveats) {
      expect(flattenProse(small)).toContain(text);
    }
  });

  it('emits the shared caveats inline, so there is no indent left to get wrong', () => {
    // `printConfigCaveats` used to wrap, so it had to be told the indent of the
    // list it sat in — three spaces inside a numbered item, five inside a bullet
    // under one — and passing the wrong one broke the emitted markdown list while
    // every other assertion stayed green. One sentence per line removed that
    // decision rather than fixing it: the caveats join their host line, so the
    // contract is now that they carry no newline at all. A regression to a
    // `\n`-joined helper puts the opening and the closing on different lines.
    for (const text of [brief, small]) {
      const hosts = text.split('\n').filter((line) => line.includes('resolved keys carry their'));

      expect(hosts.length).toBeGreaterThan(0);

      for (const line of hosts) {
        expect(line).toContain('and mark the ones no lint run will ever show.');
      }
    }
  });
});
