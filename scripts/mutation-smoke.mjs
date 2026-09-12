import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_MAX_CHANGED_LINES = 200;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const SOURCE_FILE = /^src\/.+\.(?:[cm]?ts|tsx)$/;
const TEST_FILE = /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.[^/]+$/;

export function parseArgs(argv) {
  const options = {
    base: process.env.MUTATION_BASE || '',
    maxChangedLines: Number(process.env.MUTATION_SMOKE_MAX_CHANGED_LINES)
      || DEFAULT_MAX_CHANGED_LINES,
    timeoutMs: Number(process.env.MUTATION_SMOKE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    reportDir: process.env.MUTATION_SMOKE_REPORT_DIR || 'reports/mutation-smoke',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === '--base' && value) {
      options.base = value;
      index += 1;
    } else if (argument === '--max-changed-lines' && value) {
      options.maxChangedLines = Number(value);
      index += 1;
    } else if (argument === '--timeout-ms' && value) {
      options.timeoutMs = Number(value);
      index += 1;
    } else if (argument === '--report-dir' && value) {
      options.reportDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!Number.isSafeInteger(options.maxChangedLines) || options.maxChangedLines < 1) {
    throw new Error('--max-changed-lines must be a positive integer.');
  }

  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new Error('--timeout-ms must be a positive integer.');
  }

  return options;
}

export function parseChangedRanges(diff) {
  const byFile = new Map();
  let file = null;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const candidate = line.slice(4);

      file = candidate === '/dev/null'
        ? null
        : candidate.replace(/^b\//, '');

      if (file && (!SOURCE_FILE.test(file) || TEST_FILE.test(file))) file = null;

      continue;
    }

    if (!file || !line.startsWith('@@ ')) continue;

    const match = /\+(\d+)(?:,(\d+))?/.exec(line);
    if (!match) continue;

    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);

    if (count === 0) continue;
    byFile.set(file, [...(byFile.get(file) ?? []), [start, start + count - 1]]);
  }

  return Object.fromEntries([...byFile]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([changedFile, ranges]) => [changedFile, mergeRanges(ranges)]));
}

export function mergeRanges(ranges) {
  const sorted = ranges
    .map(([start, end]) => [start, end])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  const merged = [];

  for (const range of sorted) {
    const previous = merged.at(-1);

    if (!previous || range[0] > previous[1] + 1) {
      merged.push(range);
    } else {
      previous[1] = Math.max(previous[1], range[1]);
    }
  }

  return merged;
}

export function mutationScopes(changedRanges) {
  return Object.entries(changedRanges).flatMap(([file, ranges]) =>
    ranges.map(([start, end]) => `${file}:${start}-${end}`));
}

export function changedLineCount(changedRanges) {
  return Object.values(changedRanges).reduce((total, ranges) =>
    total + ranges.reduce((fileTotal, [start, end]) => fileTotal + end - start + 1, 0), 0);
}

export function summarizeMutationReport(report) {
  const statuses = {};

  for (const file of Object.values(report.files ?? {})) {
    for (const mutant of file.mutants ?? []) {
      statuses[mutant.status] = (statuses[mutant.status] ?? 0) + 1;
    }
  }

  const unacceptable = Object.fromEntries(Object.entries(statuses)
    .filter(([status, count]) => count > 0 && !['Killed', 'Ignored'].includes(status)));

  const total = Object.values(statuses).reduce((sum, count) => sum + count, 0);

  return {
    total,
    statuses,
    passed: total > 0 && Object.keys(unacceptable).length === 0,
    unacceptable,
  };
}

export function unacceptableMutants(report) {
  return Object.entries(report.files ?? {}).flatMap(([file, entry]) =>
    (entry.mutants ?? [])
      .filter((mutant) => !['Killed', 'Ignored'].includes(mutant.status))
      .map((mutant) => ({
        file,
        line: mutant.location?.start?.line ?? null,
        column: mutant.location?.start?.column ?? null,
        mutator: mutant.mutatorName ?? 'unknown',
        status: mutant.status,
        original: sourceAt(entry.source ?? '', mutant.location),
        replacement: mutant.replacement ?? null,
        reason: mutant.statusReason ?? null,
      })));
}

