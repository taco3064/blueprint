import fs from 'node:fs';
import path from 'node:path';

export interface DelegateResolution {
  alias: string;
  root: string;
}

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs'];

export function resolveDelegate(
  importer: string,
  specifier: string,
  resolution?: DelegateResolution,
): string | null {
  const target = importTarget(importer, specifier, resolution);

  if (target === null || (resolution && !fs.existsSync(resolution.root))) {
    return null;
  }

  for (const base of [target, path.join(target, 'index')]) {
    for (const extension of EXTENSIONS) {
      const candidate = `${base}${extension}`;

      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
        continue;
      }

      if (!resolution) {
        return candidate;
      }

      const realCandidate = fs.realpathSync(candidate);

      if (contained(fs.realpathSync(resolution.root), realCandidate)) {
        return realCandidate;
      }
    }
  }

  return null;
}

function importTarget(
  importer: string,
  specifier: string,
  resolution: DelegateResolution | undefined,
): string | null {
  let target: string;

  if (specifier.startsWith('.')) {
    target = path.resolve(path.dirname(importer), specifier);
  } else if (resolution && (specifier === resolution.alias
    || specifier.startsWith(`${resolution.alias}/`))) {
    target = path.resolve(resolution.root, `.${specifier.slice(resolution.alias.length)}`);
  } else {
    return null;
  }

  return target;
}

function contained(root: string, target: string): boolean {
  const relative = path.relative(root, target);

  return relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative);
}
