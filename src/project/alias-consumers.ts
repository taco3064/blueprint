import fs from 'node:fs';
import path from 'node:path';

import { resolveArchitecture } from '../config';
import type { ArchitectureDef } from '../config';
import { parseJsonc } from './jsonc';
import { detectAliases } from './tsconfig';
import type { ProjectToolchain } from './scope';

export type AliasConsumer = 'typescript' | 'bundler-runtime' | 'package-subpath' | 'test-runner';
export type AliasConsumerStatus
  = 'verified' | 'missing' | 'absent' | 'not-applicable' | 'unverified';

export interface AliasConsumerEvidence {
  consumer: AliasConsumer;
  status: AliasConsumerStatus;
  aliases: string[];
  files: string[];
  unreadable?: string[];
}

const BUNDLER_FILES = ['webpack.config', 'vue.config', 'next.config', 'rsbuild.config']
  .flatMap((name) => ['js', 'cjs', 'mjs', 'ts'].map((ext) => `${name}.${ext}`));

const TEST_RUNNER_FILES = ['vitest.config', 'jest.config']
  .flatMap((name) => ['js', 'cjs', 'mjs', 'ts', 'mts', 'cts'].map((ext) => `${name}.${ext}`));

const BUNDLER_PACKAGES = ['vite', 'webpack', 'next', '@rsbuild/core', '@vue/cli-service'];
const TEST_RUNNER_PACKAGES = ['vitest', 'jest'];

export function aliasConsumerEvidence(
  root: string,
  architecture: ArchitectureDef,
  toolchain: ProjectToolchain,
): AliasConsumerEvidence[] {
  const aliases = resolveArchitecture(architecture).aliasMappings.map(([alias]) => alias);
  const targets = expectedTargets(architecture, toolchain.root);

  return [
    typescriptEvidence(aliases, targets, toolchain),
    textConfigEvidence({
      root, toolRoot: toolchain.root, aliases, targets, consumer: 'bundler-runtime',
      candidates: BUNDLER_FILES, packages: BUNDLER_PACKAGES, toolchain,
    }),
    packageSubpathEvidence({ root, toolRoot: toolchain.root, aliases, targets }),
    textConfigEvidence({
      root, toolRoot: toolchain.root, aliases, targets, consumer: 'test-runner',
      candidates: TEST_RUNNER_FILES, packages: TEST_RUNNER_PACKAGES,
    }),
  ];
}

function typescriptEvidence(
  aliases: string[],
  targets: Record<string, string>,
  toolchain: ProjectToolchain,
): AliasConsumerEvidence {
  const files = Object.entries(toolchain.tsconfigs)
    .filter(([, text]) => text !== null)
    .map(([file]) => file);

  const unreadable = Object.entries(toolchain.tsconfigs)
    .filter(([, text]) => text !== null && !parseJsonc(text).ok)
    .map(([file]) => file);

  if (!files.length) {
    return { consumer: 'typescript', status: 'absent', aliases, files: [] };
  }

  if (unreadable.length) {
    return { consumer: 'typescript', status: 'unverified', aliases, files, unreadable };
  }

  const declared = detectAliases(toolchain.tsconfigs);
  const missing = aliases.filter((alias) => declared[alias] !== targets[alias]);

  return {
    consumer: 'typescript',
    status: missing.length ? 'missing' : 'verified',
    aliases: missing.length ? missing : aliases,
    files,
  };
}

function textConfigEvidence(scope: {
  root: string;
  toolRoot: string;
  aliases: string[];
  targets: Record<string, string>;
  consumer: 'bundler-runtime' | 'test-runner';
  candidates: string[];
  packages: string[];
  toolchain?: ProjectToolchain;
}): AliasConsumerEvidence {
  const { aliases, targets, consumer } = scope;
  const { entries, packageFile, installed } = configRecognition(scope);

  if (!entries.length) {
    return {
      consumer,
      status: installed ? 'unverified' : 'absent',
      aliases,
      files: installed ? [packageFile] : [],
    };
  }

  const unreadable = entries.filter((entry) => entry.text === null).map((entry) => entry.file);

  if (unreadable.length) {
    return {
      consumer, status: 'unverified', aliases,
      files: entries.map((entry) => entry.file), unreadable,
    };
  }

  const typescriptAliases = detectAliases(scope.toolchain?.tsconfigs ?? {});

  const readings = entries.flatMap((entry) => aliases.map((alias) => {
    const reading = readStaticAlias(entry.text as string, alias, targets[alias]);

    // Stryker disable next-line ConditionalExpression: empty runner aliases reject bridges
    const bridged = consumer === 'bundler-runtime'
      && hasTsconfigPathsBridge(entry.text as string)
      && typescriptAliases[alias] === targets[alias];

    return bridged && reading === 'absent' ? 'verified' : reading;
  }));

  const unknown = readings.some((reading) => reading === 'unknown');

  const missing = aliases.filter((_, index) => entries.some((__, entryIndex) => {
    const reading = readings[entryIndex * aliases.length + index];

    return reading === 'absent' || reading === 'mismatch';
  }));

  return {
    consumer,
    status: missing.length ? 'missing' : unknown ? 'unverified' : 'verified',
    aliases: missing.length ? missing : aliases,
    files: entries.map((entry) => entry.file),
  };
}

