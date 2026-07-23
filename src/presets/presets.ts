import { defineBlueprint } from '../config';
import type { AxisDef, Blueprint, EmitDef, Framework, OwnedPrimitive, PlaybookSection } from '../config';

/** Options for a preset factory. */
export interface PresetOptions {
  /** Project name (Handbook title / agent contract). */
  name?: string;
  /** Import alias. Defaults to `~app`. */
  alias?: string;
  /**
   * Emit overrides — e.g. declaring the agent tool in use
   * (`emit: { agents: ['claude'] }`), the first customization nearly every
   * adoption makes. Passed straight through to the generated blueprint.
   */
  emit?: EmitDef;
}

/** Which Next.js router directory the route tree lives in. */
export type NextRouter = 'app' | 'pages' | 'both';

/** Options for the Next.js preset. */
export interface NextPresetOptions extends PresetOptions {
  /** Route tree: App Router (`app/`), Pages Router (`pages/`), or both (migration). */
  router?: NextRouter;
  /** Layers live under `src/` (`create-next-app --src-dir`); otherwise the project root. */
  srcDir?: boolean;
}

/** Framework-specific primitive ownership. */
interface FrameworkOwns {
  hooks: OwnedPrimitive[];
  contexts: OwnedPrimitive[];
}

/** The ten governance beliefs — all behavioral (held in review / CLAUDE.md). */
function principles(): Blueprint['principles'] {
  return [
    { id: 'by-responsibility', say: 'Split by responsibility, not by size', why: 'The signal to split is how many things a unit does — line count is only a backstop.', land: 'claude' },
    { id: 'single-source-of-truth', say: 'One source of truth', why: 'Derive computed values; never store duplicate mutable state that can desync.', land: 'claude' },
    { id: 'narrow-interfaces', say: 'Keep interfaces narrow', why: 'Narrow inputs and outputs so illegal states cannot be expressed.', land: 'claude' },
    { id: 'knowledge-where-used', say: 'Keep knowledge where it is used', why: 'Push derivation to the child and state to its lowest common owner; do not hoist.', land: 'claude' },
    { id: 'respect-backend', say: 'Do not fake or paper over backend data', why: 'Preserve the backend shape, guard against drift, let missing data be empty or error — never a fake fallback.', land: 'claude' },
    { id: 'dead-code', say: 'Dead code: delete it or mark it', why: 'An abstraction with no consumer is dead; sweep orphans, mark retained-dead as deprecated.', land: 'claude' },
    { id: 'lint-is-triage', say: 'Lint is an entry point, not a verdict', why: 'Mechanical checks only triage; cohesion and invariants need review.', land: 'claude' },
    { id: 'ac-not-scripture', say: 'Acceptance criteria are a start, not scripture', why: 'Fixing a ticket that violates an abstraction\'s responsibility is upholding the design.', land: 'claude' },
    { id: 'yagni', say: 'YAGNI — do not over-engineer', why: '"Might need it later" is not a reason to abstract now.', land: 'claude' },
    { id: 'cost-is-a-dimension', say: 'Cost is the third dimension', why: 'Cost = work per event × event frequency; price any logic wired to a data source.', land: 'claude' },
  ];
}

/**
 * The seven orthogonal component-shape axes — framework-neutral design
 * judgments (the handbook's Part 2). A set, not a pipeline: each axis is
 * judged independently. Triage rules are entry points, never verdicts.
 */
