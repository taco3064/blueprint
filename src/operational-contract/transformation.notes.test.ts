import { describe, expect, it } from 'vitest';
import {
  renderTransformationObligationError,
  renderTransformationObligationWriteNote,
  renderTransformationRetireNote,
} from './transformation';

describe('transformation evidence lifecycle notes', () => {
  it('names the durable evidence write and verified retirement', () => {
    expect(renderTransformationObligationWriteNote('blueprint-transformation.json'))
      .toBe('blueprint-transformation.json '
        + '(machine-verifiable layer-first → module-first obligation)');

    expect(renderTransformationRetireNote('blueprint-transformation.json'))
      .toBe('blueprint-transformation.json (verified transformation obligation retired)');
  });

  it.each([
    ['authority-unavailable', 'restore repository access'],
    ['authority-missing', 'blueprint init --recover-transformation'],
    ['authority-origin-changed', 'restore the recorded origin'],
    ['authority-write-failed', 'restore repository write access'],
    ['topology-request-conflict', 'before requesting another topology'],
  ])('explains recovery for %s', (code, instruction) => {
    expect(renderTransformationObligationError({ kind: 'incomplete', failures: [{ code }] }))
      .toContain(instruction);
  });

  it('does not prescribe deleting outstanding evidence', () => {
    const text = renderTransformationObligationError({
      kind: 'reauthoring', file: 'blueprint-transformation.json',
    });

    expect(text).toContain('Complete the recorded member transfers');
    expect(text).toContain('Deleting that file does not retire the Git authority');
    expect(text).not.toContain('intentionally remove');
  });
});
