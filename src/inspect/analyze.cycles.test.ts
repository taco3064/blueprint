import { describe, expect, it } from 'vitest';

import { analyze, detectCycle, detectCycles } from './analyze';
import { vuePreset } from '../presets';
import type { ImportRef, ScanResult, ScannedFile } from './types';

const bp = vuePreset();
const LAYERS = bp.architecture.layers.map((layer) => layer.name);

function file(segments: string[], imports: Partial<ImportRef>[] = []): ScannedFile {
  return {
    path: ['src', ...segments].join('/'),
    segments,
    imports: imports.map((ref) => ({ specifier: '', names: [], isExport: false, ...ref })),
  };
}

function scanOf(files: ScannedFile[], topDirs: string[] = LAYERS): ScanResult {
  return { topDirs, files };
}

const rulesFor = (files: ScannedFile[], topDirs?: string[]) =>
  analyze(scanOf(files, topDirs), bp).map((finding) => finding.rule);

describe('analyze · cycle', () => {
  it('detects a module import cycle', () => {
    const found = rulesFor([
      file(['components', 'A', 'A.ts'], [{ specifier: '../B' }]),
      file(['components', 'B', 'B.ts'], [{ specifier: '../A' }]),
    ]);

    expect(found).toContain('cycle');
  });

  it('reports no cycle when a module is reached by two paths without a loop', () => {
    const found = rulesFor([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }, { specifier: '../C' }]),
      file(['components', 'C', 'index.ts'], [{ specifier: '../B' }]),
    ]);

    expect(found).not.toContain('cycle');
  });

  const cycleMessage = (files: ScannedFile[]): string | undefined =>
    analyze(scanOf(files), bp).find((finding) => finding.rule === 'cycle')?.message;

  it('walks the whole loop into the message, in order', () => {
    // "A cycle exists" is not actionable; which modules, and in what order, is.
    expect(cycleMessage([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }]),
      file(['components', 'B', 'index.ts'], [{ specifier: '../C' }]),
      file(['components', 'C', 'index.ts'], [{ specifier: '../A' }]),
    ])).toContain('components/A → components/B → components/C → components/A');
  });

  it('reports the loop itself, not the path that led into it', () => {
    // A reaches B, and B↔C is the actual cycle. Naming A in the report sends
    // the reader to break an edge that is not part of any loop.
    const message = cycleMessage([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }]),
      file(['components', 'B', 'index.ts'], [{ specifier: '../C' }]),
      file(['components', 'C', 'index.ts'], [{ specifier: '../B' }]),
    ]);

    expect(message).toContain('components/B → components/C → components/B');
    expect(message).not.toContain('components/A');
  });

  it('keeps looking after an acyclic component comes up clean', () => {
    // The first component walked has no loop; the search has to carry on to
    // the second rather than conclude from the first.
    expect(cycleMessage([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }]),
      file(['hooks', 'useC', 'index.ts'], [{ specifier: '../useD' }]),
      file(['hooks', 'useD', 'index.ts'], [{ specifier: '../useC' }]),
    ])).toContain('hooks/useC → hooks/useD → hooks/useC');
  });
});

describe('analyze · the cycle search does not stop early', () => {
  const cycleOf = (files: ScannedFile[]): string | undefined =>
    analyze(scanOf(files), bp).find((finding) => finding.rule === 'cycle')?.message;

  it('keeps checking a node\'s other edges after one leads nowhere', () => {
    // A reaches B, a dead end, and also C, which loops back. Returning on B's
    // null result reports no cycle on a graph that plainly has one — and the
    // order of a module's imports is not something a reader would suspect.
    expect(cycleOf([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }, { specifier: '../C' }]),
      file(['components', 'C', 'index.ts'], [{ specifier: '../A' }]),
    ])).toContain('components/A → components/C → components/A');
  });

  it('reaches a knot that no walk from the first module can touch', () => {
    // A → B is a dead end, and nothing connects it to the hooks pair. The
    // guarantee moved when cycles became an inventory: the component decomposition
    // is what reaches the second knot now, where it used to be `detectCycle`'s own
    // outer loop starting a fresh walk. Kept at this level because the assertion is
    // about the report, and it holds across that change of mechanism — which is
    // exactly what a test at this altitude should do.
    expect(cycleOf([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }]),
      file(['hooks', 'useC', 'index.ts'], [{ specifier: '../useD' }]),
      file(['hooks', 'useD', 'index.ts'], [{ specifier: '../useC' }]),
    ])).toContain('hooks/useC → hooks/useD → hooks/useC');
  });
});