function componentShape(): AxisDef[] {
  return [
    {
      id: 'ownership-inversion',
      name: 'Ownership Inversion',
      say: 'The unit that needs derived state owns the derivation.',
      why: 'Do not precompute in the parent and drill the result down — the child imports the hook and derives it itself. Field-tested: 17 props down to 7.',
    },
    {
      id: 'io-shrinkage',
      name: 'IO Shrinkage',
      say: 'Narrow the inputs, shrink the outputs.',
      why: 'Three moves: split a multi-concern unit; collapse parallel raw states carrying an invariant into one modeled state; merge symmetric twins into one object of the same shape. Count and size are weak signals — whether the state is modeled is the review call.',
      triage: 'max-params',
    },
    {
      id: 'srp-decomposition',
      name: 'SRP Decomposition',
      say: 'Split on responsibility boundaries, not on size.',
      why: 'Naming test: if you cannot name it without "and", it wants splitting; dissolving code into an existing home is also a split. Exception: writable state that must stay in sync — force-splitting it manufactures sync bugs.',
      triage: 'max-statements',
    },
    {
      id: 'orchestration-shell',
      name: 'Orchestration Shell',
      say: 'A page only orchestrates.',
      why: 'Route/id resolution, the loading shell, shared sources, cross-child lifecycle — never deriving values on behalf of each child. Field-tested: a 6666-line detail page down to 552.',
      triage: 'max-lines',
    },
    {
      id: 'scoped-writable-state',
      name: 'Scoped Writable State',
      say: 'Writable state lives at the lowest common owner of its writers and readers.',
      why: 'Hoist only what is genuinely shared across a boundary; state that must survive a route change goes to the URL or a store. "Might be shared later" is YAGNI — hoist when the sharing arrives.',
    },
    {
      id: 'lifecycle-internalization',
      name: 'Lifecycle Internalization',
      say: 'If lifecycle is part of the responsibility, build it in.',
      why: 'The caller receives a unit that is already running and cleans itself up — not a kit of handlers to wire into mount/effect hooks. Field-tested: 19 exports down to a one-line call.',
    },
    {
      id: 'pure-helpers',
      name: 'Pure Helpers ≠ Composables',
      say: 'Keep pure functions out of reactive/lifecycle units.',
      why: 'One exported function does not demand one file: responsibility splits at the function level; the file splits only when max-lines approaches. Expose the decision a unit makes, not its raw ingredients.',
    },
  ];
}

/**
 * The working playbook — the handbook's behavioral parts (data integrity,
 * runtime cost, refactor and collaboration discipline). No tool enforces
 * these; they live in the emitted handbook and agent contract.
 */
