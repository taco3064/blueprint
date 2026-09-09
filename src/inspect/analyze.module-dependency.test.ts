import { describe, expect, it } from 'vitest';

import { defineBlueprint } from '../config';
import { analyze } from './analyze';
import type { ImportRef, ScanResult, ScannedFile } from './types';

const blueprint = defineBlueprint({
  framework: 'react',
  architecture: {
    alias: '~app',
    modules: [
      { name: 'auth', does: 'authentication' },
      { name: 'checkout', does: 'checkout', dependsOn: ['auth'] },
      { name: 'history', does: 'history', dependsOn: ['checkout'] },
      { name: 'profile', does: 'profile' },
    ],
    layers: [
      { name: 'components', does: 'UI' },
      { name: 'hooks', does: 'state' },
      {
        name: 'services',
        does: 'I/O',
        layout: 'folder',
        entry: 'index',
        allowedImporters: [{ layer: 'hooks', selfOnly: true }],
      },
    ],
  },
});

function file(
  segments: string[],
  specifier: string,
  importShape: Partial<ImportRef> = {},
): ScannedFile {
  return {
    path: ['src', ...segments].join('/'),
    segments,
    imports: [{ specifier, names: [], isExport: false, ...importShape }],
  };
}

function findings(source: ScannedFile): ReturnType<typeof analyze> {
  const scan: ScanResult = {
    topDirs: ['auth', 'checkout', 'history', 'profile'],
    files: [source],
  };

  return analyze(scan, blueprint).filter((finding) => finding.rule !== 'missing-module');
}

describe('analyze · module dependency DAG', () => {
  it('allows transitive reachability with a legal inner flow', () => {
    expect(findings(file(
      ['history', 'hooks', 'useHistory.ts'],
      '~app/auth/services/api',
    )).filter((finding) => finding.rule === 'flow-violation')).toEqual([]);
  });

  it('identifies module-only, inner-only, and combined failures without duplicate findings', () => {
    const cases = [
      [
        file(['auth', 'hooks', 'useAuth.ts'], '~app/checkout/services/api'),
        'module reachability forbids "auth" → "checkout"',
      ],
      [
        file(['history', 'components', 'History.tsx'], '~app/auth/services/api'),
        'inner flow forbids "components" → "services"',
      ],
      [
        file(['auth', 'components', 'Login.tsx'], '~app/profile/services/api'),
        'module reachability forbids "auth" → "profile"',
      ],
    ] as const;

    for (const [source, expected] of cases) {
      const flow = findings(source).filter((finding) => finding.rule === 'flow-violation');

      expect(flow).toHaveLength(1);
      expect(flow[0].message).toContain(expected);
    }

    expect(findings(cases[2][0])[0].message).toContain(
      'inner flow forbids "components" → "services"',
    );
  });

  it('allows same-layer imports across reachable modules', () => {
    expect(findings(file(
      ['history', 'components', 'History.tsx'],
      '~app/auth/components/Login',
    )).filter((finding) => finding.rule === 'flow-violation')).toEqual([]);
  });

  it('preserves selfOnly across reachable modules', () => {
    const plain = findings(file(
      ['history', 'hooks', 'useHistory.ts'],
      '~app/auth/services/api',
    ));

    const reexport = findings(file(
      ['history', 'hooks', 'useHistory.ts'],
      '~app/auth/services/api',
      { isExport: true },
    ));

    expect(plain.some((finding) => finding.rule === 'selfonly-reexport')).toBe(false);
    expect(reexport.filter((finding) => finding.rule === 'selfonly-reexport')).toHaveLength(1);
  });

  it('treats module roots as containers and leaves source-root wiring outside the verdict', () => {
    const container = findings(file(['history', 'index.tsx'], '~app/auth'));
    const containerFile = findings(file(['history', 'index.tsx'], '~app/auth/index.tsx'));
    const layer = findings(file(['history', 'hooks', 'useHistory.ts'], '~app/auth'));
    const wiring = findings(file(['index.ts'], '~app/profile'));

    expect(container.filter((finding) => finding.rule === 'flow-violation')).toEqual([]);
    expect(containerFile.filter((finding) => finding.rule === 'flow-violation')).toEqual([]);

    expect(layer.find((finding) => finding.rule === 'flow-violation')?.message)
      .toContain('inner flow forbids "hooks" → "container"');

    expect(wiring.filter((finding) => finding.rule === 'flow-violation')).toEqual([]);
  });

  it('uses the canonical target topology for source-root folder entry depth', () => {
    const entry = findings(file(['index.ts'], '~app/auth/services/api'));
    const internal = findings(file(['index.ts'], '~app/auth/services/api/internal'));

    expect(entry.filter((finding) => finding.rule === 'deep-import')).toEqual([]);
    expect(internal.filter((finding) => finding.rule === 'deep-import')).toHaveLength(1);
  });
});
