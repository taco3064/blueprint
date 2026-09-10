import { runModuleToLayerTransformation } from './module-to-layer-transformation';
import { runLayerToModuleTransformation } from './transformation';
import type { LayerToModuleInput } from './transformation';

export function runTopologyTransformation(input: LayerToModuleInput) {
  return input.topology.current === 'module-first'
    ? runModuleToLayerTransformation(input)
    : runLayerToModuleTransformation(input);
}
