import type { ArchitectureDef, Framework, LayerDef, ModuleDef } from '../../config';
import { getModules } from '../../config';
import { resolveLayerFiles, resolveModuleRootFiles } from './patterns';
import type { FileScope } from './patterns';

/**
 * Which files each governed group of the emitted config covers.
 *
 * One resolver, flat or modular, because two would be a defect the tests cannot
 * see: the globs a ban is written on and the globs a future consumer measures
 * coverage against are the same claim about the same repo.
 */

/**
 * Which governed group a file belongs to — the module and layer whose rules it
 * carries.
 */
export interface NetScope {
  /** The feature module these files sit in, or null under the flat structure. */
  module: string | null;
  /**
   * The layer these files sit in, or null when the group belongs to no layer:
   * a module's own root files, or a module holding its files directly.
   */
  layer: string | null;
}

/** One governed file group — its scope, and the globs that reach it. */
export interface FileNet extends NetScope {
  files: string[];
}

/**
 * How one net is named to a reader: the bare layer name under the flat
 * structure, `module/layer` for a layer nested inside a module, and the bare
 * module name for a net that has no layer — a module's own root files, or a
 * `layers: false` module's single group.
 *
 * One function rather than one per consumer, because a reader crosses between
 * them: `doctor` names the net it lost a ban from, and its own failure message
 * sends them to `blueprint rules --json` for the exact text to restore. Two
 * spellings of one net's name is a bridge that reader has to build themselves.
 *
 * A no-layer net is deliberately named by the module alone, not decorated as
 * "root": the two shapes that reach it — a layered module's root files, and a
 * `layers: false` module's whole subtree — are not distinguishable from a
 * `NetScope`, and a label that claimed "root" would be wrong for the second.
 * Which of the two it is belongs to prose beside the table, where it can be
 * said precisely.
 */
export function netLabel(net: NetScope): string {
  if (net.module === null) {
    return net.layer as string;
  }

  return net.layer === null ? net.module : `${net.module}/${net.layer}`;
}

/** The facts a blueprint's nets are cut from, resolved once for the whole config. */
interface GlobScope extends FileScope {
  layers: LayerDef[];
  framework: Framework;
}

/**
 * Every file group the emitted config governs, in emitted order. Flat, that is
 * one group per layer and nothing has moved. Modular, it is one group per
 * module — its own root files, then each layer inside it — for a module that
 * keeps the shared layers, or one group standing for the whole module when it
 * holds its files directly (`layers: false`).
 */
export function resolveFileNets(architecture: ArchitectureDef, framework: Framework): FileNet[] {
  const { layers, layerFiles, sourceRoot } = architecture;
  const scope: GlobScope = { layers, framework, layerFiles, sourceRoot };
  const modules = getModules(architecture);

  if (!modules.length) {
    return layers.map((layer) => ({
      module: null,
      layer: layer.name,
      files: resolveLayerFiles(layer.name, framework, scope),
    }));
  }

  return modules.flatMap((module) => moduleNets(module, scope));
}

/** Every glob any net covers, deduplicated — the whole enforced surface. */
export function allNetFiles(architecture: ArchitectureDef, framework: Framework): string[] {
  return [...new Set(resolveFileNets(architecture, framework).flatMap((net) => net.files))];
}

/**
 * One module's groups. Its root files come first: the entry is the module's
 * face, and reading the emitted config top-down is how an adopter checks the
 * one path that must not fall outside every net.
 */
function moduleNets(module: ModuleDef, scope: GlobScope): FileNet[] {
  const { layers, framework } = scope;

  if (module.layers === false) {
    // No layer depth inside it, so the module IS the net — the same glob a
    // layer gets under the flat structure, with the module's name in the
    // placeholder.
    return [{
      module: module.name,
      layer: null,
      files: resolveLayerFiles(module.name, framework, scope),
    }];
  }

  return [
    {
      module: module.name,
      layer: null,
      files: resolveModuleRootFiles(module.name, framework, scope),
    },
    ...layers.map((layer) => ({
      module: module.name,
      layer: layer.name,
      files: resolveLayerFiles(`${module.name}/${layer.name}`, framework, scope),
    })),
  ];
}
