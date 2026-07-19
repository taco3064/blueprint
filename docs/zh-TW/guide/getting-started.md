# 快速上手

## Greenfield —— `blueprint init`

```bash
npx @kekkai/blueprint init
```

一個指令把整套 operating contract 鋪好：

- 每個宣告層的 `src/<layer>/` 資料夾
- `blueprint.config.mjs` —— 唯一的架構來源
- `eslint.config.mjs` —— 結構規則 + 第三方 core
- `docs/architecture-handbook.md` 與 agent 契約（`CLAUDE.md`、`AGENTS.md`）
- alias 接進 `tsconfig.json` / `jsconfig.json` 的 `compilerOptions.paths`
- `.github/workflows/blueprint-ci.yml` —— lint + inspect 當 gate

Framework 從 `package.json` **自動偵測**（`--framework vue|react` 只在曖昧時破平手）、既有的 eslint config **絕不覆蓋**（init 改印合併 snippet）、重跑 init 冪等。

## Brownfield —— `blueprint inspect`

```bash
npx @kekkai/blueprint inspect
```

唯讀。掃 `src/`、對照 blueprint、印出 Architecture Report 跟遷移步驟。有 error 級 finding 就 exit `1`。

Legacy 專案第一次跑一定滿江紅 —— **baseline ratchet** 就是為這個生的：

```bash
npx @kekkai/blueprint inspect --update-baseline   # 把今天的債鎖進 baseline
npx @kekkai/blueprint inspect --baseline          # CI：只擋「新增」的違規
```

從今天起不再變爛；債還掉之後 stale 的條目會被點名，ratchet 一路鎖緊。

## Blast radius —— `blueprint deps`

```bash
npx @kekkai/blueprint deps hooks/useCart   # 誰 import 它、它 import 誰
npx @kekkai/blueprint deps                 # 排行榜：所有 module 按 fan-in 排
```

## The Blueprint

```js
// blueprint.config.mjs
import { defineBlueprint } from '@kekkai/blueprint';

export default defineBlueprint({
  framework: 'vue',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: '可重用 UI', mustNot: ['call services'] },
      { name: 'hooks', does: '加工 server / shared state' },
      {
        name: 'services',
        does: '網路原件',
        owns: ['axios', { global: 'fetch' }],
        allowedImporters: ['hooks'],
      },
    ],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
  },
});
```

也可以直接用 canonical preset —— `vuePreset()` / `reactPreset()` 編碼了完整治理手冊：六層、十條信念、七軸、十八條 playbook。所有 export 見 [API Reference](/zh-TW/api/)。
