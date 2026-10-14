import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { minimatch } from 'minimatch';
import { prohibitionGateEvidence, resolveArchitecture } from '../config';
import type { Blueprint, Framework } from '../config';
import { plugin } from '../plugin';
import { unwrapModule } from '../project';
import { renderProhibitionDoctorMessage } from '../operational-contract';
import { measureProhibitions } from './prohibitions';
import type { ProhibitionFact } from './prohibitions';
import type { DoctorCheck, ScanResult } from './types';
import { syntheticCandidates } from './wiring';
import type { ProhibitionLintFinding } from './lint-runtime';
import { prohibitionParserCapabilities } from './prohibition-parser';
import type { ProhibitionLanguageOptions } from './prohibition-parser';

export interface ProhibitionEvidence extends ProhibitionFact {
  gate: 'passed' | 'failed' | 'unverified';
  affectsExit: boolean;
  reason?: string;
  probeFile?: string;
  prohibitionFindings?: ProhibitionLintFinding[];
}

interface EffectiveConfig {
  rules?: Record<string, unknown>;
  plugins?: Record<string, { rules?: Record<string, unknown> }>;
  languageOptions?: ProhibitionLanguageOptions;
}

interface EslintApi {
  ESLint: new (options: object) => {
    calculateConfigForFile(file: string): Promise<EffectiveConfig | undefined>;
  };
}

export async function verifyProhibitions(input: {
  root: string;
  lintRoot?: string;
  blueprint: Blueprint;
  scanResult: ScanResult;
  wired: boolean;
  detectedFramework?: Framework | null;
  load: (name: string, root: string) => Promise<unknown>;
}): Promise<ProhibitionEvidence[]> {
  const blueprint = input.blueprint.framework === 'auto' && input.detectedFramework
    ? { ...input.blueprint, framework: input.detectedFramework }
    : input.blueprint;

  const facts = measureProhibitions(input.blueprint, input.scanResult, input.detectedFramework)
    .filter((fact) => fact.mode === 'executable');

  if (!facts.length) {
    return [];
  }

  if (!input.wired) {
    return facts.map((fact) => evidence(fact, 'failed', 'Required lint carrier is not wired.'));
  }

  let eslint: InstanceType<EslintApi['ESLint']>;

  try {
    const { ESLint } = unwrapModule<EslintApi>(await input.load('eslint', input.root));

    eslint = new ESLint({ cwd: input.lintRoot ?? input.root });
  } catch (error) {
    return facts.map((fact) => evidence(fact, 'unverified', String(error)));
  }

  const results = await Promise.all(facts.map((fact) => probeFact(fact, {
    root: input.root, lintRoot: input.lintRoot ?? input.root, blueprint, eslint,
  })));

  return results.flat();
}

async function probeFact(fact: ProhibitionFact, context: {
  root: string;
  lintRoot: string;
  blueprint: Blueprint;
  eslint: InstanceType<EslintApi['ESLint']>;
}): Promise<ProhibitionEvidence[]> {
  const excluded = [...fact.ignores, ...fact.exempt];

  const probes = [...fact.matchedFiles, ...syntheticCandidates(expandExtensions(fact.files))]
    .map((file) => file.replace('!(app)', '__blueprint_module__'))
    .filter((file) => !excluded.some((net) => minimatch(file, net, { dot: true })));

  if (!probes.length) {
    return [evidence(fact, 'unverified', 'No representative in-scope probe is available.')];
  }

  return Promise.all([...new Set(probes)].map(async (file) => {
    try {
      const config = await context.eslint.calculateConfigForFile(path.join(context.root, file));

      return { ...compareProhibition(fact, config, { ...context, file }),
        probeFile: file };
    } catch (error) {
      return evidence(fact, 'unverified', String(error));
    }
  }));
}

