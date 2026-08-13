/**
 * The Blueprint source — the single source of truth that every emitter
 * (Explain / Enforce / Collaborate) and every runtime (Bootstrap / Verify)
 * compiles from.
 */

/** Target framework. `auto` = detect from the project at bootstrap time. */
export type Framework = 'vue' | 'react' | 'auto';

/** Enforcement severity for a rule. Maps to the ✅ / ◐ landing tiers. */
export type Tier = 'error' | 'warn' | 'off';

/** Where a principle lands: a lint rule, or the project CLAUDE.md. */
export type Land = 'lint' | 'claude';

/** A package a layer owns, restricting where it may be imported. */
export interface OwnedPackage {
  /** Package / module specifier, e.g. `axios` or `react`. */
  package: string;
  /** Restrict to specific named imports, e.g. `['createContext']`. */
  imports?: string[];
  /** Treat `package` as a glob group instead of an exact path. */
  pattern?: boolean;
  /** File globs exempt from this restriction. */
  exempt?: string[];
}

/** A global a layer owns, restricting where it may be referenced. */
export interface OwnedGlobal {
  /** Global name, e.g. `fetch` or `WebSocket`. */
  global: string;
}

/**
 * A primitive a layer exclusively owns. A bare string is shorthand for a
 * whole package (`'axios'`). Every other layer is barred from it.
 */
export type OwnedPrimitive = string | OwnedPackage | OwnedGlobal;

/**
 * A layer permitted to import another, with optional constraints. A bare
 * string is shorthand for `{ layer }`.
 */
export interface AllowedImporter {
  /** The importing layer's name. Must be a layer declared earlier. */
  layer: string;
  /** The importer may depend on this layer but never re-export it onward. */
  selfOnly?: boolean;
  /** Human note, rendered as the edge label in the Explain diagram. */
  description?: string;
}

/**
 * One feature module at the root of the source tree — a domain, and what it is
 * allowed to reach. The counterpart of {@link LayerDef} one level up: modules
 * flow one way at the root, layers flow one way inside each module.
 */
export interface ModuleDef {
  /**
   * Folder name under the source root, e.g. `Fighter`. Unique among modules —
   * a layer of the same name is a different namespace and does not collide
   * (`src/components/engine/` is unambiguous).
   */
  name: string;
  /** One-line responsibility — what this module is for. */
  does: string;
  /**
   * Modules this one may import, each reachable through its entry alone. Omit
   * for none: a module is isolated until it names a dependency, which is the
   * opposite of the `layers` default and deliberately so — "Boss depends on
   * Combat" is a claim about this codebase, so it is written where the need is
   * rather than as a permission on the module being reached. Every name must be
   * a module declared AFTER this one, which keeps the graph one-way and acyclic
   * by construction rather than by a cycle check.
   */
  imports?: string[];
  /**
   * Opt out of the inner layer vocabulary — how a routing module is expressed,
   * whatever its router calls its folders. Never keyed on the module's name.
   *
   * This drops the inner layer flow, not governance: `imports`, the entry-only
   * ban, `owns`, metric gates and coverage all still reach inside the module.
   */
  layers?: false;
  /** Primitives (packages / globals) this module exclusively owns. */
  owns?: OwnedPrimitive[];
}

/** One layer in the architecture — its responsibility and its boundaries. */
export interface LayerDef {
  /** Folder / layer name, e.g. `components`. Unique within the blueprint. */
  name: string;
  /** One-line responsibility — what code in this layer is for. */
  does: string;
  /** Things code in this layer must not do (fed into docs + review rules). */
  mustNot?: string[];
  /** Primitives (packages / globals) this layer exclusively owns. */
  owns?: OwnedPrimitive[];
  /**
   * How a module in this layer is shaped: `folder` = one folder per module
   * with an entry file; `flat` = one file per module. Optional — omitting it
   * means `flat`.
   */
  layout?: 'folder' | 'flat';
  /**
   * The public entry filename for a folder module in this layer. Everything
   * else is private. Optional — omitting it means `index`.
   */
  entry?: string;
  /**
   * Restrict who may import this layer. Omit to keep the default — every
   * layer declared before it may import it. When set, only the listed layers
   * may, and each must be a layer declared earlier (which keeps the flow
   * one-way and acyclic by construction).
   */
  allowedImporters?: (string | AllowedImporter)[];
  /**
   * Per-layer ESLint rule overrides. The three managed rules
   * (`no-restricted-imports` / `-syntax` / `-globals`) may not be set here —
   * they are owned by the Enforce emitter.
   */
  lintOverrides?: Record<string, unknown>;
}

