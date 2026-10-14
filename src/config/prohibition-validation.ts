import type { Framework, LayerDef, MustNotCapability } from './types';
import { MUST_NOT_CAPABILITIES } from './capabilities';
import { configValidationError } from './validation';

export function validateProhibitions(layer: LayerDef, framework: Framework): void {
  if (layer.mustNot === undefined) {
    return;
  }

  const fail = (reason: string): never => {
    throw configValidationError({ kind: 'must-not', layer: layer.name, reason });
  };

  if (!Array.isArray(layer.mustNot)) {
    fail('mustNot must be an array.');
  }

  const ids = new Set<string>();

  for (const entry of layer.mustNot) {
    if (typeof entry === 'string') {
      continue;
    }

    validateEntry(entry, { ids, framework }, fail);
  }
}

function validateEntry(
  entry: unknown,
  context: { ids: Set<string>; framework: Framework },
  fail: (reason: string) => never,
): void {
  const { ids, framework } = context;
  const value = object(entry, fail);

  keys(value, ['id', 'description', 'checks', 'exempt'], fail);

  if (!nonempty(value.id) || !/^[a-z][a-z0-9-]*$/.test(value.id) || ids.has(value.id)) {
    fail('Executable id must match [a-z][a-z0-9-]* and be unique within its layer.');
  }

  ids.add(value.id as string);

  if (!nonempty(value.description)) {
    fail('Executable description must be a non-empty string.');
  }

  if (!Array.isArray(value.checks) || value.checks.length === 0) {
    fail('Executable checks must be a non-empty array.');
  }

  validateChecks(value.checks as unknown[], framework, fail);

  if (value.exempt !== undefined) {
    validateExempt(value.exempt, fail);
  }
}

function validateChecks(
  values: unknown[],
  framework: Framework,
  fail: (reason: string) => never,
): void {
  const checks = new Set<string>();

  for (const check of values) {
    const normalized = validateCheck(check, framework, fail);

    if (checks.has(normalized)) {
      fail('Duplicate normalized checks are not allowed.');
    }

    checks.add(normalized);
  }
}

function validateCheck(value: unknown,
  framework: Framework,
  fail: (reason: string) => never): string {
  const check = object(value, fail);
  const discriminants = ['capability', 'package', 'global', 'call'].filter((key) => key in check);

  if (discriminants.length !== 1) {
    fail('Each check must have exactly one capability, package, global, or call discriminant.');
  }

  const kind = discriminants[0];

  keys(check, kind === 'package' ? ['package', 'pattern', 'imports'] : [kind], fail);

  if (!nonempty(check[kind])) {
    fail('Every check discriminant must be a non-empty string.');
  }

  if (kind === 'capability') {
    validateCapability(check.capability as string, framework, fail);
  }

  if (kind !== 'package') {
    return JSON.stringify([kind, check[kind]]);
  }

  return validatePackage(check, fail);
}

function validateCapability(
  capability: string,
  framework: Framework,
  fail: (reason: string) => never,
): void {
  if (!Object.hasOwn(MUST_NOT_CAPABILITIES, capability)) {
    fail('Unknown mustNot capability.');
  }

  const required = MUST_NOT_CAPABILITIES[capability as MustNotCapability].framework;

  if (required && framework !== 'auto' && framework !== required) {
    fail(`Capability ${capability} requires framework ${required}.`);
  }
}

function validatePackage(check: Record<string, unknown>, fail: (reason: string) => never): string {
  if (check.pattern !== undefined && typeof check.pattern !== 'boolean') {
    fail('Package pattern must be a boolean.');
  }

  if (check.imports !== undefined) {
    if (!Array.isArray(check.imports) || check.imports.length === 0
      || check.imports.some((name) => !nonempty(name))
      || new Set(check.imports).size !== check.imports.length) {
      fail('Package imports must contain distinct non-empty exported names.');
    }
  }

  return JSON.stringify(['package', check.package, check.pattern === true,
    check.imports === undefined ? null : [...check.imports as string[]].sort()]);
}

function validateExempt(value: unknown, fail: (reason: string) => never): void {
  if (!Array.isArray(value) || value.some((glob) => !nonempty(glob)
    || glob.startsWith('/') || /^[a-z]:/i.test(glob) || glob.includes('\\')
    || glob.split('/').includes('..'))) {
    fail('Exemptions must be portable project-relative globs without parent traversal.');
  }
}

function object(value: unknown, fail: (reason: string) => never): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('Executable entries and checks must be objects.');
  }

  return value as Record<string, unknown>;
}

function keys(value: object, allowed: string[], fail: (reason: string) => never): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    fail(`Unknown object key; allowed keys: ${allowed.join(', ')}.`);
  }
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
