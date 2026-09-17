const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

interface ParsedVersion {
  core: number[];
  prerelease: string[];
}

export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION.test(value);
}

function parse(value: string): ParsedVersion {
  const match = VERSION.exec(value);

  if (!match) {
    throw new RangeError(value);
  }

  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] === undefined ? [] : match[4].split('.'),
  };
}

function compareIdentifiers(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Math.sign(Number(left) - Number(right));
  }

  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }

  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePrerelease(left: string[], right: string[]): number {
  if (!left.length || !right.length) {
    return Math.sign(right.length - left.length);
  }

  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    if (left[index] === undefined || right[index] === undefined) {
      return left[index] === undefined ? -1 : 1;
    }

    const order = compareIdentifiers(left[index], right[index]);

    if (order !== 0) {
      return order;
    }
  }

  return 0;
}

export function compareVersions(left: string, right: string): number {
  const a = parse(left);
  const b = parse(right);

  for (let index = 0; index < a.core.length; index++) {
    if (a.core[index] !== b.core[index]) {
      return Math.sign(a.core[index] - b.core[index]);
    }
  }

  return comparePrerelease(a.prerelease, b.prerelease);
}
