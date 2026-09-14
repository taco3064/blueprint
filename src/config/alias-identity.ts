import path from 'node:path';

import type { ArchitectureDef } from './types';
import { configValidationError } from './validation';

export function validateAliasIdentity(architecture: ArchitectureDef): void {
  const duplicate = Object.entries(architecture.additionalAliases ?? {})
    .find(([alias]) => alias === architecture.alias);

  const canonical = architecture.sourceRoot ?? 'src';

  if (duplicate && normalizeTarget(duplicate[1]) !== normalizeTarget(canonical)) {
    throw configValidationError({
      kind: 'canonical-alias-collision',
      alias: architecture.alias,
      canonical,
      additional: duplicate[1],
    });
  }
}

function normalizeTarget(target: string): string {
  return path.posix.normalize(target.replace(/\\/g, '/')).replace(/\/$/, '') || '/';
}
