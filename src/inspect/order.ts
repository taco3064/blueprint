/**
 * The one text comparator `inspect` sorts by — code-unit order, the same order
 * `Array.prototype.sort` uses with no comparator at all.
 *
 * It exists as a named function because of the equal case. Written inline at a call
 * site whose keys are unique — directory entries, `Map` keys — `a < b ? -1 : 1` and
 * `a <= b ? -1 : 1` decide the same order on every input that site can produce, so
 * the difference between a comparator and a coin flip is invisible there. Here it
 * is one question with a direct answer.
 *
 * Not `localeCompare`: with no locale argument that reads the environment's, which
 * is the opposite of what a diffable artifact needs — two machines would order the
 * same findings differently.
 */
export function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  return a > b ? 1 : 0;
}
