import { digest } from './provenance';
import type { PendingUpgrade } from './types';

export type PlannedUpgrade = Omit<PendingUpgrade, 'plan'>;

export function planIdentity(pending: PlannedUpgrade): string {
  return digest(JSON.stringify([
    pending.from,
    pending.to,
    pending.migrations,
    pending.operations.map((operation) => [
      operation.id,
      operation.applications,
      Object.keys(operation.evidence).sort().map((key) => [key, operation.evidence[key]]),
      operation.supersedes.map((entry) => [entry.id, entry.completed]),
    ]),
  ]));
}

export function withPlanIdentity(pending: PlannedUpgrade): PendingUpgrade {
  return { ...pending, plan: planIdentity(pending) };
}
