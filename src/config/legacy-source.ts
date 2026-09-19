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

interface Program {
  body: (Node & { declaration?: Node })[];
  comments: (Node & { type: 'Line' | 'Block' })[];
  tokens: (Node & { value: string })[];
}

interface Scan {
  source: string;
  program: Program;
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
  let scan: Scan;

  try {
    scan = {
      source,
      program: parse(source, { range: true, sourceType: 'module' }) as unknown as Program,
    };
  } catch {
    return null;
  }

  const architecture = architectureLiteral(scan.program);
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
    layerInsertion(scan, layer, declarations[index]));

  const retired = [architecture!, ...objects]
    .flatMap((object) => properties(object, 'module'));

  if (!retired.length || insertions.includes(null)) {
    return null;
  }

  return [
    ...retired.flatMap((property) => removal(scan, property)),
    ...(insertions as Edit[][]).flat(),
  ];
}

function architectureLiteral(program: Program): ObjectLiteral | null {
  const config = configLiteral(program.body.find((node) =>
    node.type === 'ExportDefaultDeclaration')?.declaration);

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
  scan: Scan,
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

  return fields.length ? [insertion(scan, name, fields)] : [];
}

function escape(value: string, quote: string): string {
  return value.replace(/\\/g, '\\\\').replaceAll(quote, `\\${quote}`);
}

function insertion({ source, program }: Scan, name: Property, fields: string[]): Edit {
  const [start, end] = name.range;
  const lineStart = source.lastIndexOf('\n', start) + 1;
  const indent = source.slice(lineStart, start);
  const newline = source.indexOf('\n', end);
  const eol = source[newline - 1] === '\r' ? '\r\n' : '\n';
  const next = tokenFrom(program, end);
  const nextOnLaterLine = source.slice(end, next.range[0]).includes('\n');
  const inline = { at: end, end, text: fields.map((field) => `, ${field}`).join('') };

  if (/\S/.test(indent)) {
    return inline;
  }

  if (next.value !== ',') {
    return nextOnLaterLine
      ? { at: end, end, text: fields.map((field) => `,${eol}${indent}${field}`).join('') }
      : inline;
  }

  return !nextOnLaterLine && /^[ \t]*(?:\/\/.*)?\r?$/.test(source.slice(next.range[1], newline))
    ? { at: newline + 1, end: newline + 1, text: fields.map((field) => `${indent}${field},${eol}`).join('') }
    : inline;
}

function removal({ source, program }: Scan, property: Property): Edit[] {
  const [start, end] = property.range;
  const lineStart = source.lastIndexOf('\n', start) + 1;
  const next = tokenFrom(program, end);
  const separated = next.value === ',';
  const to = separated ? next.range[1] : end;
  // Stryker disable next-line Regex: an empty-matching pattern always matches at index 0
  const after = to + /^[ \t]*/.exec(source.slice(to))![0].length;
  const lineBreak = /^\r?\n/.exec(source.slice(after));
  const kept = keptComments(source, [start, to], program.comments);

  if (!/\S/.test(source.slice(lineStart, start)) && lineBreak) {
    return [{ at: lineStart, end: after + lineBreak[0].length, text: kept.lines(lineBreak[0]) }];
  }

  if (separated) {
    return [{ at: start, end: after, text: kept.inline }];
  }

  const comma = program.tokens.findLast((token) => token.range[1] <= start)!;
  const inline = keptComments(source, [comma.range[0], end], program.comments).inline;

  return [{ at: comma.range[0], end, text: inline && ` ${inline}` }];
}

function tokenFrom(program: Program, position: number): Program['tokens'][number] {
  return program.tokens.find((token) => token.range[0] >= position)!;
}

function keptComments(
  source: string,
  [from, to]: [number, number],
  comments: Program['comments'],
): { lines: (lineBreak: string) => string; inline: string } {
  const rest = source.slice(source.lastIndexOf('\n', from) + 1);
  const indent = rest.slice(0, rest.length - rest.trimStart().length);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';

  // Stryker disable next-line EqualityOperator: no comment starts or ends on a removed span's edge
  const inside = ({ range }: Node): boolean => range[0] > from && range[1] < to;

  const kept = comments.filter(inside)
    .map(({ range, type }) => ({ text: source.slice(range[0], range[1]), line: type === 'Line' }));

  return {
    lines: (lineBreak) => kept.map(({ text }) => `${indent}${text}${lineBreak}`).join(''),
    inline: kept.map(({ text, line }) => line ? `${text}${eol}${indent}` : `${text} `).join(''),
  };
}

function applyEdits(source: string, edits: Edit[]): string {
  return [...edits]
    .sort((left, right) => right.at - left.at)
    .reduce((text, edit) => text.slice(0, edit.at) + edit.text + text.slice(edit.end), source);
}
