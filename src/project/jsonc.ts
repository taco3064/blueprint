/** A literal that closed, or the offset the scan gave up at — never both. */
interface ClosedString {
  closed: true;
  copied: string;
  next: number;
}

type CopiedString = ClosedString | { closed: false; stoppedAt: number };

/** Copy a literal verbatim from `text[i]` — a tsconfig's own data contains `/*`. */
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

  // Ran out of text before the closing quote: report where it came to rest, which
  // is what makes every bound above answerable — a scan one character too far
  // changes the number a reader is shown.
  if (i >= text.length) {
    return { closed: false, stoppedAt: i };
  }

  return { closed: true, copied: copied + text[i], next: i + 1 };
}

/**
 * Why a JSONC document could not be read, and the character offset the scan gave
 * up at. Reported rather than folded into one null: "I cannot read your tsconfig"
 * is not something an adopter can act on — and a failure with no position leaves
 * every bound in the scanner unanswerable, since running one character too far
 * produced the same bare null.
 */
export interface JsoncFailure {
  reason: 'unterminated-string' | 'unclosed-comment' | 'not-json';
  /**
   * Character offset the scan came to rest at. Absent — not zero — for `not-json`,
   * since offset 0 is a legitimate position and would read as one.
   */
  at?: number;
}

export type JsoncResult = { ok: true; value: unknown } | ({ ok: false } & JsoncFailure);

/**
 * Tolerant JSONC parse for the tsconfig family: strips line and block comments
 * plus trailing commas — outside string literals only — then `JSON.parse`. Vite
 * + TS starters ship tsconfigs *with comments* by default, so treating JSONC as
 * unreadable would false-red the doctor's alias check on the mainstream path.
 */
export function parseJsonc(text: string): JsoncResult {
  // A STRING, not an array joined at the end: `'' + undefined` shows an overrun
  // where `[undefined].join('')` hides it, and the bounds are this scanner's whole
  // correctness argument.
  let commentFree = '';

  for (let i = 0; i < text.length;) {
    if (text[i] === '"') {
      const literal = copyString(text, i);

      if (!literal.closed) {
        return { ok: false, reason: 'unterminated-string', at: literal.stoppedAt };
      }

      commentFree += literal.copied;
      i = literal.next;
    } else if (text[i] === '/' && text[i + 1] === '/') {
      // `indexOf` answers with the position, so there is no bound to walk past.
      const newline = text.indexOf('\n', i);

      i = newline === -1 ? text.length : newline;
    } else if (text[i] === '/' && text[i + 1] === '*') {
      // From AFTER the opener, or `/*/` reads as a closed comment: the `*/` the
      // search finds would be the opener's own `*` with the next `/`.
      const close = text.indexOf('*/', i + 2);

      if (close === -1) {
        return { ok: false, reason: 'unclosed-comment', at: text.length };
      }

      i = close + 2;
    } else {
      commentFree += text[i];
      i++;
    }
  }

  // Second pass, comment-free: drop a comma whose next non-space is `}`/`]`.
  let clean = '';

  for (let i = 0; i < commentFree.length;) {
    if (commentFree[i] === '"') {
      // Proven closed by the first pass. A cast, not a check: the check would be a
      // branch no input can take, which reads as a case somebody handled.
      const literal = copyString(commentFree, i) as ClosedString;

      clean += literal.copied;
      i = literal.next;
    } else if (commentFree[i] === ',') {
      // undecidable: a hand-walked index past the end yields `undefined`, neither
      // `}` nor `]`, so overrunning keeps the comma exactly as stopping would.
      const after = /\S/.exec(commentFree.slice(i + 1));
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

  try {
    return { ok: true, value: JSON.parse(clean) };
  } catch {
    // No offset: JSON.parse's position refers to the stripped text, not the file
    // the reader has open.
    return { ok: false, reason: 'not-json' };
  }
}

/** A tsconfig the JSONC reader gave up on, named so a caller can say which. */
export interface UnreadableConfig extends JsoncFailure {
  file: string;
}

const JSONC_REASON: Record<JsoncFailure['reason'], string> = {
  'unterminated-string': 'a string literal never closes',
  'unclosed-comment': 'a block comment never closes',
  'not-json': 'it is not valid JSON once the comments are stripped',
};

/**
 * The tsconfig/jsconfig files that are present but unparseable.
 *
 * Every reader of `paths` skips these, and skipping *silently* is the trap:
 * an alias declared inside an unreadable tsconfig is invisible, so doctor tells
 * an adopter to declare what is already there, and init calls a preset's alias
 * the repo's first. Both mislead in the same direction — they blame the alias for
 * a broken file. Callers name the file and the offset instead.
 */
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

/**
 * One clause per unreadable config: which file, what is wrong, where to look.
 * Shared so doctor and init say it the same way — the same reason `quotedIn` is
 * the one wiredness standard both of them read.
 */
export function describeUnreadable(failures: UnreadableConfig[]): string {
  return failures
    .map(({ file, reason, at }) => {
      const where = at === undefined ? '' : ` at character ${at}`;

      return `${file} could not be read (${JSONC_REASON[reason]}${where})`;
    })
    .join('; ');
}
