import fs from 'node:fs';
import path from 'node:path';

import { UPGRADE_PLAYBOOK_FILE } from '../lifecycle';
import type { PendingUpgrade, UpgradeCatalog, UpgradeOperation } from '../lifecycle';
import { renderUpgradePlaybook } from '../operational-contract';
import type { OperationalText, UpgradeRefusalFact } from '../operational-contract';

export type InstructionLookup = (id: string) => OperationalText | null;

function operationOf(catalog: UpgradeCatalog, id: string): UpgradeOperation {
  return catalog.operations.find((operation) => operation.id === id)!;
}

export function remainingOperations(pending: PendingUpgrade): string[] {
  return pending.operations
    .map((operation) => operation.id)
    .filter((id) => !pending.completed.includes(id));
}

function patternMatcher(pattern: string): RegExp {
  const escaped = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));

  return new RegExp(`^${escaped.join('[^/]*')}$`);
}

export function unfinishedFiles(
  root: string,
  operation: UpgradeOperation,
  applications: string[],
): string[] {
  const verification = operation.verification;

  if (verification.kind !== 'no-files') {
    return [];
  }

  const matcher = patternMatcher(verification.pattern);

  return applications.flatMap((key) => fs.readdirSync(path.join(root, key))
    .filter((name) => matcher.test(name))
    .map((name) => path.posix.join(key, name)));
}

export function completionRefusal(
  context: { root: string; catalog: UpgradeCatalog; pending: PendingUpgrade | null },
  id: string,
): UpgradeRefusalFact | null {
  const { pending } = context;

  if (pending === null) {
    return { kind: 'no-pending', id };
  }

  const remaining = remainingOperations(pending);
  const entry = pending.operations.find((operation) => operation.id === id);

  if (entry === undefined || !remaining.includes(id)) {
    return { kind: 'unknown-operation', id, pending: remaining };
  }

  const files = unfinishedFiles(context.root, operationOf(context.catalog, id), entry.applications);

  return files.length ? { kind: 'verification-failed', id, files } : null;
}

export function writePlaybook(
  root: string,
  context: { catalog: UpgradeCatalog; pending: PendingUpgrade; instruction: InstructionLookup },
): void {
  const { catalog, pending, instruction } = context;

  fs.writeFileSync(path.join(root, UPGRADE_PLAYBOOK_FILE), renderUpgradePlaybook({
    source: pending.from,
    target: pending.to,
    migrations: pending.migrations,
    operations: pending.operations.map((entry) => {
      const operation = operationOf(catalog, entry.id);

      return {
        ...entry,
        introducedIn: operation.introducedIn,
        completed: pending.completed.includes(entry.id),
        instruction: instruction(entry.id)!,
        verification: operation.verification,
      };
    }),
  }));
}

export function removePlaybook(root: string): void {
  fs.rmSync(path.join(root, UPGRADE_PLAYBOOK_FILE), { force: true });
}
