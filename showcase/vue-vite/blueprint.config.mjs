// A Vue project in the idiomatic vocabulary: views + composables.
import { defineBlueprint } from '@kekkai/blueprint';

export default defineBlueprint({
  name: 'postcard-vue',
  framework: 'vue',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'views', does: 'Route-level pages' },
      { name: 'containers', does: 'Feature assembly + business logic' },
      { name: 'components', does: 'Reusable presentational UI' },
      { name: 'composables', does: 'State adapters', owns: [{ package: 'vue', imports: ['inject'] }] },
      {
        name: 'contexts',
        does: 'provide / inject definitions',
        owns: [{ package: 'vue', imports: ['provide', 'inject'] }],
        allowedImporters: [
          { layer: 'containers', description: 'Provide only' },
          { layer: 'composables', selfOnly: true, description: 'Inject only' },
        ],
      },
      { name: 'services', does: 'Network primitives', owns: ['axios'], allowedImporters: ['containers', 'composables', 'contexts'] },
    ],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: [] },
  },
  rules: { cycles: 'error', unusedVars: 'error', usePrefix: { tier: 'error', layer: 'composables' } },
});
