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

/** One layer in the architecture — its responsibility and its boundaries. */
export interface LayerDef {
  /** Folder / layer name, e.g. `components`. Unique within the blueprint. */
  name: string;
  /** One-line responsibility — what code in this layer is for. */
  does: string;
  /** Things code in this layer must not do (fed into docs + review rules). */
  mustNot?: string[];
  /** Primitives / globals this layer exclusively owns, e.g. `axios`, `fetch`. */
  owns?: string[];
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
  /** Ordered layers. Order defines the one-way flow (first → last). */
  layers: LayerDef[];
  /** Dependency direction. Only `one-way` for now (upstream imports banned). */
  flow: 'one-way';
  /**
   * Extra allowed edges beyond the linear chain, e.g. `'containers⇢contexts'`.
   * Both endpoints must be declared layers. Accepts `⇢`, `→`, or `->`.
   */
  extraEdges?: string[];
  /** Feature-folder shape shared across layers. */
  module: ModuleDef;
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

/** Emit targets — which artifacts to generate, and where. */
export interface EmitDef {
  /** Handbook markdown output path. */
  handbook?: string;
  /** Project CLAUDE.md / agent-contract output path. */
  claudeMd?: string;
  /** CI provider to emit config for. */
  ci?: 'github' | 'none';
  /** ESLint flat-config output path (structure enforcement + custom rules). */
  lint?: string;
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
