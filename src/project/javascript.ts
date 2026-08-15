/**
 * What a JavaScript config file says as *code* — its comments gone, and its
 * literal bodies separable from the rest.
 *
 * Beside `jsonc.ts` for the same reason it exists: a character scanner whose
 * bounds are its whole correctness argument. A different language, though —
 * three literal delimiters instead of one, and a `/` that opens a comment, a
 * regex or a division depending on what came before it, which nothing this size
 * can decide.
 *
 * So the contract is a *direction*, not a guarantee: where the scan cannot be
 * sure it returns nothing, and a caller reads that as the tell being absent.
 * The two errors are not symmetric. Reading a wired config as unwired is
 * visible and recoverable — the adopter is told to spread the rules and `init`
 * hands them the reference file to merge from. Reading an unwired one as wired
 * withholds that reference in silence, and leaves whatever runs next to explain
 * a state that never happened.
 */

/** The two readings a caller needs, from one pass over the text. */
export interface ScriptText {
  /**
   * Comments gone, literals intact — so a package name is still findable where
   * it actually lives, inside the quotes of an import specifier.
   */
  code: string;
  /**
   * Comments gone and every literal body blanked, delimiters kept. A call is
   * code; the same characters inside quotes are a string that says so.
   */
  outsideLiterals: string;
}

/** A literal that closed, or the fact that it did not — never both. */
type CopiedLiteral = { closed: true; copied: string; next: number } | { closed: false };

/**
 * Copy one `'` / `"` / `` ` ``-delimited literal from `text[i]`.
 *
 * A template's `${…}` holes are copied as body rather than re-entered as code,
 * so a call written inside one is invisible. That is the safe direction and it
 * is also the honest one: re-entering would need the brace nesting a parser
 * has and this does not.
 */
function copyLiteral(text: string, i: number): CopiedLiteral {
  const quote = text[i];
  let copied = quote;

  i++;

  while (i < text.length && text[i] !== quote) {
    if (text[i] === '\\') {
      // The escaped character travels with its backslash, or a `\'` ends the
      // literal one character early and every bound after it is off.
      copied += text.slice(i, i + 2);
      i += 2;

      continue;
    }

    copied += text[i];
    i++;
  }

  // Ran out of text before the closing delimiter. A literal that never closes
  // means the scan misread where code was somewhere above, so nothing it
  // produced can be trusted — including a tell it already passed.
  if (i >= text.length) {
    return { closed: false };
  }

  return { closed: true, copied: copied + quote, next: i + 1 };
}

/**
 * Read a JavaScript source into its {@link ScriptText}, or `null` when the scan
 * ran out of text inside a literal or a block comment.
 *
 * `null` is also what an unrecognised regex literal produces, and deliberately:
 * this does not attempt regex detection, so `/a\/*b/` reads as a block comment
 * that never closes, and `/'/ ` as a literal that never closes. Both end here,
 * which is the direction the file header argues for. A regex whose body happens
 * to be quote-free and comment-free is scanned as ordinary code and costs
 * nothing.
 */
export function readScript(text: string): ScriptText | null {
  let code = '';
  let outsideLiterals = '';

  for (let i = 0; i < text.length;) {
    const char = text[i];

    if (char === '\'' || char === '"' || char === '`') {
      const literal = copyLiteral(text, i);

      if (!literal.closed) {
        return null;
      }

      code += literal.copied;
      outsideLiterals += char + char;
      i = literal.next;
    } else if (char === '/' && text[i + 1] === '/') {
      // `indexOf` answers with the position, so there is no bound to walk past.
      const newline = text.indexOf('\n', i);

      i = newline === -1 ? text.length : newline;
    } else if (char === '/' && text[i + 1] === '*') {
      // From AFTER the opener, or `/*/` reads as a closed comment: the `*/` the
      // search finds would be the opener's own `*` with the next `/`.
      const close = text.indexOf('*/', i + 2);

      if (close === -1) {
        return null;
      }

      i = close + 2;
    } else {
      code += char;
      outsideLiterals += char;
      i++;
    }
  }

  return { code, outsideLiterals };
}
