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

/** How a single module (feature folder) is shaped. */
export interface ModuleDef {
  /** `folder` = one folder per module with an entry file; `flat` = single file. */
  layout: 'folder' | 'flat';
  /** The public entry filename, e.g. `index`. Everything else is private. */
  entry: string;
  /** Private sub-parts kept behind the entry, e.g. `['hooks', 'styles', 'types']`. */
  private: string[];
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
   * Ordered layers. Order defines the one-way flow: a layer may import only
   * layers declared after it. Per-layer `allowedImporters` narrows who may
   * import a given layer (see {@link LayerDef.allowedImporters}).
   */
  layers: LayerDef[];
  /** Dependency direction. Only `one-way` for now (upstream imports banned). */
  flow: 'one-way';
  /** Feature-folder shape shared across layers. */
  module: ModuleDef;
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
  /** Output path for the generated flat config. Used by Bootstrap (S5). */
  path?: string;
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
  /** CI provider to emit config for. */
  ci?: 'github' | 'none';
  /** ESLint flat-config emit target (structure enforcement + custom rules). */
  lint?: LintEmitDef;
}

export interface Blueprint {
  /** Project name — used as the Handbook title and in the agent contract. */
  name?: string;
  framework: Framework;
  architecture: ArchitectureDef;
  /** Enforcement rules, keyed by rule id. Each carries its landing tier. */
  rules?: Record<string, RuleSetting>;
  /** Core beliefs — the "why" behind the rules. */
  principles?: PrincipleDef[];
  /** Component-shape axes — orthogonal design judgments for units of UI/state. */
  componentShape?: AxisDef[];
  /** What to emit and where. */
  emit?: EmitDef;
}
