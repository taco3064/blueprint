import fs from 'node:fs';
import path from 'node:path';
import type { LayerDef } from '../config';
import { renderTransformationObligationError } from '../operational-contract';

export const TRANSFORMATION_OBLIGATION_FILE = 'blueprint-transformation.json';
export type { TransformationObligationFailure } from '../operational-contract';

export interface TransformationSource {
  role: 'route-composition' | 'container-seed';
  unit: string;
  members: string[];
}

export interface TransformationDecision {
  source: string;
  destinations: string[];
  members: { source: string; destination: string }[];
}

export interface LayerToModuleObligation {
  version: 1;
  direction: 'layer-first-to-module-first';
  origin: {
    head: string;
    topology: 'layer-first';
    applicationRoot: string;
    selectedScope: string;
    sourceRoot: string;
    framework: string;
    router: 'app' | 'both' | 'pages' | null;
    layers?: LayerDef[];
    sources: TransformationSource[];
  };
  target: {
    topology: 'module-first';
    decisions: TransformationDecision[];
  };
}

export function readTransformationObligation(root: string): LayerToModuleObligation | null {
  const file = path.join(root, TRANSFORMATION_OBLIGATION_FILE);

  if (!fs.existsSync(file)) {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(renderTransformationObligationError({
      kind: 'invalid-json', file: TRANSFORMATION_OBLIGATION_FILE,
    }));
  }

  if (!isTransformationObligation(value)) {
    throw new Error(renderTransformationObligationError({
      kind: 'invalid-schema', file: TRANSFORMATION_OBLIGATION_FILE,
    }));
  }

  return value;
}

export function transformationObligationSource(
  obligation: LayerToModuleObligation,
): string {
  return `${JSON.stringify(obligation, null, 2)}\n`;
}

export function isTransformationObligation(value: unknown): value is LayerToModuleObligation {
  if (!record(value) || value.version !== 1 || value.direction !== 'layer-first-to-module-first') {
    return false;
  }

  const origin = value.origin;
  const target = value.target;

  return validOrigin(origin) && validTarget(target);
}

function validOrigin(origin: unknown): boolean {
  return record(origin)
    && origin.topology === 'layer-first'
    && strings(origin, ['head', 'applicationRoot', 'selectedScope', 'sourceRoot', 'framework'])
    && (origin.router === null || ['app', 'both', 'pages'].includes(String(origin.router)))
    && (origin.layers === undefined || Array.isArray(origin.layers))
    && Array.isArray(origin.sources)
    && origin.sources.every((source) => record(source)
      && (source.role === 'route-composition' || source.role === 'container-seed')
      && typeof source.unit === 'string'
      && stringArray(source.members)
      && source.members.length > 0);
}

function validTarget(target: unknown): boolean {
  return record(target)
    && target.topology === 'module-first'
    && Array.isArray(target.decisions)
    && target.decisions.every((decision) => record(decision)
      && typeof decision.source === 'string'
      && stringArray(decision.destinations)
      && Array.isArray(decision.members)
      && decision.members.every((member) => record(member)
        && strings(member, ['source', 'destination'])));
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function strings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string' && value[key] !== '');
}
