import path from 'node:path';
import { parse } from '@typescript-eslint/parser';

const SCALAR_START = '\n:-[{,?';

export function withoutComments(file: string, text: string): string {
  const name = path.posix.basename(file);

  if (/\.ya?ml$/.test(name)) {
    return withoutHashComments(text);
  }

  if (name.endsWith('.json')) {
    return withoutSlashComments(text, '"');
  }

  return name === '.eslintrc'
    ? withoutHashComments(withoutSlashComments(text, '"'))
    : withoutScriptComments(text);
}

function withoutScriptComments(text: string): string {
  try {
    return parse(text).comments.reduceRight(
      (code, { range: [start, end] }) =>
        code.slice(0, start) + blank(code.slice(start, end)) + code.slice(end),
      text,
    );
  } catch {
    return withoutSlashComments(text, '\'"`');
  }
}

function withoutSlashComments(text: string, quotes: string): string {
  let result = '';
  let index = 0;

  while (index < text.length) {
    const end = slashTokenEnd(text, index, quotes);
    const token = text.slice(index, end);

    result += /^\/[/*]/.test(token) ? blank(token) : token;
    index = end;
  }

  return result;
}

function slashTokenEnd(text: string, index: number, quotes: string): number {
  if (quotes.includes(text[index])) {
    return quotedEnd(text, index);
  }

  if (text.startsWith('//', index)) {
    return lineEnd(text, index);
  }

  if (text.startsWith('/*', index)) {
    const close = text.indexOf('*/', index + 2);

    return close === -1 ? text.length : close + 2;
  }

  return index + 1;
}

function withoutHashComments(text: string): string {
  let result = '';
  let index = 0;
  let previous = '\n';

  while (index < text.length) {
    const char = text[index];
    const comment = char === '#' && (index === 0 || /\s/.test(text[index - 1]));

    const end = comment
      ? lineEnd(text, index)
      : /['"]/.test(char) && SCALAR_START.includes(previous)
        ? quotedEnd(text, index, char === '\'')
        : index + 1;

    result += comment ? blank(text.slice(index, end)) : text.slice(index, end);
    previous = char === '\n' || !/\s/.test(char) ? char : previous;
    index = end;
  }

  return result;
}

function quotedEnd(text: string, index: number, doubled = false): number {
  const quote = text[index];
  let cursor = index + 1;

  while (cursor < text.length) {
    const escaped = doubled
      ? text.startsWith(quote + quote, cursor)
      : text[cursor] === '\\';

    if (escaped) {
      cursor += 2;
    } else if (text[cursor] === quote) {
      return cursor + 1;
    } else {
      cursor += 1;
    }
  }

  return text.length;
}

function lineEnd(text: string, index: number): number {
  const end = text.indexOf('\n', index);

  return end === -1 ? text.length : end;
}

function blank(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}
