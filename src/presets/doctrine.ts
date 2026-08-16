import type { AxisDef, Blueprint, PlaybookSection } from '../config';

/**
 * The behavioral half of every preset — what no tool enforces and review holds:
 * the governance beliefs, the component-shape axes, and the working playbook.
 * Identical across frameworks, which is why the factories share one copy.
 */

/** The nine governance beliefs — all behavioral (held in review / CLAUDE.md). */
export function principles(): Blueprint['principles'] {
  return [
    {
      id: 'by-responsibility',
      say: 'Split by responsibility, not by size',
      why: 'The signal to split is how many things a unit does — line count is only a backstop.',
      land: 'claude',
    },
    {
      id: 'single-source-of-truth',
      say: 'One source of truth',
      why: 'Derive computed values; never store duplicate mutable state that can desync.',
      land: 'claude',
    },
    {
      id: 'narrow-interfaces',
      say: 'Keep interfaces narrow',
      why: 'Narrow inputs and outputs so illegal states cannot be expressed.',
      land: 'claude',
    },
    {
      id: 'knowledge-where-used',
      say: 'Keep knowledge where it is used',
      why: 'Push derivation to the child and state to its lowest common owner; do not hoist.',
      land: 'claude',
    },
    {
      id: 'dead-code',
      say: 'Dead code: delete it or mark it',
      why: 'An abstraction with no consumer is dead; sweep orphans, '
        + 'mark retained-dead as deprecated.',
      land: 'claude',
    },
    {
      id: 'lint-is-triage',
      say: 'Lint is an entry point, not a verdict',
      why: 'Mechanical checks only triage; cohesion and invariants need review.',
      land: 'claude',
    },
    {
      id: 'ac-not-scripture',
      say: 'Acceptance criteria are a start, not scripture',
      why: 'Fixing a ticket that violates an abstraction\'s responsibility is upholding the '
        + 'design.',
      land: 'claude',
    },
    {
      id: 'yagni',
      say: 'YAGNI — do not over-engineer',
      why: '"Might need it later" is not a reason to abstract now.',
      land: 'claude',
    },
    {
      id: 'cost-is-a-dimension',
      say: 'Cost is the third dimension',
      why: 'Cost = work per event × event frequency; price any logic wired to a data source.',
      land: 'claude',
    },
  ];
}

/**
 * The seven orthogonal component-shape axes. A set, not a pipeline: each is judged
 * independently, and triage rules are entry points rather than verdicts.
 */
export function componentShape(): AxisDef[] {
  return [
    {
      id: 'ownership-inversion',
      name: 'Ownership Inversion',
      say: 'The unit that needs derived state owns the derivation.',
      why: 'Do not precompute in the parent and drill the result down — '
        + 'the child imports the hook and derives it itself. Field-tested: 17 props down to 7.',
    },
    {
      id: 'io-shrinkage',
      name: 'IO Shrinkage',
      say: 'Narrow the inputs, shrink the outputs.',
      why: 'Three moves: split a multi-concern unit; '
        + 'collapse parallel raw states carrying an invariant into one modeled state; '
        + 'merge symmetric twins into one object of the same shape. '
        + 'Count and size are weak signals — whether the state is modeled is the review call.',
      triage: 'max-params',
    },
    {
      id: 'srp-decomposition',
      name: 'SRP Decomposition',
      say: 'Split on responsibility boundaries, not on size.',
      why: 'Naming test: if you cannot name it without "and", it wants splitting; '
        + 'dissolving code into an existing home is also a split. Exception: '
        + 'writable state that must stay in sync — force-splitting it manufactures sync bugs.',
      triage: 'max-statements',
    },
    {
      id: 'orchestration-shell',
      name: 'Orchestration Shell',
      say: 'A page only orchestrates.',
      why: 'Route/id resolution, the loading shell, shared sources, cross-child lifecycle — '
        + 'never deriving values on behalf of each child. Field-tested: '
        + 'a 6666-line detail page down to 552.',
      triage: 'max-lines',
    },
    {
      id: 'scoped-writable-state',
      name: 'Scoped Writable State',
      say: 'Writable state lives at the lowest common owner of its writers and readers.',
      why: 'Hoist only what is genuinely shared across a boundary; '
        + 'state that must survive a route change goes to the URL or a store. '
        + '"Might be shared later" is YAGNI — hoist when the sharing arrives.',
    },
    {
      id: 'lifecycle-internalization',
      name: 'Lifecycle Internalization',
      say: 'If lifecycle is part of the responsibility, build it in.',
      why: 'The caller receives a unit that is already running and cleans itself up — '
        + 'not a kit of handlers to wire into mount/effect hooks. Field-tested: '
        + '19 exports down to a one-line call.',
    },
    {
      id: 'pure-helpers',
      name: 'Pure Helpers ≠ Composables',
      say: 'Keep pure functions out of reactive/lifecycle units.',
      why: 'One exported function does not demand one file: '
        + 'responsibility splits at the function level; '
        + 'the file splits only when max-lines approaches. Expose the decision a unit makes, '
        + 'not its raw ingredients.',
    },
  ];
}

