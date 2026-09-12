import type { ArchitectureDef } from './types';

const DEFAULT_TEST_FILES = [
  '**/*.test.{js,jsx,ts,tsx,vue}',
  '**/*.spec.{js,jsx,ts,tsx,vue}',
];

export interface ResolvedTestFiles {
  architectureExemptions: string[];
  testRuleFiles: string[];
}

export function resolveTestFiles(
  testFiles: ArchitectureDef['testFiles'],
): ResolvedTestFiles {
  const globs = testFiles === undefined
    ? DEFAULT_TEST_FILES
    : Array.isArray(testFiles) ? testFiles : [testFiles];

  return {
    architectureExemptions: [...globs],
    testRuleFiles: [...globs],
  };
}
