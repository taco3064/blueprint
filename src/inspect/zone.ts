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

/**
 * The module entry governing one file, or null when a LAYER entry governs it —
 * or when nothing does.
 *
 * `resolveModuleFiles` written as a predicate: the module zone's entry is
 * `src/<M>/**` and reaches every file in the module, the root zone's is
 * `src/<M>/*` and reaches one depth. Both halves are asked here, and the module
 * lookup is the half a depth test written at the reader keeps leaving out — a
 * file directly under an UNDECLARED top folder sits at root depth too, and no
 * emitted entry reaches it at any depth.
 *
 * Null on a flat project by the same lookup: there are no modules, so no name
 * matches and no depth is consulted.
 */
export function fileZone(
  segments: string[],
  modules: ModuleDef[],
  depth: number,
): ModuleZone | null {
  const module = modules.find((entry) => entry.name === segments[0]);

  if (module === undefined) return null;

  const zone = moduleZone(module);

  return zone === 'module' || segments.length === depth + 1 ? zone : null;
}

// A total map, not a ternary per consumer: a zone added to the union arrives
// here as a missing key — a compile error — rather than in an else arm that
// each consumer spells its own way.
const ZONE_WORD: Record<ModuleZone, string> = { root: 'root', module: 'all' };

/** How a zone names itself in an entry address — `Fighter/(root)`, `app/(all)`. */
export function zoneWord(zone: ModuleZone): string {
  return ZONE_WORD[zone];
}
