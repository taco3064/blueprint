import { afterEach, describe, expect, it } from 'vitest';

import { cli, configSource, makeRepo, reactBlueprint, rm, write } from './conformance';

const dirs: string[] = [];

function fixture(typescript: boolean): string {
  const dir = makeRepo({
    packageJson: {
      name: 'vue-impact',
      dependencies: { vue: '^3', ...(typescript ? { typescript: '^5' } : {}) },
    },
    files: {
      'blueprint.config.mjs': configSource({ ...reactBlueprint, framework: 'vue', rules: {} }),
      'src/components/Target.vue': '<template><div /></template>',
    },
  });

  dirs.push(dir);

  return dir;
}

afterEach(() => {
  dirs.splice(0).forEach(rm);
});

describe('Impact Vue JSX/TSX field regression', () => {
  it.each(['jsx', 'tsx'])('counts forbidden imports in valid %s SFCs', async (lang) => {
    const dir = fixture(lang === 'tsx');
    const file = 'src/services/Probe.vue';

    const sfc = (statement: string) => `<script setup lang="${lang}">\n${statement}\n`
      + 'const node = <div />;\n</script>\n<template><component :is="node" /></template>\n';

    write(dir, file, sfc(''));

    const clean = await cli(dir, ['impact', '--json']);

    expect(clean.code, clean.output).toBe(0);
    expect(JSON.parse(clean.output)).toMatchObject({ status: 'available', total: 0, impacts: [] });

    write(dir, file, sfc('import "~app/components/Target.vue";'));

    const illegal = await cli(dir, ['impact', '--json']);
    const report = JSON.parse(illegal.output);

    expect(illegal.code, illegal.output).toBe(0);
    expect(report.status).toBe('available');
    expect(report.total).toBeGreaterThan(0);

    expect(report.impacts).toContainEqual(expect.objectContaining({
      rule: 'no-restricted-imports', count: 1,
      top: [{ path: file, count: 1 }],
    }));

    expect(report.impacts.some((row: { rule: string }) => row.rule === 'parse-error')).toBe(false);
  });

  it.each([false, true])('reports partial with known violations: %s', async (withHit) => {
    const dir = fixture(true);

    write(dir, 'src/services/Broken.vue', '<script setup lang="tsx">const = ;</script>');

    if (withHit) {
      write(dir, 'src/services/Illegal.ts', 'import "~app/components/Target.vue";');
    }

    const json = await cli(dir, ['impact', '--json']);
    const report = JSON.parse(json.output);

    expect(json.code).toBe(0);
    expect(report.status).toBe('partial');
    expect(report.total).toBe(withHit ? 1 : 0);

    expect(report.impacts).toContainEqual(
      expect.objectContaining({ rule: 'parse-error', files: 1 }),
    );

    const text = await cli(dir, ['impact']);

    expect(text.output).toContain('⊘ Rule impact partial');
    expect(text.output).toContain('lower bound, not a complete total');
    expect(text.output).toContain('src/services/Broken.vue');
    expect(text.output).not.toContain('introduces no red');
  });
});
