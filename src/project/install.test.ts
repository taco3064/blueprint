import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_CARRIER_PEERS,
  REQUIRED_DEPS,
  STACK_DEPS,
  SUPPORTED_ESLINT_MAJORS,
} from './install';

describe('every carrier init installs can resolve on the adopter\'s stack', () => {
  // `npm install -D <all of them>` is all-or-nothing, so ONE carrier the
  // project cannot satisfy takes the whole install down — and with it the
  // rest of init's plan. Two field runs proved it from both directions:
  // eslint-plugin-import capped its eslint peer at 9 (#37), and
  // eslint-plugin-import-x peered on @typescript-eslint/utils@^8.56 for
  // resolvers importBlock never uses, walling a repo pinned at 8.47 (#41).
  // So both halves are asserted here, read from the installed manifests
  // rather than trusted from the list.
  const peers = (dep: string): Record<string, string> => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join('node_modules', dep, 'package.json'), 'utf-8'),
    ) as { peerDependencies?: Record<string, string> };

    return manifest.peerDependencies ?? {};
  };

  // eslint is the host, not a carrier; the package under test is not
  // installed into its own node_modules.
  const carriers = [
    ...REQUIRED_DEPS.filter((dep) => dep !== 'eslint' && dep !== '@kekkai/blueprint'),
    ...Object.values(STACK_DEPS),
  ];

  it.each(carriers)('%s admits every supported ESLint major', (dep) => {
    const range = peers(dep).eslint ?? null;

    expect(range, `${dep} declares no eslint peer range`).not.toBeNull();

    const unsupported = SUPPORTED_ESLINT_MAJORS.filter(
      (major) => !new RegExp(`\\^${major}(\\.|\\s|\\||$)`).test(range as string),
    );

    expect(unsupported, `${dep} peer range "${range}" excludes ESLint ${unsupported.join(', ')}`)
      .toEqual([]);
  });

  it.each(carriers)('%s constrains nothing else the adopter owns', (dep) => {
    // An optional peer is still version-checked when the package is PRESENT,
    // and a peer cannot be satisfied by a nested copy — so every name here
    // is a version blueprint imposes on a repo from the outside.
    const extra = Object.keys(peers(dep))
      .filter((name) => name !== 'eslint')
      .filter((name) => !(ALLOWED_CARRIER_PEERS[dep] ?? []).includes(name));

    expect(extra, `${dep} peers on ${extra.join(', ')} — that constraint reaches into the adopter's `
    + 'tree and fails their install when it cannot be met. Allow it deliberately in '
    + 'ALLOWED_CARRIER_PEERS, or pick a carrier without it.').toEqual([]);
  });

  it('names at least one supported major, or every check above is vacuous', () => {
    // Each assertion in this block filters SUPPORTED_ESLINT_MAJORS and expects
    // nothing left over. An empty list satisfies all of them while checking no
    // package at all — the same vacuous green inspect warns about for an empty
    // layer net, and the reason blueprint names that state instead of passing it.
    expect(SUPPORTED_ESLINT_MAJORS.length).toBeGreaterThan(0);
    expect(SUPPORTED_ESLINT_MAJORS).toContain(9);
  });

  it('every carrier is a devDependency here, so the manifests above are real', () => {
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as {
      devDependencies: Record<string, string>;
    };

    expect(carriers.filter((dep) => !manifest.devDependencies[dep])).toEqual([]);
  });
});

describe('every supported ESLint major is one something here executes', () => {
  // `init`'s install note tells every adopter that `@kekkai/blueprint`'s CI runs its
  // own suite on each major in SUPPORTED_ESLINT_MAJORS. Nothing bound that sentence
  // to what CI does, and two changes already in view would have made it lie with the
  // whole suite green. Adding a major to the list: the carrier-peer checks above go
  // green the moment the peers admit it, and admitting a version says nothing about
  // running it. Bumping the devDependency to 10: from that day nothing runs 9, and
  // the note still says "each". Both are field run #150 returning in the same shape —
  // a claim in output with no test underneath it.
  //
  // A major is covered one of two ways, and one of them has to hold:
  //   - the devDependency range admits it, so the main matrix runs it, or
  //   - a ci.yml job installs that exact major, the way `eslint-10` does.
  //
  // Read off the two files rather than restated, so a change to either is what turns
  // this red — the list is the contract, and this is one case per member of it.
  const eslintRange = (): string => {
    const manifest = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as {
      devDependencies: Record<string, string>;
    };

    return manifest.devDependencies.eslint;
  };

  it.each(SUPPORTED_ESLINT_MAJORS)('ESLint %i is executed, not merely permitted', (major) => {
    const range = eslintRange();
    // Same shape as the peer-range check above: `^9` matches `^9.39.2` and not `^10`.
    const mainMatrix = new RegExp(`\\^${major}(\\.|\\s|\\||$)`).test(range);

    // Comment lines are stripped before the match, because this check is about what
    // CI RUNS and a comment runs nothing. Read whole, `# TODO: a leg for eslint@11
    // once the carriers admit it.` satisfies it — and that sentence is the single most
    // likely thing to be written at the exact moment this test first goes red, by
    // someone who saw it and meant to come back. The red would vanish on the way to
    // the fix. This repo's ci.yml comments are long and name versions and packages
    // constantly, so the collision is ordinary rather than contrived.
    //
    // Residual, unguarded on purpose: a trailing comment on a step line
    // (`run: … # eslint@11`) still counts. Splitting on `#` mid-line would misread a
    // `#` inside a quoted yaml scalar, and the failure mode above is a comment LINE.
    // `(?!\\d)` so a list containing 1 is not satisfied by a job installing 10.
    const steps = fs.readFileSync('.github/workflows/ci.yml', 'utf-8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

    const ownLeg = new RegExp(`eslint@${major}(?!\\d)`).test(steps);

    expect(
      mainMatrix || ownLeg,
      `SUPPORTED_ESLINT_MAJORS names ${major} and the install note tells adopters CI runs `
      + `the suite on each of them — but the eslint devDependency is "${range}" and no ci.yml `
      + `job installs eslint@${major}. Widen the devDependency or add a leg beside `
      + '`eslint-10`; do not leave that note claiming a major nothing here executes.',
    ).toBe(true);
  });
});
