import type { PackageManager } from '../project';

export type RemovalReason
  = | 'config'
    | 'lifecycle-state'
    | 'baseline'
    | 'workflow'
    | 'reference'
    | 'backup'
    | 'generated'
    | 'created'
    | 'section'
    | 'edit'
    | 'script'
    | 'gitignore'
    | 'directory';

export type RemovalAction
  = | { kind: 'delete'; path: string; reason: RemovalReason }
    | { kind: 'write'; path: string; content: string; reason: RemovalReason }
    | { kind: 'rmdir'; path: string; reason: RemovalReason }
    | { kind: 'ref'; ref: string; application: string };

export type RemovalConflict
  = | { kind: 'malformed-section'; path: string }
    | { kind: 'ambiguous-edit'; path: string; occurrences: number }
    | {
      kind: 'diverged-script';
      path: string;
      name: string;
      expected: string;
      current: string | null;
    }
    | { kind: 'unreadable-manifest'; path: string }
    | { kind: 'irreversible-edit'; path: string }
    | {
      kind: 'reference';
      path: string;
      detail: 'import' | 'config-path' | 'script';
      name?: string;
      rules?: EmittedRuleInventory;
    };

export interface EmittedRuleInventory {
  total: number;
  exclusive: number;
}

export type RemovalResidue
  = | { kind: 'required-by-source'; path: string; alias: string }
    | { kind: 'modified'; path: string }
    | { kind: 'emptied'; path: string }
    | { kind: 'directory-in-use'; path: string }
    | { kind: 'unrecorded'; path: string; detail: 'alias' | 'lint-script' }
    | { kind: 'unrecorded-folder'; path: string }
    | {
      kind: 'dependency-kept';
      name: string;
      manifest: string;
      reason: 'referenced' | 'shared' | 'unrecorded';
    };

export interface UninstallStep {
  manifest: string;
  root: string;
  packageManager: PackageManager;
  names: string[];
  command: string;
}

export type FileAction = Exclude<RemovalAction, { kind: 'ref' }>;

export type FileResidue = Exclude<RemovalResidue, { kind: 'dependency-kept' }>;

export interface ApplicationRemoval {
  actions: FileAction[];
  conflicts: RemovalConflict[];
  residues: FileResidue[];
}
