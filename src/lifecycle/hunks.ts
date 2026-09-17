export interface TextHunk {
  before: string;
  after: string;
}

function lines(value: string): string[] {
  return value.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

function indices(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

function commonPrefix(left: string, right: string): number {
  return indices(left.length).find((index) => left[index] !== right[index]) ?? left.length;
}

function refine(before: string, after: string): TextHunk {
  const prefix = commonPrefix(before, after);
  const tail = (text: string) => text.slice(prefix).split('').reverse().join('');
  const suffix = commonPrefix(tail(before), tail(after));

  return {
    before: before.slice(prefix, before.length - suffix),
    after: after.slice(prefix, after.length - suffix),
  };
}

function lcsTable(left: string[], right: string[]): number[][] {
  const table = indices(left.length + 1).map(() => indices(right.length + 1).map(() => 0));

  for (const i of indices(left.length).reverse()) {
    for (const j of indices(right.length).reverse()) {
      table[i][j] = left[i] === right[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  return table;
}

function changeRuns(left: string[], right: string[]): TextHunk[] {
  const table = lcsTable(left, right);
  const runs: TextHunk[] = [{ before: '', after: '' }];
  const cursor = { i: 0, j: 0 };

  indices(left.length + right.length).forEach(() => {
    const { i, j } = cursor;
    const pending = runs[runs.length - 1];

    if (left[i] === right[j]) {
      runs.push({ before: '', after: '' });
      cursor.i = i + 1;
      cursor.j = j + 1;
    } else if (j >= right.length || (i < left.length && table[i + 1][j] >= table[i][j + 1])) {
      pending.before += left[i];
      cursor.i = i + 1;
    } else {
      pending.after += right[j];
      cursor.j = j + 1;
    }
  });

  return runs;
}

export function textHunks(before: string, after: string): TextHunk[] {
  return changeRuns(lines(before), lines(after))
    .filter((run) => run.before !== run.after)
    .map((run) => refine(run.before, run.after));
}

export function occurrences(text: string, fragment: string): number {
  if (!fragment) {
    return 0;
  }

  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return [...text.matchAll(new RegExp(`(?=${escaped})`, 'g'))].length;
}