export interface ArchitectureDef {
  /**
   * Project import alias, e.g. `~app`. Every structural ban pattern is built
   * on it. Required — a wrong default would silently pass illegal imports.
   */
  alias: string;
  /** Extra roots beyond `alias` that also participate in import bans. */
  additionalAliases?: Record<string, string>;
  /**
   * The directory layers live under, relative to the project root. Defaults to
   * `src`. Use `.` for frameworks that keep layers at the project root
   * (e.g. a Next.js project without `srcDir`, where `app/` sits at the root).
   * Drives the scan base, the default layer-file globs, and the alias target.
   */
  sourceRoot?: string;
  /**
   * Ordered layers. Order defines the one-way flow: a layer may import only
   * layers declared after it. Per-layer `allowedImporters` narrows who may
   * import a given layer (see {@link LayerDef.allowedImporters}), and
   * `layout` / `entry` carry the module shape (see {@link LayerDef.layout}).
   */
  layers: LayerDef[];
  /**
   * Ordered feature modules at the root of the source tree, with `layers`
   * describing what sits inside each one. Order bounds what a module may name:
   * only modules declared after it (see {@link ModuleDef.imports}).
   *
   * Omit for the flat model, unchanged: `src/` is the single implicit module
   * and `layers` describes it.
   */
  modules?: ModuleDef[];
  /**
   * Layer → file glob(s), each carrying a `{layer}` placeholder. Defaults are
   * derived from `framework` when omitted.
   */
  layerFiles?: string | string[];
  /** File globs excluded from linting. */
  layerFilesIgnore?: string | string[];
  /**
   * Test-file glob(s). Structural rules and metric gates skip these
   * (per-entry, not globally — test-only rules still reach them). Defaults
   * to the `*.test.*` / `*.spec.*` patterns.
   */
  testFiles?: string | string[];
  /** Naming conventions, keyed by concept, e.g. `{ hook: 'useX + reactivity' }`. */
  naming?: Record<string, string>;
}

/** A rule setting: a bare tier, or a tier with options (e.g. a threshold value). */
export type RuleSetting
  = | Tier
    | ({ tier: Tier; value?: number } & Record<string, unknown>);

/**
 * One orthogonal component-shape axis — a design judgment, not a metric.
 * Axes form a set, not a pipeline: each is judged independently.
 */
export interface AxisDef {
  /** Stable id, e.g. `ownership-inversion`. Unique within the blueprint. */
  id: string;
  /** Axis title, e.g. `Ownership Inversion`. */
  name: string;
  /** The claim, one line. */
  say: string;
  /** How it plays out — the moves, the judge line, the exception. */
  why: string;
  /** Lint rule that serves as the review entry point (triage, never a verdict). */
  triage?: string;
}

/** One judgment rule of the working playbook — no tool enforces it. */
export interface PlaybookRule {
  /** Stable id, e.g. `reprice-on-attach`. Unique across the whole playbook. */
  id: string;
  /** The rule, one imperative line. */
  say: string;
  /** Why it holds / how to apply it. */
  why?: string;
}

/** A themed group of playbook rules, e.g. the runtime-load posture. */
export interface PlaybookSection {
  title: string;
  rules: PlaybookRule[];
}

/** A core belief — carries the "why", and where it is enforced / communicated. */
export interface PrincipleDef {
  /** Stable id, e.g. `by-responsibility`. Unique within the blueprint. */
  id: string;
  /** The claim, one line. */
  say: string;
  /** Why it holds — feeds the Handbook and CLAUDE.md prose. */
  why: string;
  /** Landing: `lint` (a rule backs it) or `claude` (behavioral, CLAUDE.md only). */
  land: Land;
}

/** A tool whose agent-context file the contract is distributed to. */
export type AgentTarget = 'claude' | 'agents' | 'gemini' | 'copilot' | 'cursor' | 'windsurf';

/** An agent-contract distribution entry. A bare string is shorthand for `{ target }`. */
export interface AgentEmitEntry {
  /** The tool to distribute the contract to. */
  target: AgentTarget;
  /** Override the target's default file path. */
  path?: string;
}

/** ESLint emit target. */
export interface LintEmitDef {
  /** Severity for the managed structural rules. Default `error`. */
  severity?: 'error' | 'warn';
}

/** Emit targets — which artifacts to generate, and where. */
export interface EmitDef {
  /** Handbook markdown output path. */
  handbook?: string;
  /**
   * Agent-contract distribution targets. Omit for the default
   * `['claude', 'agents']`; an empty array emits no agent file.
   */
  agents?: (AgentTarget | AgentEmitEntry)[];
  /** ESLint flat-config emit target (structure enforcement + custom rules). */
  lint?: LintEmitDef;
}

export interface Blueprint {
  /** Project name — used as the Handbook title and in the agent contract. */
  name?: string;
  /**
   * Target framework. Drives the default layer-file globs, framework-specific
   * rules (e.g. `deepWatch` is Vue-only), and preset selection. `auto` =
   * detect from the project at bootstrap time.
   */
  framework: Framework;
  /**
   * The load-bearing block: layers, flow, alias, module shape — everything
   * the structural lint rules and `inspect` findings compile from.
   */
  architecture: ArchitectureDef;
  /** Enforcement rules, keyed by rule id. Each carries its landing tier. */
  rules?: Record<string, RuleSetting>;
  /** Core beliefs — the "why" behind the rules. */
  principles?: PrincipleDef[];
  /** Component-shape axes — orthogonal design judgments for units of UI/state. */
  componentShape?: AxisDef[];
  /** The working playbook — behavioral judgment rules, grouped by theme. */
  playbook?: PlaybookSection[];
  /** What to emit and where. */
  emit?: EmitDef;
}
