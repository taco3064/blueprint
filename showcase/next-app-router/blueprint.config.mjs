// Next.js with the full layer set (route tree + containers / contexts).
import { defineBlueprint } from '@kekkai/blueprint';

export default defineBlueprint({
  name: 'postcard-next-app',
  framework: 'react',
  architecture: {
    alias: '~app',
    sourceRoot: 'src',
    layers: [
      { name: 'app', does: 'Next.js route tree (app/)', mustNot: ['hold reusable UI'] },
      { name: 'containers', does: 'Feature assembly' },
      { name: 'components', does: 'Reusable UI' },
      { name: 'hooks', does: 'Client state adapters' },
      { name: 'contexts', does: 'React context', owns: [{ package: 'react', imports: ['createContext'] }] },
      // A client-side data layer that owns axios. No 'fetch' ownership —
      // server components fetch everywhere by design.
      { name: 'services', does: 'HTTP data access', owns: ['axios'] },
    ],
    flow: 'one-way',
    module: { layout: 'flat', entry: 'index', private: [] },
  },
  rules: { cycles: 'error', unusedVars: 'error' },
});
