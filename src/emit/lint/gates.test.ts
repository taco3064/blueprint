import { describe, expect, it } from 'vitest';

import { DOC_ONLY_RULES, enforcedBy, PLUGIN_GATES } from './gates';

describe('PLUGIN_GATES', () => {
  it('lists every conditional gate with an id, what it emits, and a scope note', () => {
    // `blueprint rules` prints this catalog and doctor reads it to decide which
    // gates should resolve. An entry emptied to `{}` puts an undefined id into
    // LINT_GATED_RULE_IDS and a blank row into both of those.
    expect(PLUGIN_GATES.map((gate) => gate.id)).toEqual([
      'unusedVars',
      'explicitAny',
      'codeStyle',
      'statementsPerLine',
      'statementPadding',
      'importBlock',
      'fixtureImports',
      'deepWatch',
      'usePrefix',
      'usePrefixReactivity',
      'testFilename',
      'typedefOnlyFile',
      'cycles',
    ]);

    for (const gate of PLUGIN_GATES) {
      expect(gate.emits).toBeTruthy();
      expect(gate.note).toBeTruthy();
    }
  });
});

describe('enforcedBy — which machine holds a declared rule (field issue #52)', () => {
  it('separates lint gates from inspect gates from documentation', () => {
    // LINT_GATED_RULE_IDS answers "gated at all?"; the handbook needs "gated
    // by what?", because "`error` fails lint" is false for two of these.
    expect(enforcedBy('maxLines')).toBe('lint');
    expect(enforcedBy('codeStyle')).toBe('lint');
    expect(enforcedBy('importBlock')).toBe('lint');
    expect(enforcedBy('cycles')).toBe('inspect');
    expect(enforcedBy('deadCode')).toBe('docs');
    expect(enforcedBy('somethingNobodyDeclared')).toBe('docs');
  });

  it('stays in step with the catalog rather than hard-coding the exceptions', () => {
    // Every gate the catalog marks with a runtime resolves to that runtime,
    // and every other machine-gated id resolves to lint — so adding a
    // runtime-backed gate needs no second edit here.
    for (const gate of PLUGIN_GATES) {
      expect(enforcedBy(gate.id)).toBe(gate.runtime ?? 'lint');
    }

    for (const id of DOC_ONLY_RULES.map((rule) => rule.id)) {
      expect(enforcedBy(id)).toBe('docs');
    }
  });
});
