import type { Blueprint } from '../../config';

export interface CiOptions {
  /** Drives the install step. Defaults to npm. */
  packageManager?: 'npm' | 'pnpm' | 'yarn';
}

const INSTALL: Record<Required<CiOptions>['packageManager'], string> = {
  npm: 'npm install',
  pnpm: 'corepack enable && pnpm install',
  yarn: 'corepack enable && yarn install',
};

/**
 * Compile a Blueprint into a GitHub Actions workflow that gates
 * Architecture Success: lint (the emitted structural rules) plus
 * `blueprint inspect` (the closed-world / cycle checks lint cannot see).
 * Pure and deterministic, like every emitter.
 * @group Emitters
 * @example
 * writeFileSync('.github/workflows/blueprint-ci.yml', emitCi(blueprint));
 */
export function emitCi(blueprint: Blueprint, options: CiOptions = {}): string {
  const install = INSTALL[options.packageManager ?? 'npm'];
  const title = blueprint.name ? `${blueprint.name} · Blueprint CI` : 'Blueprint CI';
  const deadCode = blueprint.rules?.deadCode;
  const deadCodeTier = typeof deadCode === 'string' ? deadCode : deadCode?.tier;

  return [
    `name: ${title}`,
    '',
    'on:',
    '  push:',
    '    branches: [main]',
    '  pull_request:',
    '',
    'jobs:',
    '  architecture:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 22',
    `      - run: ${install}`,
    '      - run: npx eslint src',
    '      - run: npx blueprint inspect',
    ...(deadCodeTier === 'error'
      ? [
          '      # Dead-code gate (optional) — install knip and configure its',
          '      # entry points first (zero-config false-flags), then uncomment:',
          '      # - run: npx knip',
        ]
      : []),
    '',
  ].join('\n');
}
