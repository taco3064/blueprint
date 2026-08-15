import { moduleDepth } from '../config';
import type { ArchitectureDef, ModuleDef } from '../config';

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
 * Which emitted entry governs one file: a module's own — {@link ModuleZone} —
 * or a LAYER's. `ModuleZone` stays the module-level union rather than being
 * widened, because `zoneWord` and doctor's probes answer for a module's entry
 * and have no layer arm to answer with.
 */
export type FileZone = ModuleZone | 'layer';

/**
 * The emitted entry governing one file, or null when none does — the WHOLE
 * answer, so no caller finishes it by reading a layer name for itself.
 *
 * `resolveGovernedFiles` written as a predicate. The module zone's entry is
 * `src/<M>` followed by a recursive glob and reaches every file in the module;
 * the root zone's is `src/<M>/*` and reaches one depth; a layer's is
 * `src/<M>/<layer>/` recursive, expanded over DECLARED modules only — which is
 * the half a depth test written at the reader keeps leaving out, twice over. A
 * file directly under an undeclared top folder sits at root depth, and one at
 * layer depth below it carries a declared layer's NAME; no emitted entry
 * reaches either at any depth, and a `null` that meant "ask the layer name" let
 * the second one back in.
 *
 * `depth` is derived here rather than passed, so the module list and the offset
 * into the path come out of one architecture and cannot disagree.
 */
export function fileZone(segments: string[], architecture: ArchitectureDef): FileZone | null {
  const { layers, modules } = architecture;
  const depth = moduleDepth(architecture);

  if (modules !== undefined) {
    const module = modules.find((entry) => entry.name === segments[0]);

    // A top folder `modules` does not carry: no module entry is emitted for it,
    // and no layer glob is expanded for a name the declared list has not got.
    if (module === undefined) return null;

    const zone = moduleZone(module);

    if (zone === 'module' || segments.length === depth + 1) return zone;
  }

  // Flat arrives here with `depth` at 0, where the layer IS the top folder —
  // the one level a flat project emits entries for, and the reason this test is
  // not inside the modular arm above.
  return layers.some((layer) => layer.name === segments[depth]) ? 'layer' : null;
}

// A total map, not a ternary per consumer: a zone added to the union arrives
// here as a missing key — a compile error — rather than in an else arm that
// each consumer spells its own way.
const ZONE_WORD: Record<ModuleZone, string> = { root: 'root', module: 'all' };

/** How a zone names itself in an entry address — `Fighter/(root)`, `app/(all)`. */
export function zoneWord(zone: ModuleZone): string {
  return ZONE_WORD[zone];
}