/**
 * The working playbook — the handbook's behavioral parts. No tool enforces these;
 * they live in the emitted handbook and agent contract.
 */
export function playbook(): PlaybookSection[] {
  return [runtimeLoadSection(), refactorSection(), designSection()];
}

/** Every section returns a fresh object — the file's own invariant. */
function runtimeLoadSection(): PlaybookSection {
  return {
    title: 'Runtime load discipline',
    rules: [
      {
        id: 'reprice-on-attach',
        say: 'Price every handler attached to a data source.',
        why: 'Before wiring anything to WS / polling / scroll / input, answer: '
          + 'events per second, data per event, per-event cost. If you cannot answer, '
          + 'it does not merge — and copying an existing pattern is no exemption, '
          + 'because frequency is not in the code.',
      },
      {
        id: 'identity-discipline',
        say: 'High-frequency updates write in place.',
        why: 'Patch the changed entry and keep container identity; '
          + 'whole-replace is for baseline rebuilds only. '
          + 'A prop whose identity changed while its value did not is the disease. '
          + 'Write shapes do not port across frameworks.',
      },
      {
        id: 'render-diagnosis',
        say: 'Diagnose re-renders in four steps, never by guessing.',
        why: 'Who renders (profiler) → what triggered it (render tracing) '
          + '→ who produced the identity (grep the assignment sites) '
          + '→ was it worth it (compare against the event payload).',
      },
      {
        id: 'measurable-perf',
        say: 'Performance claims must be acceptance-testable.',
        why: '"Fewer re-renders" is not a claim; "one event re-renders at most N components" is. '
          + 'Pin it with a render-count or identity-stability test — '
          + 'an unmeasured performance claim did not happen.',
      },
    ],
  };
}

function refactorSection(): PlaybookSection {
  return {
    title: 'Refactor discipline',
    rules: [
      {
        id: 'safety-net-first',
        say: 'Safety net first, then split, then tidy the tests.',
        why: 'Three stages, one commit each, non-overlapping review scopes. '
          + 'Writing the net first forces the observable contract into the open.',
      },
      {
        id: 'one-arc-one-pr',
        say: 'One refactor arc = one PR, one commit per phase.',
        why: 'The PR body maps each commit to its phase; '
          + 'ask before splitting the arc into separate tickets.',
      },
      {
        id: 'extract-from-source',
        say: 'Extract by copying from source, never by rewriting from memory.',
        why: 'After extraction, diff the target against git history — '
          + 'a passing suite alone does not prove the extraction faithful.',
      },
      {
        id: 'recursive-dep-scan',
        say: 'Scan every identifier before extracting.',
        why: 'Not just reactive refs — imports, local definitions, parameters. '
          + 'A missed dependency surfaces later as a broken extraction.',
      },
      {
        id: 'dont-pin-moving-contracts',
        say: 'Do not pin what the refactor itself will change.',
        why: 'A safety net asserting values the arc is about to change fails the moment the '
          + 'sibling refactor lands.',
      },
      {
        id: 'contract-test-payloads',
        say: 'AC-named payload fields deserve a contract test.',
        why: 'Asserting that the mocked service receives field X is not a tautology — '
          + 'a dropped field or an unbound handler breaks it while the source constant stays '
          + 'green.',
      },
      {
        id: 'summarize-with-themes',
        say: 'Wrap an arc with cross-cutting themes and verified numbers.',
        why: 'Name the forces (ownership inversion, IO shrinkage, SRP) '
          + 'and attach before/after numbers verified against git history.',
      },
    ],
  };
}

function designSection(): PlaybookSection {
  return {
    title: 'Design collaboration',
    rules: [
      {
        id: 'guard-not-deviate',
        say: 'Frame architectural corrections as guarding the design.',
        why: 'State the principle being protected, show how the literal ticket reading violates '
          + 'it, and present the choice as that principle\'s natural consequence.',
      },
      {
        id: 'respect-settled-design',
        say: 'Do not reopen settled designs.',
        why: 'When the shape has been specified, implement it as spec. '
          + 'Raise genuine concerns once, with reasons — not as a menu of alternatives.',
      },
      {
        id: 'bypass-is-no-excuse',
        say: '"The user can work around it" does not park a bug.',
        why: 'Judge by diff size, scope, and standalone impact; '
          + 'a normal-path bug that violates expectations deserves its ticket.',
      },
    ],
  };
}
