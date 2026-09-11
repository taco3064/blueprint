import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../../config';
import { emitLint } from './lint';

const linter = new Linter({ configType: 'flat' });

const base = defineBlueprint({
  framework: 'auto',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: 'UI' },
      { name: 'services', does: 'I/O' },
    ],
  },
});

function config(blueprint = base) {
  return [
    { languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const } },
    ...emitLint(blueprint),
  ];
}

describe('emitLint · alias patterns', () => {
  it('escapes a leading-hash alias for no-restricted-imports patterns', () => {
    const blueprint = defineBlueprint({
      ...base,
      architecture: { ...base.architecture, alias: '#' },
    });

    const ids = linter
      .verify(
        'import Button from "#/components/Button";',
        config(blueprint),
        { filename: 'src/services/api.ts' },
      )
      .map((message) => message.ruleId);

    expect(ids).toContain('no-restricted-imports');
  });

  it('deduplicates overlapping canonical and secondary alias patterns', () => {
    const blueprint = defineBlueprint({
      ...base,
      architecture: {
        ...base.architecture,
        alias: '@',
        additionalAliases: { '@/components': 'src/components' },
      },
    });

    const messages = linter.verify(
      'import Button from "@/components/Button";',
      config(blueprint),
      { filename: 'src/services/api.ts' },
    );

    expect(messages.some((message) => message.fatal)).toBe(false);
    expect(messages.map((message) => message.ruleId)).toContain('no-restricted-imports');
  });
});
