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

function compareIdentifiers(left: string | undefined, right: string | undefined): number {
  if (left === undefined || right === undefined) {
    return Number(left !== undefined) - Number(right !== undefined);
  }

  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Math.sign(Number(left) - Number(right));
  }

  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }

  return Number(left > right) - Number(left < right);
}

function comparePrerelease(left: string[], right: string[]): number {
  if (!left.length || !right.length) {
    return Math.sign(right.length - left.length);
  }

  const length = Math.max(left.length, right.length);

  const orders = Array.from({ length }, (_, position) =>
    compareIdentifiers(left[position], right[position]));

  return orders.find((order) => order !== 0) ?? 0;
}

export function compareVersions(left: string, right: string): number {
  const a = parse(left);
  const b = parse(right);

  const index = a.core.findIndex((part, position) => part !== b.core[position]);

  return index === -1
    ? comparePrerelease(a.prerelease, b.prerelease)
    : Math.sign(a.core[index] - b.core[index]);
}
