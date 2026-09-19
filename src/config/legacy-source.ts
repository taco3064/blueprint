import { parse } from '@typescript-eslint/parser';

import type { Blueprint } from './types';

interface Node {
  type: string;
  range: [number, number];
}

interface Key extends Node {
  name?: string;
  value?: unknown;
  raw?: string;
}

interface Property extends Node {
  key: Key;
  computed: boolean;
  value: Node;
}

interface ObjectLiteral extends Node {
  properties: Property[];
}

export interface LegacyLayerDeclaration {
  layer: string;
  layout?: string;
  entry?: string;
}

/** How a Blueprint 3.2 config's own source reaches the 4.x unit shape. */
export type LegacySourceMigration
  = | { kind: 'rewritten'; source: string }
    | { kind: 'manual'; declarations: LegacyLayerDeclaration[] };

interface Edit {
  at: number;
  end: number;
  text: string;
}

export function migrateLegacyConfigSource(
  source: string,
  migrated: Blueprint,
): LegacySourceMigration {
  const declarations = migrated.architecture.layers.map((layer) => ({
    layer: layer.name,
    ...(layer.layout === 'file' ? {} : { layout: layer.layout }),
    ...(layer.entry === 'index' ? {} : { entry: layer.entry }),
  }));

  const edits = sourceEdits(source, declarations);

  return edits === null
    ? { kind: 'manual', declarations }
    : { kind: 'rewritten', source: applyEdits(source, edits) };
}

function sourceEdits(source: string, declarations: LegacyLayerDeclaration[]): Edit[] | null {
  const architecture = architectureLiteral(source);
  const layers = architecture ? properties(architecture, 'layers') : [];

  const elements = layers.length === 1
    ? (layers[0].value as Node & { elements?: (Node | null)[] }).elements
    : undefined;

  if (!elements || elements.length !== declarations.length
    || !elements.every((element) => element !== null && isPlainObject(element))) {
    return null;
  }

  const objects = elements as ObjectLiteral[];

  const insertions = objects.map((layer, index) =>
    layerInsertion(source, layer, declarations[index]));

  const retired = [architecture!, ...objects]
    .flatMap((object) => properties(object, 'module'));

  if (!retired.length || insertions.includes(null)) {
    return null;
  }

  return [
    ...retired.flatMap((property) => removal(source, property)),
    ...(insertions as Edit[][]).flat(),
  ];
}

function architectureLiteral(source: string): ObjectLiteral | null {
  let body: (Node & { declaration?: Node })[];

  try {
    body = (parse(source, { range: true, sourceType: 'module' }) as unknown as {
      body: typeof body;
    }).body;
  } catch {
    return null;
  }

  const config = configLiteral(body.find((node) => node.type === 'ExportDefaultDeclaration')
    ?.declaration);

  if (!config) {
    return null;
  }

  const index = config.properties.findLastIndex((node) =>
    node.type === 'Property' && keyName(node) === 'architecture');

  const overridden = config.properties.slice(index + 1)
    .some((node) => node.type === 'SpreadElement');

  const value = index < 0 || overridden ? null : config.properties[index].value;

  return value && isPlainObject(value) ? value as ObjectLiteral : null;
}

function configLiteral(declaration: Node | undefined): ObjectLiteral | null {
  if (declaration?.type === 'CallExpression') {
    const call = declaration as Node & { callee: Key; arguments: Node[] };

    return call.callee.name === 'defineBlueprint' && call.arguments[0]?.type === 'ObjectExpression'
      ? call.arguments[0] as ObjectLiteral
      : null;
  }

  return declaration?.type === 'ObjectExpression' ? declaration as ObjectLiteral : null;
}

function isPlainObject(node: Node): boolean {
  return node.type === 'ObjectExpression' && (node as ObjectLiteral).properties
    .every((property) => property.type === 'Property' && keyName(property) !== null);
}

function keyName(property: Property): string | null {
  if (property.computed) {
    return null;
  }

  return property.key.type === 'Identifier'
    ? property.key.name!
    : typeof property.key.value === 'string' ? property.key.value : null;
}

function properties(object: ObjectLiteral, name: string): Property[] {
  return object.properties.filter((property) => keyName(property) === name);
}

function layerInsertion(
  source: string,
  layer: ObjectLiteral,
  declaration: LegacyLayerDeclaration,
): Edit[] | null {
  const [name] = properties(layer, 'name');
  const literal = name?.value as Key | undefined;

  if (!name || (literal!.type === 'Literal' && literal!.value !== declaration.layer)) {
    return null;
  }

  // Stryker disable next-line MethodExpression: a string literal opens and closes with one quote
  const quote = literal!.raw?.startsWith('"') ? '"' : '\'';

  const fields = (['layout', 'entry'] as const)
    .filter((field) => declaration[field] !== undefined)
    .map((field) => `${field}: ${quote}${escape(declaration[field]!, quote)}${quote}`);

  return fields.length ? [insertion(source, { name, layer }, fields)] : [];
}

function escape(value: string, quote: string): string {
  return value.replace(/\\/g, '\\\\').replaceAll(quote, `\\${quote}`);
}

function insertion(
  source: string,
  at: { name: Property; layer: ObjectLiteral },
  fields: string[],
): Edit {
  const [start, end] = at.name.range;
  const lineStart = source.lastIndexOf('\n', start) + 1;
  const indent = source.slice(lineStart, start);
  const newline = source.indexOf('\n', end);
  const eol = source[newline - 1] === '\r' ? '\r\n' : '\n';
  const comma = /^[ \t]*,/.test(source.slice(end));

  if (/\S/.test(indent) || (newline === -1 ? source.length : newline) >= at.layer.range[1]) {
    return { at: end, end, text: fields.map((field) => `, ${field}`).join('') };
  }

  return comma
    ? { at: newline + 1, end: newline + 1, text: fields.map((field) => `${indent}${field},${eol}`).join('') }
    : { at: end, end, text: fields.map((field) => `,${eol}${indent}${field}`).join('') };
}

function removal(source: string, property: Property): Edit[] {
  const [start, end] = property.range;
  const lineStart = source.lastIndexOf('\n', start) + 1;
  // Stryker disable next-line Regex: an empty-matching pattern always matches at index 0
  const trailing = /^[ \t]*,?[ \t]*/.exec(source.slice(end))![0];
  const after = end + trailing.length;
  const lineBreak = /^\r?\n/.exec(source.slice(after));

  if (!/\S/.test(source.slice(lineStart, start)) && lineBreak) {
    return [{ at: lineStart, end: after + lineBreak[0].length, text: '' }];
  }

  if (trailing.includes(',')) {
    return [{ at: start, end: after, text: '' }];
  }

  const comma = source.lastIndexOf(',', start);

  return !source.slice(comma + 1, start).trim()
    ? [{ at: comma, end, text: '' }]
    : [{ at: comma, end: comma + 1, text: '' }, { at: start, end, text: '' }];
}

function applyEdits(source: string, edits: Edit[]): string {
  return [...edits]
    .sort((left, right) => right.at - left.at)
    .reduce((text, edit) => text.slice(0, edit.at) + edit.text + text.slice(edit.end), source);
}
