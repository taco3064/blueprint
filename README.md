# @kekkai/blueprint

> Blueprint turns frontend architecture into something that can be understood
> by developers, enforced by tooling, and executed by coding agents.

## Install

```bash
npm install @kekkai/blueprint
# or
pnpm add @kekkai/blueprint
```

## Usage

```bash
npx blueprint init      # greenfield: scaffold layers, lint, docs, agent contracts, CI
npx blueprint inspect   # brownfield: architecture report + migration steps
```

```js
// eslint.config.mjs — one blueprint drives lint, docs, and agent contracts
import { emitLint } from '@kekkai/blueprint';
import blueprint from './blueprint.config.mjs';

export default [...emitLint(blueprint)];
```

## License

[MIT](./LICENSE) © taco3064
