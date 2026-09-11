export interface LintEntrypointAssessment {
  reachable: boolean;
  entrypoint: string | null;
  scriptPath: string[];
  reason: 'eslint-reachable' | 'missing-lint' | 'eslint-unreachable';
}

export function assessLintEntrypoint(
  pkg: { scripts: Record<string, string> },
): LintEntrypointAssessment {
  const entrypoint = pkg.scripts.lint ?? null;

  if (entrypoint === null) {
    return { reachable: false, entrypoint, scriptPath: [], reason: 'missing-lint' };
  }

  const result = pathToEslint(pkg.scripts);

  return {
    reachable: result !== null,
    entrypoint,
    scriptPath: result ?? ['lint'],
    reason: result === null ? 'eslint-unreachable' : 'eslint-reachable',
  };
}

function pathToEslint(scripts: Record<string, string>): string[] | null {
  const reached = new Map<string, string[]>([['lint', ['lint']]]);
  let found: string[] | null = null;

  Object.keys(scripts).forEach(() => {
    for (const [name, scriptPath] of reached) {
      const command = scripts[name];

      if (command && /(?:^|[\s;&|()])eslint(?:\s|$)/.test(command)) {
        found = scriptPath;

        break;
      }

      if (command) {
        for (const delegated of delegatedScripts(command)) {
          if (!reached.has(delegated)) {
            reached.set(delegated, [...scriptPath, delegated]);
          }
        }
      }
    }
  });

  return found;
}

function delegatedScripts(command: string): string[] {
  const names = new Set<string>();
  const pattern = /(?:^|[;&|()]|\s)(?:npm\s+run|pnpm(?:\s+run)?|yarn(?:\s+run)?)\s+([\w:.-]+)/g;

  for (const match of command.matchAll(pattern)) {
    names.add(match[1]);
  }

  return [...names];
}
