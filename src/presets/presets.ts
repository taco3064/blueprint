import { defineBlueprint } from '../config';
import type { AxisDef, Blueprint, Framework, OwnedPrimitive } from '../config';

/** Options for a preset factory. */
export interface PresetOptions {
  /** Project name (Handbook title / agent contract). */
  name?: string;
  /** Import alias. Defaults to `~app`. */
  alias?: string;
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
      flow: 'one-way',
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
  });
}

/** Canonical Vue blueprint: provide/inject in their layers, Pinia owned by hooks. */
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

/** Canonical React blueprint: createContext/useContext in their layers, Zustand owned by hooks. */
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
