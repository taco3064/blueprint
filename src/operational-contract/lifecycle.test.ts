import { describe, expect, it } from 'vitest';

import { renderLifecycle } from './agent';
import {
  renderLifecycleRecordNote,
  renderLifecycleRecordSkipped,
  renderLifecycleStateInvalid,
} from './lifecycle';

describe('agent lifecycle guidance', () => {
  it.each(['##', '###'] as const)('maps both golden prompts to commands under %s', (heading) => {
    const lines = renderLifecycle(heading).split('\n');

    expect(lines[0]).toBe(`${heading} Upgrading or removing Blueprint`);

    expect(lines[2]).toContain(
      '- **"Upgrade Blueprint to the latest version"** — run `npx @kekkai/blueprint@latest',
    );

    expect(lines[3]).toContain(
      '- **"Remove Blueprint from this project"** — run `npx blueprint remove --dry-run`',
    );
  });
});

describe('lifecycle state messages', () => {
  it('names why the lifecycle file was written for each establishment', () => {
    expect(renderLifecycleRecordNote('.blueprint-lifecycle.json', 'first'))
      .toContain('commit it; `blueprint upgrade` and `blueprint remove` read it');

    expect(renderLifecycleRecordNote('.blueprint-lifecycle.json', 'bootstrap')).toContain(
      'established from the installed package; edits made before this run were not recorded',
    );

    expect(renderLifecycleRecordNote('.blueprint-lifecycle.json', null)).toBe(
      '.blueprint-lifecycle.json (Blueprint ownership records — upgrade and remove reverse '
      + 'only what these records prove)',
    );
  });

  it('gives the recovery step for each skipped recording', () => {
    expect(renderLifecycleRecordSkipped('pending-upgrade'))
      .toContain('Restore .blueprint-lifecycle.json from version control, then re-run');

    expect(renderLifecycleRecordSkipped('unproven-checkpoint'))
      .toContain('Install dependencies and re-run init');
  });

  it.each([
    ['json', 'it is not valid JSON'],
    ['schema', 'its schema is not one this Blueprint reads'],
    ['pending', 'its `pending` field is invalid'],
  ])('explains an unreadable state caused by %s', (reason, cause) => {
    expect(renderLifecycleStateInvalid('.blueprint-lifecycle.json', reason)).toBe(
      `.blueprint-lifecycle.json is unreadable: ${cause}. Blueprint stops instead of guessing `
      + 'lifecycle history or file ownership. Restore it from version control (for example '
      + '`git checkout -- .blueprint-lifecycle.json`), then re-run this command.',
    );
  });
});
