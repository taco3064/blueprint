import { runModuleToLayerTransformation } from './module-to-layer-transformation';
import { runLayerToModuleTransformation } from './transformation';
import type { LayerToModuleInput } from './transformation';
import type { RepositoryBlueprint } from '../project';
import { runRepositoryTopologyTransformation } from './repository-transformation';

export function runTopologyTransformation(
  input: LayerToModuleInput & { repositoryBlueprints: RepositoryBlueprint[] },
) {
  if (input.repositoryBlueprints.length > 1) {
    return runRepositoryTopologyTransformation({
      ...input,
      repositoryBlueprints: input.repositoryBlueprints,
    });
  }

  return input.topology.current === 'module-first'
    ? runModuleToLayerTransformation(input)
    : runLayerToModuleTransformation(input);
}