function configRecognition(scope: {
  root: string;
  toolRoot: string;
  consumer: 'bundler-runtime' | 'test-runner';
  candidates: string[];
  packages: string[];
  toolchain?: ProjectToolchain;
}): {
  entries: { file: string; text: string | null }[];
  packageFile: string;
  installed: boolean;
} {
  const { root, toolRoot, consumer, candidates, packages, toolchain } = scope;
  const configured = candidates.map((file) => toolRoot ? `${toolRoot}/${file}` : file);
  const fromToolchain = toolchain?.viteConfig ? [toolchain.viteConfig] : [];

  const fromDisk = configured
    .filter((file) => fromToolchain.every((entry) => entry.file !== file))
    .filter((file) => fs.existsSync(path.join(root, file)))
    .map((file) => ({ file, text: read(path.join(root, file)) }));

  const packageFile = toolRoot ? `${toolRoot}/package.json` : 'package.json';
  const packageValue = packageRecord(read(path.join(root, packageFile)));

  const embeddedJest = consumer === 'test-runner' && isRecord(packageValue?.jest)
    ? [{ file: `${packageFile}#jest`, text: JSON.stringify(packageValue.jest) }]
    : [];

  const installed = packages.some((name) => packageDependencies(packageValue).has(name));

  return { entries: [...fromToolchain, ...fromDisk, ...embeddedJest], packageFile, installed };
}

function packageSubpathEvidence(scope: {
  root: string;
  toolRoot: string;
  aliases: string[];
  targets: Record<string, string>;
}): AliasConsumerEvidence {
  const { root, toolRoot, aliases, targets } = scope;
  const applicable = aliases.filter((alias) => alias.startsWith('#'));

  if (!applicable.length) {
    return { consumer: 'package-subpath', status: 'not-applicable', aliases: [], files: [] };
  }

  const file = toolRoot ? `${toolRoot}/package.json` : 'package.json';
  const text = read(path.join(root, file));
  const imports = packageImports(text);

  if (imports === null) {
    return {
      consumer: 'package-subpath',
      status: text === null ? 'absent' : 'unverified',
      aliases: applicable,
      files: text === null ? [] : [file],
      ...(text !== null ? { unreadable: [file] } : {}),
    };
  }

  const missing = applicable.filter((alias) => {
    const value = imports[`${alias}/*`] ?? imports[alias];

    return typeof value === 'string' && normalizeTarget(value) === targets[alias]
      ? false
      : value === undefined || typeof value === 'string';
  });

  const unknown = applicable.some((alias) => {
    const value = imports[`${alias}/*`] ?? imports[alias];

    // Stryker disable next-line ConditionalExpression: missing already outranks unknown
    return value !== undefined
      && typeof value !== 'string';
  });

  return {
    consumer: 'package-subpath',
    status: missing.length ? 'missing' : unknown ? 'unverified' : 'verified',
    aliases: missing.length ? missing : applicable,
    files: [file],
  };
}

function packageImports(text: string | null): Record<string, unknown> | null {
  if (text === null) {
    return null;
  }

  const parsed = parseJsonc(text);

  return parsed.ok && isRecord(parsed.value) && isRecord(parsed.value.imports)
    ? parsed.value.imports
    : null;
}

function packageRecord(text: string | null): Record<string, unknown> | null {
  if (text === null) {
    return null;
  }

  const parsed = parseJsonc(text);

  // Stryker disable next-line ConditionalExpression, LogicalOperator: nonrecords expose no fields
  return parsed.ok && isRecord(parsed.value) ? parsed.value : null;
}

function packageDependencies(pkg: Record<string, unknown> | null): Set<string> {
  const keys = ['dependencies', 'devDependencies'].flatMap((field) =>
    isRecord(pkg?.[field])
      ? Object.keys(pkg[field])
      // Stryker disable next-line ArrayDeclaration: the sentinel is not a recognized package
      : []);

  return new Set(keys);
}

function readStaticAlias(
  text: string,
  alias: string,
  expected: string,
): 'verified' | 'mismatch' | 'unknown' | 'absent' {
  const source = withoutComments(text);
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = new RegExp(`(['"\`])${escaped}\\1\\s*:\\s*(['"\`])([^'"\`]*)\\2`);

  const chained = new RegExp(
    `\\.set\\(\\s*(['"\`])${escaped}\\1\\s*,\\s*(['"\`])([^'"\`]*)\\2`,
  );

  const found = direct.exec(source) ?? chained.exec(source);

  if (found) {
    return normalizeTarget(found[3]) === expected ? 'verified' : 'mismatch';
  }

  const json = packageRecord(source);
  const mapper = isRecord(json?.moduleNameMapper) ? json.moduleNameMapper : null;

  const mapped = mapper === null
    ? undefined
    : Object.entries(mapper)
      .find(([pattern]) => pattern.includes(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))?.[1];

  if (typeof mapped === 'string') {
    const target = mapped.replace(/^<rootDir>\//, '').replace(/\/\$1$/, '');

    return normalizeTarget(target) === expected ? 'verified' : 'mismatch';
  }

  return new RegExp(`(['"\`])${escaped}\\1`).test(source) ? 'unknown' : 'absent';
}

function hasTsconfigPathsBridge(text: string): boolean {
  const source = withoutComments(text);

  const imported = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]vite-tsconfig-paths['"]/
    .exec(source);

  if (!imported) {
    return false;
  }

  const body = source.slice(imported.index + imported[0].length);

  return new RegExp(`\\b${imported[1]}\\s*\\(`).test(body);
}

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

function expectedTargets(
  architecture: ArchitectureDef,
  toolRoot: string,
): Record<string, string> {
  const mappings = resolveArchitecture(architecture).aliasMappings;

  return Object.fromEntries(mappings.map(([alias, target]) => {
    const relative = toolRoot && !path.posix.isAbsolute(target)
      ? path.posix.relative(toolRoot, target)
      : target;

    return [alias, normalizeTarget(relative)];
  }));
}

function normalizeTarget(target: string): string {
  const normalized = path.posix.normalize(target.replace(/\\/g, '/').replace(/^\//, ''));

  return normalized.replace(/^\.\//, '').replace(/\/\*$/, '');
}

function read(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
