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

/**
 * An extra allowed edge beyond the linear chain. `edge` is `'from⇢to'`
 * (accepts `⇢`, `→`, or `->`). Both endpoints must be declared layers.
 */
export interface ExtraEdge {
  edge: string;
  /** The target may be depended on but never re-exported by the source. */
  selfOnly?: boolean;
  /** Human note, rendered in the Explain dependency diagram (S2). */
  description?: string;
}

export interface ArchitectureDef {
  /**
   * Project import alias, e.g. `~app`. Every structural ban pattern is built
   * on it. Required — a wrong default would silently pass illegal imports.
   */
  alias: string;
  /** Extra roots beyond `alias` that also participate in import bans. */
  additionalAliases?: Record<string, string>;
  /** Ordered layers. Order defines the one-way flow (first → last). */
  layers: LayerDef[];
  /** Dependency direction. Only `one-way` for now (upstream imports banned). */
  flow: 'one-way';
  /** Extra allowed edges beyond the linear chain (strings or objects). */
  extraEdges?: (string | ExtraEdge)[];
  /** Feature-folder shape shared across layers. */
  module: ModuleDef;
  /**
   * Layer → file glob(s), each carrying a `{layer}` placeholder. Defaults are
   * derived from `framework` when omitted.
   */
  layerFiles?: string | string[];
  /** File globs excluded from linting. */
  layerFilesIgnore?: string | string[];
  /** Naming conventions, keyed by concept, e.g. `{ hook: 'useX + reactivity' }`. */
  naming?: Record<string, string>;
}

/** A rule setting: a bare tier, or a tier with options (e.g. a threshold value). */
export type RuleSetting =
  | Tier
  | ({ tier: Tier; value?: number } & Record<string, unknown>);

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
  /** Project CLAUDE.md / agent-contract output path. */
  claudeMd?: string;
  /** CI provider to emit config for. */
  ci?: 'github' | 'none';
  /** ESLint flat-config emit target (structure enforcement + custom rules). */
  lint?: LintEmitDef;
}

export interface Blueprint {
  framework: Framework;
  architecture: ArchitectureDef;
  /** Enforcement rules, keyed by rule id. Each carries its landing tier. */
  rules?: Record<string, RuleSetting>;
  /** Core beliefs — the "why" behind the rules. */
  principles?: PrincipleDef[];
  /** What to emit and where. */
  emit?: EmitDef;
}
