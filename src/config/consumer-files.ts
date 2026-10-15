import type { ArchitectureDef } from './types';
import { globToRegExp } from './globs';
import { configValidationError } from './validation';

export interface ResolvedConsumerFiles {
  globs: string[];
  matches(file: string): boolean;
}

export function validateConsumerFiles(value: unknown): void {
  if (value === undefined) {
    return;
  }

  const entries = Array.isArray(value) ? value : [value];

  if (entries.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw configValidationError({ kind: 'consumer-files' });
  }
}

export function resolveConsumerFiles(
  value: ArchitectureDef['consumerFiles'],
  sourceRoot: string,
): ResolvedConsumerFiles {
  const globs = value === undefined ? [] : Array.isArray(value) ? [...value] : [value];
  const patterns = globs.map(globToRegExp);
  const root = segments(sourceRoot);

  return {
    globs,
    matches(file) {
      const parts = segments(file);

      return !root.every((part, index) => parts[index] === part)
        && patterns.some((pattern) => pattern.test(parts.join('/')));
    },
  };
}

function segments(value: string): string[] {
  return value.split(/[\\/]/).filter((part) => part !== '' && part !== '.');
}
