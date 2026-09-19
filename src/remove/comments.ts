import path from 'node:path';
import { parse } from '@typescript-eslint/parser';

const SCALAR_START = new Set(['\n', ':', '-', '[', '{', ',', '?']);

interface ScanState {
  mode: 'plain' | 'quoted' | 'escaped' | 'line' | 'block';
  previous: string;
  quote?: string;
  opened?: number;
}

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

function scan(text: string, step: (state: ScanState, index: number) => string): string {
  const state: ScanState = { mode: 'plain', previous: '\n' };

  return text.split('').map((_, index) => step(state, index)).join('');
}

function withoutSlashComments(text: string, quotes: string): string {
  return scan(text, (state, index) => {
    const char = text[index];
    const next = text[index + 1];

    if (state.mode !== 'plain') {
      return state.mode === 'quoted' || state.mode === 'escaped'
        ? quotedStep(state, char, char === '\\')
        : commentStep(state, text, index);
    }

    if (quotes.includes(char)) {
      Object.assign(state, { mode: 'quoted', quote: char });
    } else if (char === '/' && (next === '/' || next === '*')) {
      Object.assign(state, { mode: next === '/' ? 'line' : 'block', opened: index });

      return ' ';
    }

    return char;
  });
}

function withoutHashComments(text: string): string {
  return scan(text, (state, index) => {
    const char = text[index];

    if (state.mode !== 'plain') {
      return state.mode === 'quoted' || state.mode === 'escaped'
        ? quotedStep(state, char, state.quote === '"'
            ? char === '\\'
            : text.startsWith('\'\'', index))
        : commentStep(state, text, index);
    }

    if (char === '#' && (index === 0 || /\s/.test(text[index - 1]))) {
      state.mode = 'line';

      return ' ';
    }

    if (/['"]/.test(char) && SCALAR_START.has(state.previous)) {
      Object.assign(state, { mode: 'quoted', quote: char });
    }

    state.previous = char === '\n' || !/\s/.test(char) ? char : state.previous;

    return char;
  });
}

function commentStep(state: ScanState, text: string, index: number): string {
  const char = text[index];
  const closes = char === '/' && text[index - 1] === '*' && index > state.opened! + 2;

  if (char === '\n' ? state.mode === 'line' : state.mode === 'block' && closes) {
    Object.assign(state, { mode: 'plain', previous: '\n' });
  }

  return char === '\n' ? char : ' ';
}

function quotedStep(state: ScanState, char: string, escape: boolean): string {
  if (state.mode === 'escaped') {
    state.mode = 'quoted';
  } else if (escape) {
    state.mode = 'escaped';
  } else if (char === state.quote) {
    state.mode = 'plain';
  }

  return char;
}

function blank(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}
