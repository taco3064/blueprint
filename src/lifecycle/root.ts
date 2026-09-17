import fs from 'node:fs';
import path from 'node:path';

import { CONFIG_FILE } from '../project';
import { ancestors } from './package';

export function lifecycleRootFor(cwd: string, repositoryRoot: string | undefined): string {
  if (repositoryRoot !== undefined) {
    return repositoryRoot;
  }

  return ancestors(cwd).find((directory) => fs.existsSync(path.join(directory, CONFIG_FILE)))
    ?? path.resolve(cwd);
}
