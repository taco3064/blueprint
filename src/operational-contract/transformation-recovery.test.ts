import { expect, it } from 'vitest';
import { renderTransformationRecoveryGuide } from './transformation-recovery';
import { renderTransformationRecoveryNote } from './transformation';

it('renders the retained origin and every source member as bounded recovery instructions', () => {
  const guide = renderTransformationRecoveryGuide({
    head: 'origin-id', applicationRoot: 'apps/web', sourceRoot: 'source',
    sources: [
      { unit: 'pages/Home', role: 'route-composition', members: ['source/pages/Home.ts'] },
      { unit: 'containers', role: 'container-seed',
        members: ['source/containers/Auth.ts', 'source/containers/Login.ts'] },
    ],
  });

  expect(guide).toContain('Origin HEAD: origin-id; application: apps/web.');
  expect(guide).toContain('Source root: source.');
  expect(guide).toContain('- pages/Home (route-composition): source/pages/Home.ts');

  expect(guide).toContain('- containers (container-seed): '
    + 'source/containers/Auth.ts, source/containers/Login.ts');

  expect(guide).toContain('members: [{ source, destination }]');
  expect(guide).toContain('Only successful verification retires the obligation.');
  expect(guide).toContain('Recovery never performs retirement.');
});

it.each([
  ['obligation', 'blueprint-transformation.json', 'review and record member decisions'],
  ['guide', 'blueprint-authoring.md', 'resume the recorded member mapping'],
  ['pending', 'transformation remains pending', 'blueprint init --topology module-first'],
] as const)('explains recovery action %s and its next step', (kind, subject, next) => {
  const note = renderTransformationRecoveryNote(kind);

  expect(note).toContain(subject);
  expect(note).toContain(next);
});
