import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { lifecycleRootFor } from './root';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bp-lifecycle-root-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('lifecycleRootFor', () => {
  it('uses the Git repository root when there is one', () => {
    expect(lifecycleRootFor(path.join(root, 'src'), '/repo')).toBe('/repo');
  });

  it('otherwise walks up to the nearest adopted application', () => {
    fs.mkdirSync(path.join(root, 'src/pages'), { recursive: true });
    fs.writeFileSync(path.join(root, 'blueprint.config.mjs'), 'export default {};\n');

    expect(lifecycleRootFor(path.join(root, 'src/pages'), undefined)).toBe(root);
  });

  it('falls back to the working directory when nothing is adopted above it', () => {
    expect(lifecycleRootFor(root, undefined)).toBe(root);
  });
});
