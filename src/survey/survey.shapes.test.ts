import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runSurvey } from './survey';

let root: string;

const silent = () => {};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-survey-shapes-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string): void {
  const full = path.join(root, rel);

  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, '');
}

function writeModuleShapeFixture(): void {
  for (const file of [
    'src/auth/components/Button.tsx',
    'src/auth/hooks/useAuth.ts',
    'src/auth/services/session.ts',
    'src/auth/private/audit.ts',
    'src/checkout/components/Cart.tsx',
    'src/checkout/hooks/useCart.ts',
    'src/profile/components/Avatar.tsx',
    'src/profile/hooks/useProfile.ts',
    'src/profile/services/account.ts',
  ]) {
    write(file);
  }
}

describe('runSurvey · repeated sibling-folder evidence', () => {
  it('reports irregular repeated children directly below the source root in JSON and text', () => {
    write('package.json');
    writeModuleShapeFixture();

    const messages: string[] = [];
    const result = runSurvey(root, { log: (message) => messages.push(message) });

    expect(result.repeatedFolderShapes).toEqual([
      {
        parent: 'src',
        instances: ['auth', 'checkout', 'profile'],
        repeatedChildren: [
          { folder: 'components', presentIn: 3, instanceCount: 3 },
          { folder: 'hooks', presentIn: 3, instanceCount: 3 },
          { folder: 'services', presentIn: 2, instanceCount: 3 },
        ],
      },
    ]);

    expect(messages[0]).toContain('measured repetition only');
    expect(messages[0]).toContain('src — sibling instances: auth, checkout, profile');
    expect(messages[0]).toContain('services — 2/3 instances');
    expect(messages[0]).not.toContain('private —');

    const json: string[] = [];

    runSurvey(root, { json: true, log: (message) => json.push(message) });
    expect(JSON.parse(json[0]).repeatedFolderShapes).toEqual(result.repeatedFolderShapes);
  });

  it('finds generic repeated names below an ordinary container and separates groups', () => {
    for (const file of [
      'src/product-areas/alpha/red/item.ts',
      'src/product-areas/alpha/blue/item.ts',
      'src/product-areas/beta/red/item.ts',
      'src/product-areas/beta/blue/item.ts',
      'src/product-areas/gamma/red/item.ts',
      'src/product-areas/delta/green/item.ts',
      'src/product-areas/epsilon/green/item.ts',
    ]) {
      write(file);
    }

    expect(runSurvey(root, { log: silent }).repeatedFolderShapes).toEqual([
      {
        parent: 'src/product-areas',
        instances: ['alpha', 'beta', 'gamma'],
        repeatedChildren: [
          { folder: 'red', presentIn: 3, instanceCount: 3 },
          { folder: 'blue', presentIn: 2, instanceCount: 3 },
        ],
      },
      {
        parent: 'src/product-areas',
        instances: ['delta', 'epsilon'],
        repeatedChildren: [{ folder: 'green', presentIn: 2, instanceCount: 2 }],
      },
    ]);
  });

  it('does not claim repetition for empty, horizontal, or unrelated nested trees', () => {
    write('package.json');

    expect(runSurvey(root, { log: silent }).repeatedFolderShapes).toEqual([]);

    for (const file of [
      'src/components/Button.tsx',
      'src/hooks/useButton.ts',
      'src/one/red/item.ts',
      'src/two/blue/item.ts',
    ]) {
      write(file);
    }

    expect(runSurvey(root, { log: silent }).repeatedFolderShapes).toEqual([]);
  });

  it('renders a root-layout parent without a leading slash', () => {
    write('one/shared/a.ts');
    write('two/shared/b.ts');
    write('product/three/red/a.ts');
    write('product/four/red/b.ts');

    expect(runSurvey(root, { sourceRoot: '.', log: silent }).repeatedFolderShapes).toEqual([
      {
        parent: '.',
        instances: ['one', 'two'],
        repeatedChildren: [{ folder: 'shared', presentIn: 2, instanceCount: 2 }],
      },
      {
        parent: 'product',
        instances: ['four', 'three'],
        repeatedChildren: [{ folder: 'red', presentIn: 2, instanceCount: 2 }],
      },
    ]);
  });
});
