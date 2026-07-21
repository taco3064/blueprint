import { describe, expect, it } from 'vitest';

import { AGENT_PROMPT, AUTHORING_FILE, authoringActions, authoringBrief, COMMAND_FILE } from './authoring';
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
});
