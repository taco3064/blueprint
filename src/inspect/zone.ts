import type { ModuleDef } from '../config';

/**
 * Which emitted entry a module's own files answer to — one home, because two
 * outputs address the same entry: `rules` prints the row an adopter folds their
 * config from, and doctor names the loss beside it. Derived once per consumer,
 * the two can address one entry differently and neither is wrong on its own,
 * with nothing that fails to compile.
 */

/**
 * The entry a module's own files sit under: `root` for a layered module's
 * composition files, `module` for the whole net of a `layers: false` one.
 */
export type ModuleZone = 'root' | 'module';

/**
 * The zone `module`'s own entry governs — the only reading of the layer opt-out
 * that decides one. `LayerBans` and `Probe` each narrow to the zones they can
 * answer for, so a member added to {@link ModuleZone} has to be answered in
 * both rather than inherited.
 */
export function moduleZone(module: ModuleDef): ModuleZone {
  return module.layers === false ? 'module' : 'root';
}

// A total map, not a ternary per consumer: a zone added to the union arrives
// here as a missing key — a compile error — rather than in an else arm that
// each consumer spells its own way.
const ZONE_WORD: Record<ModuleZone, string> = { root: 'root', module: 'all' };

/** How a zone names itself in an entry address — `Fighter/(root)`, `app/(all)`. */
export function zoneWord(zone: ModuleZone): string {
  return ZONE_WORD[zone];
}
