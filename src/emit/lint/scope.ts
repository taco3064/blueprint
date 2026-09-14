import type { LintConfig } from './types';

export function scopeLintEntries(entries: LintConfig, basePath?: string): LintConfig {
  return basePath === undefined
    ? entries
    : entries.map((entry) => ({ ...entry, basePath }));
}

export function scopeLintOptions<T extends object>(options: T, basePath?: string): T {
  return basePath === undefined ? options : { ...options, basePath };
}
