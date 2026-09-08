import type { OwnedPrimitive } from '../config';

export function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
}

export function table(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export function formatOwns(owns: OwnedPrimitive[] | undefined): string {
  if (!owns?.length) {
    return '';
  }

  return owns
    .map((primitive) => {
      if (typeof primitive === 'string') {
        return `\`${primitive}\``;
      } else if ('global' in primitive) {
        return `global \`${primitive.global}\``;
      } else if (primitive.imports?.length) {
        return `\`${primitive.package}\` → ${primitive.imports.map((i) => `\`${i}\``).join(', ')}`;
      }

      return `\`${primitive.package}\``;
    })
    .join(', ');
}

const marker = (tag: string) =>
  [`<!-- ${tag}:START -->`, `<!-- ${tag}:END -->`] as const;

export function injectBetweenMarkers(source: string, tag: string, content: string): string {
  const [start, end] = marker(tag);
  const startIdx = source.indexOf(start);

  const endIdx = source.indexOf(end, startIdx);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Markers "${start}" / "${end}" not found (or out of order) in source.`);
  }

  return [
    source.slice(0, startIdx + start.length),
    `\n${content}\n`,
    source.slice(endIdx),
  ].join('');
}