function playbook(): PlaybookSection[] {
  return [
    {
      title: 'Data integrity & backend boundary',
      rules: [
        { id: 'no-fake-fallback', say: 'Never fall back to fake data.', why: 'A `payload.field || fixture.field` fallback is a bug, not a safety net — it hides integrity problems. Production renders empty, error, or skeleton; never fabricated values.' },
        { id: 'drift-guard-framing', say: 'Frame kept defenses as drift guards.', why: 'A deliberately retained shape-defense is framed "guard against BE drift", never "support payload X missing field Y". Strip one only when drift is out of question and tests prove zero call sites.' },
        { id: 'no-fe-workaround', say: 'Do not volunteer FE workarounds for BE-owned problems.', why: 'When the fix belongs to the backend and that position is already public, offering a short-term FE hack hands the work straight back to the frontend.' },
        { id: 'preserve-locale-shape', say: 'Services preserve the backend locale shape.', why: 'Resolving `{ zh_cn, en }` to one string inside a service drops the other variant, pins the timing to call time, and mixes presentation into the service layer — resolve in the view.' },
      ],
    },
    {
      title: 'Runtime load discipline',
      rules: [
        { id: 'reprice-on-attach', say: 'Price every handler attached to a data source.', why: 'Before wiring anything to WS / polling / scroll / input, answer: events per second, data per event, per-event cost. If you cannot answer, it does not merge — and copying an existing pattern is no exemption, because frequency is not in the code.' },
        { id: 'identity-discipline', say: 'High-frequency updates write in place.', why: 'Patch the changed entry and keep container identity; whole-replace is for baseline rebuilds only. A prop whose identity changed while its value did not is the disease. Write shapes do not port across frameworks.' },
        { id: 'render-diagnosis', say: 'Diagnose re-renders in four steps, never by guessing.', why: 'Who renders (profiler) → what triggered it (render tracing) → who produced the identity (grep the assignment sites) → was it worth it (compare against the event payload).' },
        { id: 'measurable-perf', say: 'Performance claims must be acceptance-testable.', why: '"Fewer re-renders" is not a claim; "one event re-renders at most N components" is. Pin it with a render-count or identity-stability test — an unmeasured performance claim did not happen.' },
      ],
    },
    {
      title: 'Refactor discipline',
      rules: [
        { id: 'safety-net-first', say: 'Safety net first, then split, then tidy the tests.', why: 'Three stages, one commit each, non-overlapping review scopes. Writing the net first forces the observable contract into the open.' },
        { id: 'one-arc-one-pr', say: 'One refactor arc = one PR, one commit per phase.', why: 'The PR body maps each commit to its phase; ask before splitting the arc into separate tickets.' },
        { id: 'extract-from-source', say: 'Extract by copying from source, never by rewriting from memory.', why: 'After extraction, diff the target against git history — a passing suite alone does not prove the extraction faithful.' },
        { id: 'recursive-dep-scan', say: 'Scan every identifier before extracting.', why: 'Not just reactive refs — imports, local definitions, parameters. A missed dependency surfaces later as a broken extraction.' },
        { id: 'dont-pin-moving-contracts', say: 'Do not pin what the refactor itself will change.', why: 'A safety net asserting values the arc is about to change fails the moment the sibling refactor lands.' },
        { id: 'contract-test-payloads', say: 'AC-named payload fields deserve a contract test.', why: 'Asserting that the mocked service receives field X is not a tautology — a dropped field or an unbound handler breaks it while the source constant stays green.' },
        { id: 'summarize-with-themes', say: 'Wrap an arc with cross-cutting themes and verified numbers.', why: 'Name the forces (ownership inversion, IO shrinkage, SRP) and attach before/after numbers verified against git history.' },
      ],
    },
    {
      title: 'Design collaboration',
      rules: [
        { id: 'guard-not-deviate', say: 'Frame architectural corrections as guarding the design.', why: 'State the principle being protected, show how the literal ticket reading violates it, and present the choice as that principle\'s natural consequence.' },
        { id: 'respect-settled-design', say: 'Do not reopen settled designs.', why: 'When the shape has been specified, implement it as spec. Raise genuine concerns once, with reasons — not as a menu of alternatives.' },
        { id: 'bypass-is-no-excuse', say: '"The user can work around it" does not park a bug.', why: 'Judge by diff size, scope, and standalone impact; a normal-path bug that violates expectations deserves its ticket.' },
      ],
    },
  ];
}

/** Build a fresh, validated Blueprint. Every call returns an independent object. */
function preset(framework: Framework, owns: FrameworkOwns, options: PresetOptions): Blueprint {
  return defineBlueprint({
    name: options.name,
    framework,
    architecture: {
      alias: options.alias ?? '~app',
      layers: [
        {
          name: 'pages',
          does: 'Route layout — assembles containers; owns routing and SEO concerns.',
          mustNot: ['hold business logic', 'stack components directly'],
        },
        {
          name: 'containers',
          does: 'A feature: assembles components, owns local state, calls services, drives navigation.',
        },
        {
          name: 'components',
          does: 'Reusable, presentational UI.',
          mustNot: ['call services', 'touch the router', 'own app state'],
        },
        {
          name: 'hooks',
          does: 'Adapts server and shared state; the only layer that injects context or owns a store.',
          owns: owns.hooks,
        },
        {
          name: 'contexts',
          does: 'Defines and provides Context / Provider only.',
          owns: owns.contexts,
          allowedImporters: [
            { layer: 'containers', description: 'Provider only' },
            { layer: 'hooks', selfOnly: true, description: 'Context only' },
          ],
        },
        {
          name: 'services',
          does: 'Network primitives — the only layer that talks to the HTTP client or sockets.',
          owns: ['axios', { global: 'fetch' }, { global: 'WebSocket' }],
          allowedImporters: ['containers', 'hooks', 'contexts'],
        },
      ],
      module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
      naming: {
        component: 'PascalCase; the implementation file is named after the module',
        hook: 'useX — only when it genuinely uses reactivity',
        service: 'snake_case',
        context: 'XxxProvider / XxxContext',
      },
    },
    principles: principles(),
    componentShape: componentShape(),
    playbook: playbook(),
    rules: {
      maxLines: { tier: 'error', value: 400 },
      // SRP triage — entry points only, never verdicts (handbook axes #2/#3).
      maxLinesPerFunction: { tier: 'warn', value: 100 },
      maxParams: { tier: 'warn', value: 3 },
      maxStatements: { tier: 'warn', value: 15 },
      complexity: { tier: 'warn', value: 12 },
      unusedVars: 'error',
      fixtureImports: 'error',
      cycles: 'error',
      deadCode: 'error',
      usePrefix: 'error',
      testFilename: 'error',
      // warn — composing-only hooks are a known false positive (handbook caveat).
      usePrefixReactivity: 'warn',
      // Attached to .js files only; TS projects are unaffected by construction.
      typedefOnlyFile: 'warn',
      // Deep watch is a Vue cost trap; React has no equivalent call to gate.
      ...(framework === 'vue' ? { deepWatch: 'error' as const } : {}),
    },
    emit: options.emit,
  });
}

