import { describe, expect, it } from 'vitest';
import { defineBlueprint, resolveArchitecture } from './index';
import type { ArchitectureDef, Blueprint } from './types';

const architecture: ArchitectureDef = {
  alias: '~app',
  modules: [{ name: 'auth', does: 'Authentication.' }],
  layers: [{ name: 'components', does: 'Presentation.' }],
};

function blueprint(value: unknown): Blueprint {
  return { framework: 'react', architecture: { ...architecture,
    consumerFiles: value as ArchitectureDef['consumerFiles'] } };
}

describe('consumerFiles authoring', () => {
  it.each([undefined, [], 'scripts/seed.ts', ['.storybook/**/*.tsx', 'e2e/*.ts']])(
    'accepts %j without rewriting authoring values', (value) => {
      const bp = blueprint(value);

      expect(defineBlueprint(bp)).toBe(bp);
      expect(bp.architecture.consumerFiles).toEqual(value);
    },
  );

  it.each([null, false, 42, {}, '', ' \t\n', [null], [false], [42], [{}], [''],
    [' \t'], ['scripts/*.ts', 1], [1, 'scripts/*.ts']])(
    'rejects %j with a field-specific fact', (value) => {
      expect(() => defineBlueprint(blueprint(value))).toThrowError(
        expect.objectContaining({ fact: { kind: 'consumer-files' } }),
      );
    },
  );

  it('still rejects an unknown sibling', () => {
    const bp = blueprint([]);

    Object.assign(bp.architecture, { consumerFile: 'tools/*.ts' });

    expect(() => defineBlueprint(bp)).toThrowError(expect.objectContaining({
      fact: expect.objectContaining({ kind: 'unknown-key', key: 'consumerFile' }),
    }));
  });
});

describe('resolved consumerFiles', () => {
  it.each([undefined, []])('has no implicit consumers for %j', (consumerFiles) => {
    const resolved = resolveArchitecture({ ...architecture, consumerFiles }).consumerFiles;

    expect(resolved.globs).toEqual([]);

    for (const folder of ['.storybook', 'storybook', 'e2e', 'playwright', 'cypress',
      'scripts', 'fixtures', 'examples', 'codegen', 'tools']) {
      expect(resolved.matches(`${folder}/preview.ts`)).toBe(false);
    }
  });

  it('normalizes a string and isolates the resolved array from authoring mutations', () => {
    expect(resolveArchitecture({ ...architecture, consumerFiles: 'scripts/*.ts' })
      .consumerFiles.globs).toEqual(['scripts/*.ts']);

    const consumerFiles = ['scripts/*.ts'];
    const resolved = resolveArchitecture({ ...architecture, consumerFiles }).consumerFiles;

    consumerFiles.push('e2e/*.ts');
    expect(resolved.globs).toEqual(['scripts/*.ts']);
    expect(resolved.matches('scripts/seed.ts')).toBe(true);
    expect(resolved.matches('e2e/run.ts')).toBe(false);
  });

  it.each([
    ['.storybook/**/*.{ts,tsx}', '.storybook/preview.ts', true],
    ['.storybook/**/*.{ts,tsx}', '.storybook/nested/preview.tsx', true],
    ['.storybook/**/*.{ts,tsx}', '.storybook/preview.js', false],
    ['e2e/*.ts', 'e2e/spec.ts', true],
    ['e2e/*.ts', 'e2e/nested/spec.ts', false],
    ['tools/?.ts', 'tools/a.ts', true],
    ['tools/?.ts', 'tools/ab.ts', false],
    ['scripts/seed.ts', 'scripts/seed.ts', true],
    ['scripts/seed.ts', 'scripts/seedXts', false],
    ['!tools/*.ts', 'tools/a.ts', false],
    ['tools/[ab].ts', 'tools/a.ts', false],
    ['tools/@(a).ts', 'tools/a.ts', false],
  ])('uses the existing portable dialect %s against %s', (glob, file, expected) => {
    expect(resolveArchitecture({ ...architecture, consumerFiles: glob })
      .consumerFiles.matches(file)).toBe(expected);
  });

  it.each([['**/*.tsx', 'tools/*.ts'], ['tools/*.ts', '**/*.tsx', '**/*.tsx']])(
    'matches as a set regardless of order or duplicates: %j', (...consumerFiles) => {
      const policy = resolveArchitecture({ ...architecture, consumerFiles }).consumerFiles;

      expect(policy.matches('tools/seed.ts')).toBe(true);
      expect(policy.matches('stories/demo.tsx')).toBe(true);
      expect(policy.matches('other/seed.ts')).toBe(false);
    },
  );

  it('protects source-root boundary and keeps application-relative coordinates', () => {
    const policy = resolveArchitecture({ ...architecture,
      sourceRoot: './packages/app/src/', consumerFiles: '**',
    }).consumerFiles;

    expect(policy.matches('packages/app/src')).toBe(false);
    expect(policy.matches('packages/app/src/auth/main.ts')).toBe(false);
    expect(policy.matches('packages/app/src-other/main.ts')).toBe(true);
    expect(policy.matches('packages/other/src/main.ts')).toBe(true);
    expect(policy.matches('./packages\\app\\src\\auth\\main.ts')).toBe(false);
    expect(policy.matches('./tools\\seed.ts')).toBe(true);

    const exact = resolveArchitecture({ ...architecture, sourceRoot: 'packages/app/src',
      consumerFiles: 'tools/seed.ts' }).consumerFiles;

    expect(exact.matches('tools/seed.ts')).toBe(true);
    expect(exact.matches('packages/app/tools/seed.ts')).toBe(false);
  });

  it('protects the default source root from broad patterns', () => {
    const policy = resolveArchitecture({ ...architecture, consumerFiles: '**/*.tsx' })
      .consumerFiles;

    expect(policy.matches('src/auth/components/Button.stories.tsx')).toBe(false);
    expect(policy.matches('stories/Button.stories.tsx')).toBe(true);
  });

  it.each(['.', './', ''])('has no consumers with project-root source %j', (sourceRoot) => {
    const policy = resolveArchitecture({ ...architecture, sourceRoot, consumerFiles: '**' })
      .consumerFiles;

    expect(policy.globs).toEqual(['**']);
    expect(policy.matches('tools/seed.ts')).toBe(false);
    expect(policy.matches('main.ts')).toBe(false);
  });
});
