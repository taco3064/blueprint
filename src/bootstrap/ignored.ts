import fs from 'node:fs';
import path from 'node:path';

import { globToRegExp } from '../inspect';

interface IgnoreRule {
  negate: boolean;

  source: string;
  matches: (relPath: string) => boolean;
}

export interface HiddenArtifact {
  file: string;

  rule: string;
}

export function toRule(line: string): IgnoreRule | null {
  let pattern = line.trim();

  if (!pattern || pattern.startsWith('#')) {
    return null;
  }

  const negate = pattern.startsWith('!');

  if (negate) {
    pattern = pattern.slice(1);
  }

  const dirOnly = pattern.endsWith('/');

  if (dirOnly) {
    pattern = pattern.slice(0, -1);
  }

  const anchored = pattern.includes('/');
  const body = pattern.startsWith('/') ? pattern.slice(1) : pattern;
  const glob = anchored ? body : `**/${body}`;

  const self = globToRegExp(glob);
  const descendants = globToRegExp(`${glob}/**`);

  return {
    negate,
    source: line.trim(),
    matches: (relPath) => (!dirOnly && self.test(relPath)) || descendants.test(relPath),
  };
}

export function ignoredArtifacts(root: string, candidates: string[]): HiddenArtifact[] {
  let text: string;

  try {
    text = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
  } catch {
    return [];
  }

  const rules = text
    .split('\n')
    .map(toRule)
    .filter((rule): rule is IgnoreRule => rule !== null);

  const hidden: HiddenArtifact[] = [];

  for (const candidate of candidates) {
    const rel = candidate.split(path.sep).join('/');
    let hiding: string | null = null;

    for (const rule of rules) {
      if (rule.matches(rel)) {
        hiding = rule.negate ? null : rule.source;
      }
    }

    if (hiding !== null) {
      hidden.push({ file: candidate, rule: hiding });
    }
  }

  return hidden;
}
