import { defineBlueprint } from '../config';
import type { Blueprint, Framework, OwnedPrimitive } from '../config';

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
    rules: {
      maxLines: { tier: 'error', value: 400 },
      cycles: 'error',
      deadCode: 'error',
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
