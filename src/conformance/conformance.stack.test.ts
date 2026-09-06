import { afterEach, describe, expect, it } from 'vitest';

import { cli, configSource, makeRepo, react, reactBlueprint, read, rm } from './conformance';
import type { Blueprint } from '../config';
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

describe('one stack, three documents agreeing about `explicitAny` (#389)', () => {
  // The one gate whose availability is not in the blueprint: `any` is a TypeScript
  // construct with no core rule behind it, so on a JS project nothing holds it. The rule
  // catalog said so from the start; the three emitted documents did not, because the two
  // pure emitters were handed a forced `hasTypescript: true` rather than the fact
  // `detect` already had. One document disagreeing with the other two about one config
  // is the shape this suite exists to catch.
  const declaring: Blueprint = {
    ...reactBlueprint,
    rules: { ...reactBlueprint.rules, explicitAny: 'error' },
    // One target of each strategy: the compact pointer block a person maintains, and
    // the tool-owned file carrying the full contract. Two renderers, one helper.
    emit: { agents: ['claude', 'cursor'] },
  };

  const CONTRACTS = ['CLAUDE.md', '.cursor/rules/blueprint.mdc'];
  const HANDBOOK = 'docs/architecture-handbook.md';

  /**
   * An emitted document's text, with its existence asserted first. Every claim below is
   * about what a document says, and a file that is not there collapses to `''`, which
   * answers every negative one of them — so an emitter that stopped writing on this
   * stack would read as one that wrote a clean document.
   */
  function document(dir: string, path: string): string {
    const content = read(dir, path);

    expect(content, path).not.toBeNull();

    return content ?? '';
  }

  /** The reason `blueprint rules` prints for this repo — never a copy pasted here. */
  async function catalogReason(dir: string): Promise<string> {
    const catalog = await cli(dir, ['rules', '--json']);

    const { gates } = JSON.parse(catalog.output) as {
      gates: { id: string; unavailable?: string }[];
    };

    const gate = gates.find((entry) => entry.id === 'explicitAny');

    // The authority for the reason has to carry the row it is authority over: gone from
    // the catalog and available here both answer `''` otherwise, and the TypeScript case
    // below reads that `''` as the second one.
    expect(gate, 'explicitAny in `blueprint rules --json`').toBeDefined();

    return gate?.unavailable ?? '';
  }

  it('names it hard in none of the three, in each surface\'s own form', async () => {
    const dir = repo({
      packageJson: react(),
      files: { 'blueprint.config.mjs': configSource(declaring) },
    });

    const init = await cli(dir, ['init', '--no-install']);

    expect(init.code).toBe(0);

    // Read off the command rather than restated: a needle copied into this file goes on
    // passing after the sentence it quotes has drifted, and the whole claim here is
    // that the three documents say what that command says.
    const reason = await catalogReason(dir);

    expect(reason).toContain('TypeScript construct');

    // Both contracts drop the gate — the form each already uses for a gate the stack
    // cannot open. `unusedVars` is declared beside it and needs no carrier, so it has to
    // survive: dropping every gate on a JS stack satisfies the negative line on its own,
    // and that is the failure the TypeScript case names from its own side.
    for (const path of CONTRACTS) {
      const contract = document(dir, path);

      expect(contract, path).toContain('`unusedVars`');
      expect(contract, path).not.toContain('explicitAny');
    }

    // The handbook keeps the row, because the declaration is the author's, and its
    // legend already documents the `nothing` cell for exactly this case.
    expect(document(dir, HANDBOOK))
      .toContain(`| \`explicitAny\` | \`error\` | — | nothing — ${reason} |`);
  });

  it('moves nothing where the stack does carry TypeScript', async () => {
    // Assert both directions, or the fix passes by dropping the gate everywhere.
    const dir = repo({
      packageJson: react({ typescript: '^5.9.0' }),
      files: { 'blueprint.config.mjs': configSource(declaring) },
    });

    const init = await cli(dir, ['init', '--no-install']);

    expect(init.code).toBe(0);

    // The same command has no cause to report here, which is the other half of reading
    // the reason off it rather than out of this file.
    expect(await catalogReason(dir)).toBe('');

    expect(document(dir, 'CLAUDE.md')).toContain('`explicitAny`');

    expect(document(dir, '.cursor/rules/blueprint.mdc'))
      .toContain('- `explicitAny` is a hard gate.');

    expect(document(dir, HANDBOOK)).toContain('| `explicitAny` | `error` | — | lint |');
  });
});
