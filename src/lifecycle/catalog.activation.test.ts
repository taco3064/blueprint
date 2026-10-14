import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('./package');
  vi.resetModules();
});

it.each([
  [null, ['review-retired-module-private']],
  [{ version: '4.1.0' }, ['review-retired-module-private']],
  [{ version: '4.2.0' }, ['review-retired-module-private', 'review-module-root-unit']],
] as const)('selects the default catalog from running package %j', async (running, expected) => {
  vi.resetModules();
  vi.doMock('./package', () => ({ runningPackage: () => running }));
  const { UPGRADE_CATALOG } = await import('./catalog');

  expect(UPGRADE_CATALOG.operations.map((operation) => operation.id)).toEqual(expected);
});