function expandExtensions(files: string[]): string[] {
  return files.flatMap((file) => {
    const extensions = /\{([^{}]*)\}$/.exec(file);

    return extensions
      ? extensions[1].split(',').map((extension) => file.slice(0, extensions.index) + extension)
      : [file];
  });
}

function compareProhibition(
  fact: ProhibitionFact,
  config: EffectiveConfig | undefined,
  context: { blueprint: Blueprint; file: string; root: string; lintRoot: string },
): ProhibitionEvidence {
  const { blueprint, file } = context;

  if (config === undefined) {
    return evidence(fact, 'unverified', `Effective configuration unavailable for ${file}.`);
  }

  if (!intactCarrier(context, fact, config)) {
    return evidence(fact, 'failed',
      `Missing, disabled, replaced, or mismatched ${fact.ruleId} at ${file}.`);
  }

  const effective = resolveArchitecture(blueprint.architecture, {
    framework: blueprint.framework,
    severity: blueprint.emit?.lint?.severity,
    parserCapabilities: prohibitionParserCapabilities(
      config.languageOptions, path.join(context.root, file),
    ),
  }).layers.find((layer) => layer.name === fact.layer)!
    .prohibitions.find((entry) => entry.id === fact.id)!;

  return evidence({ ...fact, ...effective, reach: fact.reach }, 'verified');
}

function intactCarrier(
  context: { blueprint: Blueprint; root: string; lintRoot: string },
  fact: ProhibitionFact, config: EffectiveConfig,
): boolean {
  const raw = config.rules?.[fact.ruleId];
  // Stryker disable next-line ArrayDeclaration: scalar rules lack required options
  const rule = Array.isArray(raw) ? raw : [raw];
  const expectedSeverity = fact.severity === 'error' ? 2 : 1;

  const expected = expectedProhibitions(context.blueprint, fact.layer);

  const options = rule[1] as { prohibitions?: unknown; basePath?: unknown } | undefined;

  return (rule[0] === expectedSeverity || rule[0] === fact.severity)
    && isDeepStrictEqual(options?.prohibitions, expected)
    && carrierRootMatches(options, context)
    && sameCarrier(config.plugins?.blueprint?.rules?.['must-not']);
}

function carrierRootMatches(
  options: { basePath?: unknown } | undefined,
  context: { root: string; lintRoot: string },
): boolean {
  // Stryker disable next-line OptionalChaining: prior equality requires options
  const basePath = options?.basePath;

  return (basePath === undefined || typeof basePath === 'string')
    && path.relative(path.resolve(context.root),
      path.resolve(context.lintRoot, basePath ?? '.')) === '';
}

function sameCarrier(value: unknown): boolean {
  const expected = plugin.rules!['must-not'];
  const actual = value as { create?: unknown; meta?: unknown } | undefined;

  return typeof actual?.create === 'function'
    && actual.create.toString() === expected.create.toString()
    && isDeepStrictEqual(actual.meta, expected.meta);
}

function expectedProhibitions(blueprint: Blueprint, layer: string) {
  return resolveArchitecture(blueprint.architecture, {
    framework: blueprint.framework,
    severity: blueprint.emit?.lint?.severity,
  }).layers.find((entry) => entry.name === layer)!
    .prohibitions.filter((entry) => entry.mode === 'executable');
}

function evidence(
  fact: ProhibitionFact,
  wiring: 'verified' | 'failed' | 'unverified',
  reason?: string,
): ProhibitionEvidence {
  return {
    ...fact,
    lintIntegration: wiring,
    ...prohibitionGateEvidence({ status: fact.status, severity: fact.severity, wiring }),
    ...(reason ? { reason } : {}),
  };
}

export function prohibitionDoctorChecks(facts: ProhibitionEvidence[]): DoctorCheck[] {
  return facts.map((fact) => {
    const label = renderProhibitionDoctorMessage(fact);

    return {
      label,
      ok: fact.gate !== 'failed',
      ...(fact.gate === 'unverified' ? { skipped: label } : {}),
    };
  });
}
