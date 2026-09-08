interface ClosedString {
  closed: true;
  copied: string;
  next: number;
}

type CopiedString = ClosedString | { closed: false; stoppedAt: number };

function copyString(text: string, i: number): CopiedString {
  let copied = text[i];

  i++;

  while (i < text.length && text[i] !== '"') {
    copied += text[i];

    if (text[i] === '\\' && i + 1 < text.length) {
      copied += text[i + 1];
      i++;
    }

    i++;
  }

  if (i >= text.length) {
    return { closed: false, stoppedAt: i };
  }

  return { closed: true, copied: copied + text[i], next: i + 1 };
}

export interface JsoncFailure {
  reason: 'unterminated-string' | 'unclosed-comment' | 'not-json';

  at?: number;
}

export type JsoncResult = { ok: true; value: unknown } | ({ ok: false } & JsoncFailure);

export function parseJsonc(text: string): JsoncResult {
  const stripped = stripComments(text);

  if (!stripped.ok) {
    return stripped;
  }

  try {
    return { ok: true, value: JSON.parse(dropTrailingCommas(stripped.text)) };
  } catch {
    return { ok: false, reason: 'not-json' };
  }
}

function stripComments(text: string): { ok: true; text: string } | ({ ok: false } & JsoncFailure) {
  let commentFree = '';

  for (let i = 0; i < text.length;) {
    if (text[i] === '"') {
      const literal = copyString(text, i);

      if (!literal.closed) {
        return { ok: false, reason: 'unterminated-string', at: literal.stoppedAt };
      }

      commentFree += literal.copied;
      i = literal.next;
    } else if (text[i] === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      const end = commentEnd(text, i);

      if (end === -1) {
        return { ok: false, reason: 'unclosed-comment', at: text.length };
      }

      i = end;
    } else {
      commentFree += text[i];
      i++;
    }
  }

  return { ok: true, text: commentFree };
}

function commentEnd(text: string, i: number): number {
  if (text[i + 1] === '/') {
    const newline = text.indexOf('\n', i);

    return newline === -1 ? text.length : newline;
  }

  const close = text.indexOf('*/', i + 2);

  return close === -1 ? -1 : close + 2;
}

function dropTrailingCommas(commentFree: string): string {
  let clean = '';

  for (let i = 0; i < commentFree.length;) {
    if (commentFree[i] === '"') {
      const literal = copyString(commentFree, i) as ClosedString;

      clean += literal.copied;
      i = literal.next;
    } else if (commentFree[i] === ',') {
      const after = /\S/.exec(commentFree.slice(i + 1));
      // Stryker disable next-line OptionalChaining: an overrun is caught as the same invalid JSONC.
      const nextChar = after?.[0];

      if (nextChar !== '}' && nextChar !== ']') {
        clean += ',';
      }

      i++;
    } else {
      clean += commentFree[i];
      i++;
    }
  }

  return clean;
}

export interface UnreadableConfig extends JsoncFailure {
  file: string;
}

const JSONC_REASON: Record<JsoncFailure['reason'], string> = {
  'unterminated-string': 'a string literal never closes',
  'unclosed-comment': 'a block comment never closes',
  'not-json': 'it is not valid JSON once the comments are stripped',
};

export function unreadableTsconfigs(
  tsconfigs: Record<string, string | null>,
): UnreadableConfig[] {
  const failures: UnreadableConfig[] = [];

  for (const [file, text] of Object.entries(tsconfigs)) {
    if (text === null) {
      continue;
    }

    const result = parseJsonc(text);

    if (!result.ok) {
      failures.push({ file, reason: result.reason, at: result.at });
    }
  }

  return failures;
}

export function describeUnreadable(failures: UnreadableConfig[]): string {
  return failures
    .map(({ file, reason, at }) => {
      const where = at === undefined ? '' : ` at character ${at}`;

      return `${file} could not be read (${JSONC_REASON[reason]}${where})`;
    })
    .join('; ');
}
