import { describe, expect, it } from 'vitest';

import type { ArchitectureDef, ModuleDef } from '../config';
import { folderFindings } from './folders';
import type { ScanResult } from './types';

function architecture(modules?: ModuleDef[]): ArchitectureDef {
  return {
    alias: '~app',
    ...(modules === undefined ? {} : { modules }),
    layers: [{ name: 'hooks', does: 'state', layout: 'file' }],
  };
}

const scan: ScanResult = {
  topDirs: ['checkout'],
  files: [
    { path: 'src/main.ts', segments: ['main.ts'], imports: [] },
    { path: 'src/checkout/hooks/cart.ts', segments: ['checkout', 'hooks', 'cart.ts'], imports: [] },
  ],
};

function undeclared(modules?: ModuleDef[]) {
  return folderFindings(scan, architecture(modules))
    .filter((finding) => finding.rule === 'undeclared-folder');
}

describe('folderFindings · undeclared top-level folders by topology', () => {
  it('keeps the layer-first owner handoff unchanged', () => {
    expect(undeclared().map((finding) => finding.message)).toEqual([
      '"checkout" is not a declared layer — move its code into an existing layer, or ask the owner '
      + 'to update the architecture contract.',
    ]);
  });

  it('never tells a runway to move code into a module that does not exist', () => {
    const [runway] = undeclared([]);
    const [appOnly] = undeclared([{ name: 'app', does: 'router composition' }]);

    for (const finding of [runway, appOnly]) {
      expect(finding.message).toContain('this module-first runway declares no domain module yet');
      expect(finding.message).toContain('module growth protocol in the handbook');
      expect(finding.message).toContain('never declare a module only to silence this finding');
      expect(finding.message).not.toContain('move its code into');
    }
  });

  it('offers the owning module before growth once domains exist', () => {
    const [declared] = undeclared([{ name: 'catalog', does: 'discovery' }]);

    expect(declared.message).toContain('move its code into the module that owns it, or when');
    expect(declared.message).not.toContain('declares no domain module yet');
  });

  it('reports no missing-module note for an empty runway', () => {
    const findings = folderFindings(scan, architecture([]));

    expect(findings.filter((finding) => finding.rule === 'missing-module')).toEqual([]);
  });
});
