import fs from 'node:fs';
import path from 'node:path';

import { CONFIG_FILE } from '../project';

export function lifecycleRootFor(cwd: string, repositoryRoot: string | undefined): string {
  if (repositoryRoot !== undefined) {
    return repositoryRoot;
  }

  const start = path.resolve(cwd);

  for (let directory = start; ; directory = path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, CONFIG_FILE))) {
      return directory;
    }

    if (path.dirname(directory) === directory) {
      return start;
    }
  }
}
