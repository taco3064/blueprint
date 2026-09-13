import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { publishOperational } from './operational-compose.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('operational artifact composition', () => {
  it('accepts byte-identical checked-in artifacts', () => {
    const root = fixture('agent-contract.md', 'expected\n');
    const files = new Map([['agent-contract.md', 'expected\n']]);

    expect(() => publishOperational('check', files, root)).not.toThrow();
  });

  it('rejects an artifact whose bytes drift from its authority', () => {
    const root = fixture('scripts/field-prompt.md', 'changed by hand\n');
    const files = new Map([['scripts/field-prompt.md', 'expected\n']]);

    expect(() => publishOperational('check', files, root)).toThrow(
      'Operational artifacts are stale:\nscripts/field-prompt.md',
    );
  });

  it('composes missing and stale artifacts back to exact bytes', () => {
    const root = fixture('agent-contract.md', 'old\n');

    const files = new Map([
      ['agent-contract.md', 'expected\n'],
      ['scripts/field-prompt.md', 'prompt\n'],
    ]);

    publishOperational('write', files, root);

    expect(fs.readFileSync(path.join(root, 'agent-contract.md'), 'utf8'))
      .toBe('expected\n');

    expect(fs.readFileSync(path.join(root, 'scripts/field-prompt.md'), 'utf8'))
      .toBe('prompt\n');
  });
});

function fixture(relative, content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-operational-'));
  const target = path.join(root, relative);

  roots.push(root);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);

  return root;
}
