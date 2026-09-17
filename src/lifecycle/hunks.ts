export interface TextHunk {
  before: string;
  after: string;
}

function lines(value: string): string[] {
  return value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function commonPrefix(left: string, right: string): number {
  let length = 0;

  while (length < left.length && length < right.length && left[length] === right[length]) {
    length++;
  }

  return length;
}

function refine(before: string, after: string): TextHunk {
  const prefix = commonPrefix(before, after);
  const limit = Math.min(before.length, after.length) - prefix;
  let suffix = 0;

  while (
    suffix < limit
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }

  return {
    before: before.slice(prefix, before.length - suffix),
    after: after.slice(prefix, after.length - suffix),
  };
}

function lcsTable(left: string[], right: string[]): Uint32Array[] {
  const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));

  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
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
  let i = 0;
  let j = 0;

  while (i < left.length || j < right.length) {
    const pending = runs[runs.length - 1];

    if (i < left.length && j < right.length && left[i] === right[j]) {
      runs.push({ before: '', after: '' });
      i++;
      j++;
    } else if (j >= right.length || (i < left.length && table[i + 1][j] >= table[i][j + 1])) {
      pending.before += left[i++];
    } else {
      pending.after += right[j++];
    }
  }

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

  let count = 0;

  for (let at = text.indexOf(fragment); at !== -1; at = text.indexOf(fragment, at + 1)) {
    count++;
  }

  return count;
}
