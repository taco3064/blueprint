export type UpgradeApplicability
  = | { kind: 'always' }
    | { kind: 'legacy-config-shape' }
    | { kind: 'legacy-config-key'; key: string }
    | { kind: 'source-below'; version: string };

export type UpgradeVerification
  = | { kind: 'confirm' }
    | { kind: 'no-files'; pattern: string };

export interface UpgradeOperation {
  id: string;
  introducedIn: string;
  requires: readonly string[];
  cancels: readonly string[];
  supersedes: readonly string[];
  applicability: UpgradeApplicability;
  verification: UpgradeVerification;
}

export interface DeterministicMigration {
  id: string;
  introducedIn: string;
  supportsFrom: string;
  applicability: UpgradeApplicability;
}

export interface RetiredOperation {
  id: string;
  introducedIn: string;
}

export interface UpgradeCatalog {
  supportedFrom: string;
  legacyConfigCheckpoint: string;
  migrations: readonly DeterministicMigration[];
  operations: readonly UpgradeOperation[];
  retired: readonly RetiredOperation[];
}

export interface ApplicationFacts {
  root: string;
  legacyShape: boolean;
  legacyKeys: Record<string, string[]>;
}

export type ProvenanceRecord
  = | { kind: 'generated'; path: string }
    | { kind: 'created'; path: string; sha256: string }
    | { kind: 'section'; path: string; created: boolean }
    | { kind: 'edit'; path: string; before: string; after: string }
    | { kind: 'script'; path: string; name: string; before: string | null; after: string }
    | { kind: 'directory'; path: string }
    | { kind: 'dependency'; name: string };

export interface SupersededHistory {
  id: string;
  completed: boolean;
}

export interface PendingOperation {
  id: string;
  applications: string[];
  evidence: Record<string, string[]>;
  supersedes: SupersededHistory[];
}

export interface PendingUpgrade {
  from: string;
  to: string;
  migrations: string[];
  operations: PendingOperation[];
  plan: string;
  completed: string[];
}

export interface ApplicationLifecycle {
  provenance: ProvenanceRecord[];
}

export interface LifecycleState {
  schema: 1;
  blueprint: string | null;
  provenance: 'complete' | 'partial';
  operations: string[];
  pending: PendingUpgrade | null;
  applications: Record<string, ApplicationLifecycle>;
}
