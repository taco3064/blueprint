import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { LintEntrypointAssessment } from '../project';

export interface LiveLintEvidence {
  status: 'passed' | 'failed' | 'unverified';
  command: string | null;
  errors: number;
  warnings: number;
  reason?: string;
}

export function runLiveLint(
  root: string,
  dependencies: string[],
  assessment: LintEntrypointAssessment,
): LiveLintEvidence {
  const invocation = assessment.eslint;

  if (!assessment.reachable || invocation === null) {
    return unverified(null, 'the normal lint path has no reachable eslint leg');
  }

  if (invocation.args === null) {
    return unverified(
      invocation.command,
      invocation.unsafe ?? 'the eslint invocation could not be parsed safely',
    );
  }

  const prepared = safeArgs(invocation.args);

  if ('reason' in prepared) {
    return unverified(invocation.command, prepared.reason);
  }

  const executable = dependencies.includes('eslint') ? resolveLocalEslint(root) : null;

  return executable === null
    ? unverified(
        invocation.command,
        'the declared project-local eslint implementation could not be resolved',
      )
    : execute({ root, executable, command: invocation.command, args: prepared.args });
}

function execute(input: {
  root: string;
  executable: string;
  command: string;
  args: string[];
}): LiveLintEvidence {
  const { root, executable, command, args } = input;

  const result = spawnSync(process.execPath, [executable, ...jsonArgs(args)], {
    cwd: root,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    timeout: 120_000,
  });

  if (result.error || result.status === null) {
    return unverified(
      command,
      result.error?.message ?? 'eslint ended without a numeric exit status',
    );
  }

  if (result.status > 1) {
    const stderr = result.stderr?.trim().split('\n')[0];

    return {
      status: 'failed',
      command,
      errors: 0,
      warnings: 0,
      reason: stderr || `eslint exited ${result.status}`,
    };
  }

  const totals = lintTotals(result.stdout);

  if (totals === null) {
    return unverified(command, 'eslint did not return a trustworthy JSON lint report');
  }

  return {
    status: result.status === 0 ? 'passed' : 'failed',
    command,
    ...totals,
    ...(result.status === 1 ? { reason: 'the native ESLint gate failed' } : {}),
  };
}

function resolveLocalEslint(root: string): string | null {
  try {
    const require = createRequire(path.join(root, 'package.json'));
    const packageFile = require.resolve('eslint/package.json');
    const packageRoot = fs.realpathSync(path.dirname(packageFile));
    const declared = declaredEslintBin(packageFile);
    const candidate = path.resolve(packageRoot, declared);
    const executable = fs.realpathSync(candidate);

    return inside(packageRoot, executable) && fs.statSync(executable).isFile()
      ? executable
      : null;
  } catch {
    return null;
  }
}

function declaredEslintBin(packageFile: string): string {
  const manifest = JSON.parse(fs.readFileSync(packageFile, 'utf-8')) as {
    name?: unknown;
    bin?: unknown;
  };

  const bin = Object(manifest.bin) as Record<string, unknown>;
  const declared = bin.eslint;

  if (manifest.name !== 'eslint') {
    throw new Error('resolved package is not eslint');
  }

  // Invalid values fail identically in path.resolve or the directory check below.
  // Stryker disable next-line BlockStatement,ConditionalExpression,LogicalOperator
  if (typeof declared !== 'string' || !declared) {
    throw new Error('eslint package has no executable');
  }

  return declared;
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);

  // Cross-volume path.relative output can only be exercised on Windows, not POSIX.
  // Stryker disable next-line ConditionalExpression
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function safeArgs(args: string[]): { args: string[] } | { reason: string } {
  const sentinel = args.indexOf('--');
  const options = sentinel < 0 ? args : args.slice(0, sentinel);
  const unsafe = options.find(unsafeOption);

  return unsafe
    ? { reason: `unsafe or presentation-changing eslint option ${unsafe} cannot be executed by doctor` }
    : { args };
}

function unsafeOption(arg: string): boolean {
  const long = [
    '--cache', '--cache-file', '--cache-location', '--cache-strategy', '--env-info',
    '--fix', '--fix-dry-run', '--fix-type', '--format', '--help', '--init',
    '--inspect-config', '--mcp', '--output-file', '--print-config', '--prune-suppressions',
    '--quiet', '--stdin', '--stdin-filename', '--suppress-all', '--suppress-rule', '--version',
  ];

  return long.some((option) => arg === option || arg.startsWith(`${option}=`))
    || arg === '-h'
    || arg === '-v'
    || arg.startsWith('-f')
    || arg.startsWith('-o');
}

function jsonArgs(args: string[]): string[] {
  const sentinel = args.indexOf('--');

  return sentinel < 0
    ? [...args, '--format', 'json']
    : [...args.slice(0, sentinel), '--format', 'json', ...args.slice(sentinel)];
}

function lintTotals(output: string): { errors: number; warnings: number } | null {
  try {
    const results = JSON.parse(output) as unknown;

    // Stryker disable next-line BlockStatement,ConditionalExpression: .every throws to null too.
    if (!Array.isArray(results)) {
      return null;
    }

    if (!results.every(validResult)) {
      return null;
    }

    return results.reduce<{ errors: number; warnings: number }>((totals, result) => {
      return {
        errors: totals.errors + result.errorCount,
        warnings: totals.warnings + result.warningCount,
      };
    }, { errors: 0, warnings: 0 });
  } catch {
    return null;
  }
}

function validResult(value: unknown): value is { errorCount: number; warningCount: number } {
  const result = Object(value) as Record<string, unknown>;

  return validCount(result.errorCount) && validCount(result.warningCount);
}

function validCount(value: unknown): value is number {
  // Stryker disable next-line ConditionalExpression: Number.isFinite rejects non-numbers too.
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function unverified(command: string | null, reason: string): LiveLintEvidence {
  return { status: 'unverified', command, errors: 0, warnings: 0, reason };
}
