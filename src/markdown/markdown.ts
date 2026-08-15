import type { OwnedPrimitive } from '../config';

/**
 * Escape a value for use inside a markdown table cell.
 *
 * Carriage returns collapse with the newlines rather than surviving them: a
 * blueprint written on Windows can carry CRLF inside a multi-line `does` or
 * `mustNot`, and matching `\n` alone leaves a stray `\r` in the middle of the
 * cell — where the trailing `.trim()` cannot reach it.
 */
export function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
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

/**
 * Replace the content between `<!-- TAG:START -->` and `<!-- TAG:END -->` in
 * `source`. Pure string transform; throws if the markers are missing or out
 * of order. The file I/O, hashing, and formatting around it live in Bootstrap.
 * @group Utilities
 */
export function injectBetweenMarkers(source: string, tag: string, content: string): string {
  const [start, end] = marker(tag);
  const startIdx = source.indexOf(start);
  // Search for the END from START onward, so what gets found is the END that
  // closes this block. Searching the whole document and then comparing the two
  // indices answered the same on every input — distinct markers can never share an
  // index, so `endIdx < startIdx` versus `<= startIdx` was a question nothing could
  // ask. Searching forward turns the failure into its own answer: there is no END
  // after this START. No guard for a `startIdx` of -1 either: `indexOf` clamps a
  // negative start to 0, and the missing START is what the next line reports.
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
