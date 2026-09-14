import { parse } from '@typescript-eslint/parser';

interface JsonObject {
  range: [number, number];
  properties: { key: { value: string }; value: JsonObject }[];
}

export function insertJsonMembers(
  text: string,
  keys: string[],
  members: Record<string, unknown>,
): string | null {
  const ast = parse(`(${text})`, { range: true });
  let node = (ast.body[0] as unknown as { expression: JsonObject }).expression;

  for (const key of keys) {
    const matching = node.properties.filter((property) => property.key.value === key);

    if (matching.length !== 1) {
      return null;
    }

    node = matching[0].value;
  }

  const opening = node.range[0];
  const body = text.slice(opening, node.range[1] - 2);
  const whitespace = /^\s*/.exec(body)![0];
  const separator = whitespace.includes('\n') ? whitespace : ' ';

  const entries = Object.entries(members)
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(`,${separator}`);

  const insertion = node.properties.length ? `${entries},${separator}` : entries;
  const at = opening + whitespace.length;

  return text.slice(0, at) + insertion + text.slice(at);
}