describe('detectCycle · asked directly, as its callers ask it', () => {
  it('treats a target with no entry of its own as a leaf', () => {
    // A module that imports something and is imported by nobody never becomes a key
    // in the graph, so `edges.get(target)` is undefined for it. `analyze` used to
    // hand the whole graph over and covered this incidentally; it now passes one
    // component at a time, where every node is a key by construction. The absent-key
    // case is still part of this function's contract — and nothing was left asking
    // for it, which is how a walk that throws on a leaf ships green.
    expect(detectCycle(new Map([['a', new Set(['leaf'])]]))).toBeNull();
  });
});

describe('detectCycle · memoized, so a mesh stays linear', () => {
  /** `i → i+1` and `i → i+2`: paths from node 0 grow as Fibonacci(n). */
  const mesh = (n: number): Map<string, Set<string>> => {
    const edges = new Map<string, Set<string>>();

    for (let i = 0; i < n; i++) {
      const next = new Set<string>();

      if (i + 1 < n) {
        next.add(`n${i + 1}`);
      }

      if (i + 2 < n) {
        next.add(`n${i + 2}`);
      }

      edges.set(`n${i}`, next);
    }

    return edges;
  };

  it('answers no cycle on a 40-node mesh without walking its 102M paths', () => {
    // The only test that can see `visited`. It is memoization, so every assertion
    // about the RESULT holds with or without it — what does not hold is finishing:
    // re-entering a visited node turns 40 visits into 102 million paths, each
    // allocating its own trail. A tool that runs on a real dependency graph cannot
    // be exponential in it.
    expect(detectCycle(mesh(40))).toBeNull();
  });

  it('still finds a cycle in the same shape', () => {
    const edges = mesh(40);

    edges.get('n39')?.add('n0');

    expect(detectCycle(edges)?.[0]).toBe('n0');
  });
});

describe('detectCycles · every knot, not the first one', () => {
  const edgesOf = (pairs: [string, string[]][]): Map<string, Set<string>> =>
    new Map(pairs.map(([node, targets]) => [node, new Set(targets)]));

  it('answers with nothing on an acyclic graph', () => {
    expect(detectCycles(edgesOf([['a', ['b']], ['b', ['c']]]))).toEqual([]);
  });

  it('finds two unrelated cycles in one pass', () => {
    // The reason this exists: `detectCycle` returns on the first cycle it meets, so
    // a repo with two independent knots was told it had one, and the second only
    // appeared after the first was fixed and inspect re-run. For a debt inventory
    // that is the difference between sizing the work and discovering it.
    expect(detectCycles(edgesOf([
      ['a', ['b']],
      ['b', ['a']],
      ['x', ['y']],
      ['y', ['x']],
    ]))).toEqual([['a', 'b', 'a'], ['x', 'y', 'x']]);
  });

  it('reports one knot per component, not one per elementary cycle', () => {
    // a → b → c → a and c → b are two elementary cycles through one mutually
    // dependent trio. Listing both is not an inventory: cycles can outnumber nodes
    // exponentially, and the trio still has to be broken as a unit.
    const cycles = detectCycles(edgesOf([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a', 'b']],
    ]));

    expect(cycles).toHaveLength(1);
    expect(cycles[0][0]).toBe('a');
  });

  it('counts a module that imports itself', () => {
    // A one-node component. Nothing here classifies components as trivial or not —
    // the single walk answers null unless the self-edge is really there — and a
    // size-based rule would have dropped this case silently.
    expect(detectCycles(edgesOf([['a', ['a']], ['b', ['a']]]))).toEqual([['a', 'a']]);
  });

  it('orders the inventory by content, not by which node the walk started from', () => {
    // Two cycles can never share a node, so the head of each path is a total order.
    // Tarjan closes components in traversal order, which moves when an unrelated
    // module is added — and a report that reshuffles is a diff nobody reads.
    const forward = detectCycles(edgesOf([['a', ['b']], ['b', ['a']], ['x', ['y']], ['y', ['x']]]));

    const reversed = detectCycles(
      edgesOf([['y', ['x']], ['x', ['y']], ['b', ['a']], ['a', ['b']]]),
    );

    expect(reversed).toEqual(forward);
  });

  it('leaves the walk that already carries the memoization proof to find the path', () => {
    // The 40-node mesh, asked through the component layer: ~102M distinct paths, no
    // cycle. Composing rather than reimplementing is what keeps that property —
    // a second hand-written walk would be a second place for it to be lost.
    const edges = new Map<string, Set<string>>();

    for (let i = 0; i < 40; i++) {
      const targets = new Set<string>();

      if (i + 1 < 40) {
        targets.add(`n${i + 1}`);
      }

      if (i + 2 < 40) {
        targets.add(`n${i + 2}`);
      }

      edges.set(`n${i}`, targets);
    }

    expect(detectCycles(edges)).toEqual([]);
  });
});

