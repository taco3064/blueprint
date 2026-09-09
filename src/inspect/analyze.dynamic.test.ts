import { describe, expect, it } from 'vitest';

import type { Blueprint } from '../config';
import { analyze } from './analyze';
import { buildUnitGraph } from './resolve';
import { extractImportAnalysis } from './scan';
import type { ScanResult, ScannedFile } from './types';

function blueprint(): Blueprint {
  return {
    framework: 'react',
    architecture: {
      alias: '~app',
      sourceRoot: 'src',
      additionalAliases: {
        '~root': '.',
        '~source': 'src',
        '~b': 'src/b_module',
        '~bComponents': 'src/b_module/components',
        '~card': 'src/b_module/components/Card',
      },
      modules: [
        { name: 'a_module', does: 'A', dependsOn: ['b_module'] },
        { name: 'b_module', does: 'B' },
      ],
      layers: [
        { name: 'components', does: 'UI', layout: 'folder' },
        { name: 'hooks', does: 'state', layout: 'folder' },
        { name: 'services', does: 'I/O' },
      ],
    },
  };
}

function file(path: string, source: string): ScannedFile {
  const relative = path.replace(/^src\//, '');
  const extracted = extractImportAnalysis(source, path);

  return {
    path,
    segments: relative.split('/'),
    imports: extracted.imports,
    importAnalysis: extracted.analysis,
  };
}

function scan(...files: ScannedFile[]): ScanResult {
  return { topDirs: ['a_module', 'b_module'], files };
}

describe('inspect · canonical aliases and dynamic imports', () => {
  it.each([
    '~root/src/b_module/components/Card',
    '~source/b_module/components/Card',
    '~b/components/Card',
    '~bComponents/Card',
    '~card',
  ])('resolves but rejects the secondary spelling %s', (specifier) => {
    const result = analyze(scan(file(
      'src/a_module/components/Profile/index.tsx',
      `import Card from "${specifier}";`,
    )), blueprint());

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'canonical-alias',
        subject: specifier,
        message: expect.stringContaining('~app/b_module/components/Card'),
      }),
    ]));
  });

  it('keeps canonical reachable same-layer imports and unit entries legal', () => {
    expect(analyze(scan(file(
      'src/a_module/components/Profile/index.tsx',
      'import Card from "~app/b_module/components/Card";',
    )), blueprint())).toEqual([]);
  });

  it('applies module, inner-flow, and deep-entry verdicts to dynamic targets', () => {
    const result = analyze(scan(
      file(
        'src/a_module/hooks/useA.ts',
        'import("~app/b_module/components/Card"); '
        + 'import("~app/b_module/hooks/useB/internal");',
      ),
      file(
        'src/b_module/hooks/useB.ts',
        'const root = "~app/a_module"; import(`${root}/hooks/useA`);',
      ),
    ), blueprint());

    expect(result.filter((finding) => finding.rule === 'flow-violation')).toHaveLength(2);

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'deep-import',
        subject: '~app/b_module/hooks/useB/internal',
      }),
    ]));
  });

  it('adds known dynamic edges, including violations, and omits unknown expressions', () => {
    const architecture = blueprint().architecture;

    const graph = buildUnitGraph(scan(
      file(
        'src/a_module/hooks/useA.ts',
        'const target = "~app/b_module/components/Card"; import(target); import(window.route);',
      ),
      file('src/b_module/components/Card/index.tsx', 'export const Card = 1;'),
    ), architecture);

    expect([...graph.edges.get('a_module/hooks/useA') ?? []])
      .toEqual(['b_module/components/Card']);
  });

  it('does not fabricate a finding for runtime-dependent targets', () => {
    const source = 'let target = "~b/components/Card"; target = runtime; import(target);';

    expect(analyze(scan(file('src/a_module/components/Profile/index.tsx', source)), blueprint()))
      .toEqual([]);
  });
});
