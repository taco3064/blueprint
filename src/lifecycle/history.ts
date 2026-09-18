import type { LifecycleState, UpgradeCatalog } from './types';
import { compareVersions } from './version';

function introducedBy(
  entries: readonly { id: string; introducedIn: string }[],
  id: string,
): string | null {
  return entries.find((entry) => entry.id === id)?.introducedIn ?? null;
}

function within(version: string | null, from: string, to: string): boolean {
  return version !== null
    && compareVersions(from, version) < 0
    && compareVersions(version, to) <= 0;
}

function operationsPossible(state: LifecycleState, catalog: UpgradeCatalog): boolean {
  return state.operations.every((id) => {
    const introduced = introducedBy(catalog.operations, id);

    return introduced !== null
      && state.blueprint !== null
      && compareVersions(introduced, state.blueprint) <= 0;
  });
}

function pendingPossible(state: LifecycleState, catalog: UpgradeCatalog): boolean {
  const { pending } = state;

  if (pending === null) {
    return true;
  }

  const { from, to } = pending;
  const ids = pending.operations.map((operation) => operation.id);

  return pending.from === state.blueprint
    && compareVersions(from, to) <= 0
    && ids.every((id) => within(introducedBy(catalog.operations, id), from, to))
    && pending.migrations.every((id) => within(introducedBy(catalog.migrations, id), from, to))
    && pending.completed.every((id) => ids.includes(id));
}

export function lifecycleHistoryProblem(
  state: LifecycleState,
  catalog: UpgradeCatalog,
): 'operations' | 'pending' | null {
  if (!operationsPossible(state, catalog)) {
    return 'operations';
  }

  return pendingPossible(state, catalog) ? null : 'pending';
}
