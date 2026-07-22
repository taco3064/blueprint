import fs from 'node:fs';
import path from 'node:path';

/**
 * `blueprint retire` — the footprint sweep for a tool being retired. Field
 * batch 12 consolidated structure-lint into blueprint and then discovered
 * the hard way that deleting the config file is never the whole retirement:
 * docs, READMEs, code comments, and agent skills all kept pointing at the
 * dead tool, and finding them was manual grep work. This runtime walks the
 * repo (skipping dependencies, build output, and lockfiles), reports every
 * line that still references the name, and exits 0 only when the sweep is
 * clean — so it drops into an agent's fix-and-re-run loop.
 */

export interface RetireOptions {
  /** Emit machine-readable JSON instead of the text report. */
  json?: boolean;
  /** Output sink (default `console.log`). */
  log?: (message: string) => void;
}

/** One file still referencing the retired name. */
export interface RetireHit {
  file: string;
  lines: { line: number; text: string }[];
}

/**
 * Directories that never hold a reference worth reporting: dependencies,
 * VCS internals, and build output. Deliberately retire's own list — scan's
 * NON_SOURCE_DIRS answers "never layer source", this answers "never a
 * pointer a human maintains".
 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'dist',
  'build',
  'out',
  'coverage',
]);

/** Generated lockfiles reference packages by construction — never actionable. */
const SKIP_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']);

const MAX_LINE = 120;
const MAX_BYTES = 1024 * 1024;

/**
 * A file's text, or null when it cannot hold a hand-maintained pointer:
 * oversized, or carrying NUL bytes (binaries sniff themselves out). No
 * extension whitelist — stale pointers live in `.husky/pre-commit`,
 * `.gitignore`, Makefiles, and other extensionless homes too.
 */
function readText(full: string): string | null {
  if (fs.statSync(full).size > MAX_BYTES) return null;

  const buffer = fs.readFileSync(full);

  return buffer.includes(0) ? null : buffer.toString('utf-8');
}

function walk(dir: string, base: string, hits: RetireHit[], token: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;

      walk(full, base, hits, token);
    } else if (entry.isFile() && !SKIP_FILES.has(entry.name)) {
      const content = readText(full);

      if (content === null) continue;

      const lines = content
        .split('\n')
        .map((text, index) => ({ line: index + 1, text: text.trim() }))
        .filter(({ text }) => text.includes(token))
        .map(({ line, text }) => ({
          line,
          text: text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}…` : text,
        }));

      if (lines.length) {
        hits.push({ file: path.relative(base, full).split(path.sep).join('/'), lines });
      }
    }
  }
}

/**
 * Run `blueprint retire` in `root`. Read-only and config-free — it serves
 * the moment a tool leaves, which needs no blueprint to exist. Returns
 * every hand-maintained file still referencing `token`; `ok` is true only
 * when the footprint is fully swept.
 * @group Runtimes
 * @example
 * const { ok, hits } = runRetire(process.cwd(), 'structure-lint');
 *
 * process.exitCode = ok ? 0 : 1; // re-run until clean
 */
export function runRetire(
  root: string,
  token: string,
  options: RetireOptions = {},
): { ok: boolean; hits: RetireHit[] } {
  if (!token.trim()) {
    throw new Error(
      'retire needs the name to sweep for — e.g. `blueprint retire structure-lint`.',
    );
  }

  const log = options.log ?? ((message: string) => console.log(message));
  const hits: RetireHit[] = [];

  walk(root, root, hits, token);
  // Plain code-unit order — localeCompare varies by environment, and a
  // deterministic report is what makes re-runs diffable.
  hits.sort((a, b) => Number(a.file > b.file) - Number(a.file < b.file));

  log(
    options.json
      ? JSON.stringify({ ok: hits.length === 0, token, hits }, null, 2)
      : renderRetire(token, hits),
  );

  return { ok: hits.length === 0, hits };
}

/** The human-readable sweep report. */
export function renderRetire(token: string, hits: RetireHit[]): string {
  if (!hits.length) {
    return `✓ No references to "${token}" — the footprint is swept.`;
  }

  const total = hits.reduce((sum, hit) => sum + hit.lines.length, 0);

  return [
    `blueprint retire — references to "${token}"`,
    '',
    ...hits.flatMap((hit) => [
      // A dependency entry is not a text edit — hand-deleting it leaves the
      // lockfile pointing at a package the manifest no longer names.
      hit.file.endsWith('package.json')
        ? `  ${hit.file} (a dependency entry here leaves via npm uninstall, not a text edit)`
        : `  ${hit.file}`,
      ...hit.lines.map(({ line, text }) => `    ${line}: ${text}`),
    ]),
    '',
    `${total} reference(s) in ${hits.length} file(s) — update or remove them, then re-run until clean.`,
  ].join('\n');
}