describe('analyze · a report inventories every cycle', () => {
  const cycleMessages = (files: ScannedFile[]): string[] =>
    analyze(scanOf(files), bp)
      .filter((finding) => finding.rule === 'cycle')
      .map((finding) => finding.message);

  it('reports both knots when a repo has two', () => {
    const messages = cycleMessages([
      file(['components', 'A', 'index.ts'], [{ specifier: '../B' }]),
      file(['components', 'B', 'index.ts'], [{ specifier: '../A' }]),
      file(['hooks', 'useC', 'index.ts'], [{ specifier: '../useD' }]),
      file(['hooks', 'useD', 'index.ts'], [{ specifier: '../useC' }]),
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('components/A → components/B → components/A');
    expect(messages[1]).toContain('hooks/useC → hooks/useD → hooks/useC');
  });
});

describe('detectCycle · the three properties only a whole graph can ask about', () => {
  // These used to be asked through `analyze`, which handed `detectCycle` the entire
  // module graph. It now receives one strongly connected component at a time, and a
  // component by construction has no lead-in, no dead end and no second knot — so
  // every one of these went unasked the moment the caller changed, with the suite
  // green and the mutation sweep as the only witness. Asked of the unit directly,
  // which is where they belong: this function is exported for exactly this.
  it('trims the walk that led to the cycle, and reports only the cycle', () => {
    // x is how the walk got there and is not part of it. Reported whole, the path
    // names a module the reader then cannot find in the loop they are asked to break.
    expect(detectCycle(new Map([
      ['x', new Set(['a'])],
      ['a', new Set(['b'])],
      ['b', new Set(['a'])],
    ]))).toEqual(['a', 'b', 'a']);
  });

  it('keeps checking a node\'s other edges after one leads nowhere', () => {
    // `dead` is a leaf, so the first branch answers null. Returning that null as the
    // verdict reports no cycle on a graph that plainly has one — and the order of a
    // module's imports is not something a reader would suspect.
    expect(detectCycle(new Map([
      ['a', new Set(['dead', 'c'])],
      ['c', new Set(['a'])],
    ]))).toEqual(['a', 'c', 'a']);
  });

  it('starts a fresh walk at an untouched node after the first finds nothing', () => {
    // The first walk covers a and b and answers null. Treating that as the answer
    // stops before the pair that does cycle.
    expect(detectCycle(new Map([
      ['a', new Set(['b'])],
      ['x', new Set(['y'])],
      ['y', new Set(['x'])],
    ]))).toEqual(['x', 'y', 'x']);
  });
});

describe('detectCycles · a knot behind another knot is still its own knot', () => {
  it('closes a component whose edges also point into an already-closed one', () => {
    // Tarjan's rule that decides this: a target that is indexed but no longer on the
    // stack belongs to a component that is already closed, and its index must NOT
    // propagate. Take it anyway and the second component never satisfies
    // `lowest === own`, so it never closes — and a repo whose hooks cycle imports an
    // already-reported components cycle loses the hooks one entirely. Two knots, one
    // reachable from the other, is the ordinary brownfield shape.
    const cycles = detectCycles(new Map([
      ['components/A', new Set(['components/B'])],
      ['components/B', new Set(['components/A'])],
      ['hooks/useC', new Set(['hooks/useD', 'components/A'])],
      ['hooks/useD', new Set(['hooks/useC'])],
    ]));

    expect(cycles).toEqual([
      ['components/A', 'components/B', 'components/A'],
      ['hooks/useC', 'hooks/useD', 'hooks/useC'],
    ]);
  });
});
