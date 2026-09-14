import { describe, expect, it } from 'vitest';

import { renderCompactContract } from './sections';
import type { ArchitectureDef, AxisDef, Blueprint, PrincipleDef } from '../../config';
import { enforcedBy, LINT_GATED_RULE_IDS } from '../lint';

function arch(over: Partial<ArchitectureDef> = {}): ArchitectureDef {
  return {
    alias: '~app',
    layers: [
      {
        name: 'components', does: 'UI', layout: 'folder', entry: 'index',
        mustNot: ['import services'], owns: ['clsx'],
      },
      { name: 'services', does: 'net', layout: 'folder', entry: 'index' },
    ],
    ...over,
  };
}

function blueprint(over: Partial<Blueprint> = {}): Blueprint {
  return { framework: 'vue', architecture: arch(), ...over };
}

describe('renderCompactContract', () => {
  it('fits project facts on one screen with links carrying the bulk', () => {
    const out = renderCompactContract({
      ...blueprint(),
      rules: { maxLines: { tier: 'error' as const, value: 300 }, cycles: 'error' as const },
      playbook: [{ title: 'T', rules: [{ id: 'r', say: 'do' }] }],
    });

    // 13, not 12: the header spends one line saying hand-written notes live
    // outside the markers — the convention an agent had to infer when the
    // generated file became the repo's only CLAUDE.md (field #21).
    expect(out.split('\n').length).toBeLessThanOrEqual(13);

    expect(out).toContain('`components` → `services`');

    expect(out).toContain('[docs/architecture-handbook.md](docs/architecture-handbook.md)');

    expect(out).toContain('node_modules/@kekkai/blueprint/agent-contract.md');

    expect(out).toContain('`maxLines` = 300');

    expect(out).toContain('the working playbook');

    expect(out).not.toContain('### Where code goes');

    // One inspect-held gate reads in the singular, and is NOT counted among what
    // lint holds — `cycles` sits on LINT_GATED_RULE_IDS (gated at all?) while its
    // runtime is inspect, and the contract used to say lint catches it.
    expect(out).not.toMatch(/`cycles`[^.;]*fail the project's lint run/);
  });

  it('never lists a gate the lint run cannot fail on', () => {
    // "these fail the project's lint run" is a sentence about the reader's own repo, and
    // it was false for a gate this blueprint cannot emit: `deepWatch` declared `error`
    // on React, `testFilename` declared beside `testFiles: []`. The contract is the file
    // an agent reads with nothing beside it (field run #150).
    const out = renderCompactContract({
      ...blueprint({ framework: 'react' }),
      architecture: { ...arch(), testFiles: [] },
      rules: {
        deepWatch: 'error',
        testFilename: 'error',
        maxLines: { tier: 'error' as const, value: 300 },
      },
    });

    expect(out).not.toContain('deepWatch');

    expect(out).not.toContain('testFilename');

    // The one that does emit still holds the sentence up — an empty list would drop the
    // clause instead, and then nothing would be asserting the split at all.
    expect(out).toContain('`maxLines`');

    expect(out).toContain('effective project-lint wiring is unverified');

    // Same gates, the stack each was written for: both back on the list.
    const vue = renderCompactContract({
      ...blueprint(),
      rules: { deepWatch: 'error', testFilename: 'error' },
    });

    expect(vue).toContain('deepWatch');

    expect(vue).toContain('testFilename');
  });

  it('drops the inspect clause entirely when no such gate is declared', () => {
    // A clause about an empty set reads as a gap where there is none.
    const lintOnly = renderCompactContract({
      ...blueprint(),
      rules: { maxLines: { tier: 'error' as const, value: 300 } },
    });

    expect(lintOnly).toContain('`maxLines` = 300');

    expect(lintOnly).toContain('effective project-lint wiring is unverified');

    expect(lintOnly).not.toContain('blueprint inspect --baseline` instead');

    // No runner named: this file is generated from the blueprint alone, and init
    // detecting pnpm while its contract said `npm run lint` is what that guess cost
    // (field run #141). The reader finds the script in package.json either way.
    expect(lintOnly).not.toContain('npm run');
  });

  it('is singular because exactly one gate is inspect-held', () => {
    // The sentence above uses a singular verb, with no plural arm — correct today and a
    // branch nothing could take, so it is not written. This is what makes that safe:
    // add a second inspect-held rule and this turns red, instead of shipping
    // "cycles, somethingElse is diagnosed".
    expect(LINT_GATED_RULE_IDS.filter((id) => enforcedBy(id) === 'inspect')).toEqual(['cycles']);
  });

  it('announces only the kinds of content the blueprint carries', () => {
    // The pointer line names what the handbook covers. Naming "the working
    // playbook" in a contract that carries none sends the agent to a section
    // that was never generated.
    const bare = renderCompactContract(blueprint());

    expect(bare).not.toContain('component-shape axes');

    expect(bare).not.toContain('behavioral principles');

    expect(bare).not.toContain('the working playbook');

    // And with nothing extra to name, the clause closes straight after
    // "naming" — anything appended there is a promise of content that the
    // handbook does not hold.
    expect(bare).toContain('ownership, naming: read');

    const rich = renderCompactContract(blueprint({
      componentShape: [{ id: 'a', name: 'Axis', say: 's', why: 'w' } as AxisDef],
      principles: [{ id: 'p', say: 's', why: 'w', land: 'claude' } as PrincipleDef],
      playbook: [{ title: 'T', rules: [{ id: 'r', say: 'do' }] }],
    }));

    expect(rich).toContain('component-shape axes');

    expect(rich).toContain('behavioral principles');

    expect(rich).toContain('the working playbook');
  });

  it('prints a gate value only where the setting carries one', () => {
    const out = renderCompactContract(blueprint({
      rules: { maxLines: { tier: 'error' as const, value: 300 }, cycles: 'error' as const },
    }));

    // `cycles` is a bare tier with no number behind it, and "= undefined" in a
    // list of machine-enforced gates reads as a real threshold.
    expect(out).toContain('`cycles`');

    expect(out).not.toContain('`cycles` =');
  });

  it('lists only ids a machine actually gates', () => {
    // Error tier is what the author declared; being gated is what the tooling
    // can keep. `noUtils` has no rule behind it and `deadCode` is knip's job —
    // naming either on the one-screen contract promises enforcement that never
    // arrives, and the agent stops looking for the parts that are enforced.
    const out = renderCompactContract(blueprint({
      rules: {
        maxLines: { tier: 'error' as const, value: 300 },
        noUtils: 'error',
        deadCode: 'error',
      },
    }));

    expect(out).toContain('`maxLines` = 300');

    expect(out).not.toContain('noUtils');

    expect(out).not.toContain('deadCode');
  });

  it('honors a handbook path override', () => {
    const out = renderCompactContract({
      ...blueprint(),
      emit: { handbook: 'HB.md' },
    });

    expect(out).toContain('[HB.md](HB.md)');
  });
});