/**
 * Canonical Vue blueprint: provide/inject in their layers, Pinia owned by hooks.
 * @group Author
 * @example
 * // blueprint.config.mjs
 * import { vuePreset } from '@kekkai/blueprint';
 *
 * export default vuePreset({ name: 'my-app' });
 */
export function vuePreset(options: PresetOptions = {}): Blueprint {
  return preset(
    'vue',
    {
      hooks: [{ package: 'vue', imports: ['inject'] }, 'pinia'],
      contexts: [{ package: 'vue', imports: ['provide'] }],
    },
    options,
  );
}

/**
 * Canonical React blueprint: createContext/useContext in their layers, Zustand owned by hooks.
 * @group Author
 * @example
 * export default reactPreset({ name: 'my-app' });
 */
export function reactPreset(options: PresetOptions = {}): Blueprint {
  return preset(
    'react',
    {
      hooks: [{ package: 'react', imports: ['useContext'] }, 'zustand'],
      contexts: [{ package: 'react', imports: ['createContext'] }],
    },
    options,
  );
}

/**
 * Canonical Next.js blueprint. The route tree (`app/` and/or `pages/`) is the
 * top layer — flat module layout, since file-based routing owns its own file
 * names and nesting. No `fetch` ownership: server components fetch everywhere
 * by design, so restricting it to one layer would be a lie. `srcDir` picks the
 * source root (`src` vs the project root, where `app/` sits without --src-dir).
 * @group Author
 * @example
 * export default nextPreset({ router: 'app', srcDir: true });
 */
export function nextPreset(options: NextPresetOptions = {}): Blueprint {
  const router = options.router ?? 'app';
  const routeLayers = router === 'both' ? ['app', 'pages'] : [router];

  return defineBlueprint({
    name: options.name,
    framework: 'react',
    architecture: {
      alias: options.alias ?? '@',
      sourceRoot: options.srcDir ? 'src' : '.',
      layers: [
        ...routeLayers.map((name) => ({
          name,
          does: `Next.js route tree (${name}/): pages, layouts, route handlers, metadata.`,
          mustNot: ['hold reusable UI — extract it to components'],
        })),
        {
          name: 'components',
          does: 'Reusable UI, shared across routes.',
          mustNot: ['own route-level data fetching'],
        },
        {
          name: 'hooks',
          does: 'Client-side state adapters.',
          owns: [{ package: 'react', imports: ['useContext'] }],
        },
        {
          name: 'lib',
          does: 'Framework-free plumbing: data access, formatting, config.',
        },
      ],
      module: { layout: 'flat', entry: 'index', private: [] },
      naming: {
        hook: 'useX — only when it genuinely uses reactivity',
      },
    },
    principles: principles(),
    componentShape: componentShape(),
    playbook: playbook(),
    rules: {
      maxLines: { tier: 'error', value: 400 },
      maxLinesPerFunction: { tier: 'warn', value: 100 },
      maxParams: { tier: 'warn', value: 3 },
      maxStatements: { tier: 'warn', value: 15 },
      complexity: { tier: 'warn', value: 12 },
      unusedVars: 'error',
      cycles: 'error',
      usePrefix: 'error',
    },
    emit: options.emit,
  });
}
