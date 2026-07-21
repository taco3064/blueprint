import type { OwnedPrimitive } from '../config';

/** Escape a value for use inside a markdown table cell. */
export function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

/** Render a markdown table from headers and pre-escaped rows. */
export function table(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

/** Render a layer's owned primitives as an inline markdown fragment. */
export function formatOwns(owns: OwnedPrimitive[] | undefined): string {
  if (!owns?.length) return '';

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

/**
 * Replace the content between `<!-- TAG:START -->` and `<!-- TAG:END -->` in
 * `source`. Pure string transform; throws if the markers are missing or out
 * of order. The file I/O, hashing, and formatting around it live in Bootstrap.
 * @group Utilities
 */
export function injectBetweenMarkers(source: string, tag: string, content: string): string {
  const [start, end] = marker(tag);
  const startIdx = source.indexOf(start);
  const endIdx = source.indexOf(end);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Markers "${start}" / "${end}" not found (or out of order) in source.`);
  }

  return [
    source.slice(0, startIdx + start.length),
    `\n${content}\n`,
    source.slice(endIdx),
  ].join('');
}
