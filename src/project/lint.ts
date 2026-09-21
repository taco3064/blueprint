export interface EslintInvocation {
  command: string;
  args: string[] | null;
  unsafe?: string;
}

export interface LintEntrypointAssessment {
  reachable: boolean;
  entrypoint: string | null;
  scriptPath: string[];
  eslint: EslintInvocation | null;
  reason: 'eslint-reachable' | 'missing-lint' | 'eslint-unreachable' | 'eslint-opaque';
}

export function assessLintEntrypoint(
  pkg: { scripts: Record<string, string> },
): LintEntrypointAssessment {
  const name = pkg.scripts.lint === undefined ? 'eslint' : 'lint';
  const entrypoint = pkg.scripts[name] ?? null;

  if (entrypoint === null) {
    return {
      reachable: false,
      entrypoint,
      scriptPath: [],
      eslint: null,
      reason: 'missing-lint',
    };
  }

  const result = pathToEslint(pkg.scripts, name);

  return {
    reachable: result !== null,
    entrypoint,
    scriptPath: result?.path ?? [name],
    eslint: result?.eslint ?? null,
    reason: result === null
      ? opaqueLintPath(pkg.scripts, name) ? 'eslint-opaque' : 'eslint-unreachable'
      : 'eslint-reachable',
  };
}

function opaqueLintPath(scripts: Record<string, string>, name: string): boolean {
  const search = { scripts, queue: [name], visited: new Set([name]) };

  // Stryker disable next-line EqualityOperator: one extra cursor iteration immediately reaches
  // the undefined queue sentinel below and exits without observing or changing classification.
  for (let cursor = 0; cursor < Object.keys(scripts).length; cursor += 1) {
    const current = search.queue[cursor];

    if (current === undefined) {
      break;
    }

    const command = scripts[current]!;

    for (const part of shellCommands(command)) {
      const delegated = delegatedScript(part);

      if (delegated) {
        enqueueOpaqueDelegation(search, delegated.name);

        continue;
      }

      if (!provablyNonEslint(part)) {
        return true;
      }
    }
  }

  return false;
}

function enqueueOpaqueDelegation(
  search: {
    scripts: Record<string, string>;
    visited: Set<string>;
    queue: string[];
  },
  name: string,
): void {
  if (search.scripts[name] === undefined) {
    return;
  }

  if (search.visited.has(name)) {
    return;
  }

  search.visited.add(name);
  search.queue.push(name);
}

function provablyNonEslint(command: string): boolean {
  // Stryker disable next-line Regex: collapsing biome's internal whitespace still matches the
  // same command as bare `biome` followed by arguments, so classification is unchanged.
  return /^(?:npx\s+)?(?:oxlint|biome(?:\s+lint)?|stylelint|tsc|vue-tsc)(?:\s|$)/.test(command);
}

function pathToEslint(
  scripts: Record<string, string>,
  name: string,
): { path: string[]; eslint: EslintInvocation } | null {
  const queue: ScriptVisit[] = [{ name, path: [name], args: [], isolated: true }];
  const visited = new Set<string>([name]);
  const found: { path: string[]; eslint: EslintInvocation }[] = [];
  const search = { queue, visited, found };

  while (queue.length) {
    const visit = queue.shift() as ScriptVisit;

    inspectScript(scripts, visit, search);
  }

  if (found.length > 1) {
    found[0].eslint.args = null;
    found[0].eslint.unsafe = 'multiple reachable eslint legs cannot be replayed as one lint gate';
  }

  return found[0] ?? null;
}

interface ScriptVisit {
  name: string;
  path: string[];
  args: string[] | null;
  isolated: boolean;
}

function inspectScript(
  scripts: Record<string, string>,
  visit: ScriptVisit,
  search: {
    queue: ScriptVisit[];
    visited: Set<string>;
    found: { path: string[]; eslint: EslintInvocation }[];
  },
): void {
  const command = scripts[visit.name] ?? '';

  const parts = shellCommands(command);
  const isolated = visit.isolated && parts.length === 1;

  for (const part of parts) {
    const eslint = eslintInvocation(part, visit.args, isolated);

    if (eslint) {
      search.found.push({ path: visit.path, eslint });
    }

    const delegated = delegatedScript(part);

    if (delegated && !search.visited.has(delegated.name)) {
      search.visited.add(delegated.name);

      search.queue.push({
        name: delegated.name,
        path: [...visit.path, delegated.name],
        args: appendArgs(delegated.args, visit.args),
        isolated,
      });
    }
  }
}

function eslintInvocation(
  command: string,
  forwarded: string[] | null,
  isolated: boolean,
): EslintInvocation | null {
  if (!/^(?:npx\s+)?eslint(?:\s|$)/.test(command)) {
    return null;
  }

  const words = shellWords(command);
  const offset = words?.[0] === 'npx' ? 2 : 1;
  const parsed = words?.[offset - 1] === 'eslint' ? words.slice(offset) : null;
  const args = isolated ? appendArgs(parsed, forwarded) : null;

  return {
    command,
    args,
    ...(args === null
      ? { unsafe: isolated
          ? 'the eslint arguments could not be replayed without shell expansion'
          : 'other shell segments may change the eslint execution context' }
      : {}),
  };
}

function appendArgs(left: string[] | null, right: string[] | null): string[] | null {
  return left === null || right === null ? null : [...left, ...right];
}

function shellWords(command: string): string[] | null {
  if (/[`$<>'\\]/.test(command)) {
    return null;
  }

  // Stryker disable next-line Regex: single-character matches recombine to the same words.
  const matches = [...command.matchAll(/"[^"\\]*"|[^\s"\\]+/g)];
  const words: string[] = [];
  let cursor = 0;

  for (const match of matches) {
    const index = match.index as number;
    const gap = command.slice(cursor, index);

    if (gap.trim()) {
      return null;
    }

    if (!appendShellFragment(words, match[0], Boolean(gap))) {
      return null;
    }

    cursor = index + match[0].length;
  }

  return words;
}

function appendShellFragment(words: string[], fragment: string, separated: boolean): boolean {
  if (separated || !words.length) {
    words.push('');
  }

  if (requiresShellExpansion(fragment)) {
    return false;
  }

  words[words.length - 1] += shellFragment(fragment);

  return true;
}

function requiresShellExpansion(fragment: string): boolean {
  return /%/.test(fragment)
    || (fragment[0] !== '"'
      && (fragment[0] === '#' || fragment.includes('^') || /[()*?[\]{}~]/.test(fragment)));
}

function shellFragment(value: string): string {
  return value[0] === '"' ? value.slice(1, -1) : value;
}

function delegatedScript(command: string): { name: string; args: string[] | null } | null {
  const pattern = /^(npm\s+run|pnpm(?:\s+run)?|yarn(?:\s+run)?)\s+([\w:.-]+)(?:\s|$)/;
  const match = command.match(pattern);

  if (!match) {
    return null;
  }

  const words = shellWords(command);
  const managerWords = match[1].includes('run') ? 2 : 1;
  const rest = words?.slice(managerWords + 1) ?? null;
  const npm = match[1].startsWith('npm');

  return {
    name: match[2],
    args: rest?.[0] === '--' ? rest.slice(1) : npm && rest?.length ? null : rest,
  };
}

function shellCommands(command: string): string[] {
  const parts = `${command} `
    .match(/(?:\\.|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|[^;&|\n])+/g) as string[];

  return parts.map((part) => part.trim());
}