export function sourceAt(source, location) {
  if (!location?.start || !location?.end) return null;

  const lines = source.split('\n');
  const startLine = location.start.line - 1;
  const endLine = location.end.line - 1;

  if (startLine < 0 || endLine >= lines.length) return null;

  if (startLine === endLine) {
    return lines[startLine].slice(location.start.column, location.end.column);
  }

  return [
    lines[startLine].slice(location.start.column),
    ...lines.slice(startLine + 1, endLine),
    lines[endLine].slice(0, location.end.column),
  ].join('\n');
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  }

  return result.stdout.trim();
}

function resolveBase(root, requested) {
  const candidates = [
    requested,
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : '',
    'origin/main',
    'main',
    'HEAD^',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const check = spawnSync('git', ['rev-parse', '--verify', `${candidate}^{commit}`], {
      cwd: root,
      encoding: 'utf8',
    });

    if (check.status === 0) return candidate;
  }

  throw new Error(`Could not resolve a mutation base from: ${candidates.join(', ')}`);
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function run(root, options) {
  const reportDir = path.resolve(root, options.reportDir);
  const reportFile = path.join(reportDir, 'mutation.json');
  const strykerReportFile = path.join(root, 'reports', 'mutation', 'mutation.json');
  const summaryFile = path.join(reportDir, 'summary.json');
  const scopeFile = path.join(reportDir, 'scope.json');
  const logFile = path.join(reportDir, 'run.log');

  fs.mkdirSync(reportDir, { recursive: true });
  const base = resolveBase(root, options.base);
  const mergeBase = git(root, ['merge-base', base, 'HEAD']);

  const diff = git(root, [
    'diff', '--unified=0', '--no-color', '--diff-filter=ACMR', mergeBase, '--', 'src',
  ]);

  const ranges = parseChangedRanges(diff);
  const scopes = mutationScopes(ranges);
  const lines = changedLineCount(ranges);

  writeJson(scopeFile, { base, mergeBase, changedLines: lines, ranges, scopes });

  if (scopes.length === 0) {
    const summary = { status: 'skipped', reason: 'no-changed-production-lines', changedLines: 0 };

    writeJson(summaryFile, summary);

    return { exitCode: 0, summary };
  }

  if (lines > options.maxChangedLines) {
    const summary = {
      status: 'refused',
      reason: 'changed-line-budget-exceeded',
      changedLines: lines,
      maxChangedLines: options.maxChangedLines,
    };

    writeJson(summaryFile, summary);

    return { exitCode: 2, summary };
  }

  const log = fs.openSync(logFile, 'w');
  const cli = path.join(root, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js');

  // Stryker 9 exposes reporters on the CLI but not the nested JSON filename.
  // Remove its configured target first so a failed run cannot reuse an old report,
  // then copy the completed report into this smoke's self-contained evidence dir.
  fs.rmSync(strykerReportFile, { force: true });

  const result = spawnSync(process.execPath, [
    cli,
    'run',
    '--mutate', `${scopes.join(',')},!src/**/*.test.ts`,
    '--reporters', 'json,clear-text',
  ], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', log, log],
    timeout: options.timeoutMs,
  });

  fs.closeSync(log);

  if (result.error || result.signal || result.status !== 0 || !fs.existsSync(strykerReportFile)) {
    const summary = {
      status: 'error',
      reason: result.error?.message || (result.signal ? `signal-${result.signal}` : `exit-${result.status}`),
      changedLines: lines,
    };

    writeJson(summaryFile, summary);

    return { exitCode: 2, summary };
  }

  fs.copyFileSync(strykerReportFile, reportFile);

  const mutation = summarizeMutationReport(JSON.parse(fs.readFileSync(reportFile, 'utf8')));

  const summary = {
    status: mutation.total === 0 ? 'skipped' : mutation.passed ? 'passed' : 'failed',
    ...(mutation.total === 0 ? { reason: 'no-mutants-generated' } : {}),
    changedLines: lines,
    ...mutation,
  };

  writeJson(summaryFile, summary);

  return { exitCode: mutation.total === 0 || mutation.passed ? 0 : 1, summary };
}

function main() {
  const root = process.cwd();
  const options = parseArgs(process.argv.slice(2));
  const result = run(root, options);

  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
