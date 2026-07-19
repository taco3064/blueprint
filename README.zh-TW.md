[![codecov](https://codecov.io/gh/taco3064/blueprint/branch/main/graph/badge.svg)](https://codecov.io/gh/taco3064/blueprint)

[English](https://github.com/taco3064/blueprint/blob/main/README.md) | **繁體中文**

# 📦 @kekkai/blueprint

**Architecture as Code** —— Blueprint 把前端架構變成「開發者讀得懂、工具擋得住、coding agent 執行得了」的東西。

## 🔍 What Problem Does This Solve?

多數專案的架構活在三個互不同步的地方：

- 一份沒人更新的文件
- 一份只擋得住一小部分規則的 lint config
- 每次開 coding-agent session 都要重貼一次的指示

三者各自漂移，每個 agent session 都在重新談判一次架構。

`@kekkai/blueprint` 把架構當成**編譯器問題**：一份 Blueprint config 是唯一來源，其他全是編譯目標 ——

| 目標 | Emitter | 產出 |
|---|---|---|
| Enforce | `emitLint` | ESLint flat config + 內嵌 plugin |
| Explain | `emitHandbook` | 給人讀的手冊（markdown + mermaid） |
| Collaborate | `emitAgentFiles` | 分發到各工具檔的 agent 契約 |
| Gate | `emitCi` | GitHub Actions workflow |

> ⚠️ **需要 ESLint v9+**
>
> 產出的 config 只支援 **Flat Config**。還在用舊式 `.eslintrc` 的專案請先遷移。

## ✨ Core Ideas

1. **一份來源、多個目標**
   - 分層、模組形狀、套件歸屬、principles、元件形狀七軸、working playbook，全部只在 `blueprint.config.mjs` 宣告一次
   - 文件、lint、agent 契約、CI 都是編譯出來的 —— 想漂移也漂移不了

2. **建構上就無環（acyclic by construction）**
   - Layers 是有序的，順序本身就是單向依賴流
   - 想限制「誰能 import 我」就宣告 `allowedImporters`，而且只能填**宣告在前面**的層 —— 環根本寫不出來，所以連 cycle detection 都不需要

3. **判斷歸判斷**
   - 機器查得了的，變成 lint gate（`error`）或 triage 進場點（`warn`）
   - 只有 review 判得了的（元件形狀、BE 邊界、重構紀律），編譯進手冊跟 agent 契約 —— **lint 全綠不等於架構合格**

## 📥 Installation

```bash
npm install -D @kekkai/blueprint eslint
```

或直接讓 `blueprint init` 幫你裝完（含 `eslint-plugin-import`、
`@eslint-community/eslint-plugin-eslint-comments`、`knip`）。

## 🚀 Quick Start

### Greenfield —— `blueprint init`

```bash
npx @kekkai/blueprint init            # 或 --framework vue|react、--dry-run、--no-install
```

一個指令把整套 operating contract 鋪好：

- 每個宣告層的 `src/<layer>/` 資料夾
- `blueprint.config.mjs`（從 vue/react preset 生成；已存在就直接讀）
- `eslint.config.mjs` —— blueprint 驅動的規則 + 第三方 core（`import/no-cycle`、eslint-comments 紀律）
- `docs/architecture-handbook.md` 與 agent 契約（`CLAUDE.md`、`AGENTS.md`…）
- alias 接進 `tsconfig.json` / `jsconfig.json` 的 `compilerOptions.paths` —— **只在能無損寫回時才動使用者檔案**，不行就給貼了能用的 snippet
- `.github/workflows/blueprint-ci.yml` —— lint + inspect 當架構 gate

### Brownfield —— `blueprint inspect`

```bash
npx @kekkai/blueprint inspect         # 或 --json
```

唯讀。掃 `src/`、對照 blueprint、印出 **Architecture Report** 跟遷移步驟：未宣告的資料夾、依賴流違規、deep import、套件歸屬、相對路徑跳脫、缺 module entry、selfOnly 再輸出、import cycle。有 error 級 finding 就 exit `1`，可以直接掛進 CI。

## 🧩 The Blueprint

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
        allowedImporters: ['hooks'], // 只有 hooks 能 import services
      },
    ],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
  },
  rules: {
    maxLines: { tier: 'error', value: 400 },
    deepWatch: 'error',
    usePrefix: 'error',
  },
});
```

也可以直接用 canonical preset —— `vuePreset()` / `reactPreset()` 編碼了一整套治理手冊：六層（`pages → containers → components → hooks → contexts → services`，**沒有 `utils`**）、十條核心信念、元件形狀七軸、十八條 working playbook。

### The `rules` record

已知 id 編譯成真 gate，未知 id 留在文件層：

| id | 落點 |
|---|---|
| `maxLines` / `maxLinesPerFunction` / `maxParams` / `maxStatements` / `complexity` | ESLint 內建 metric rules |
| `unusedVars` | `no-unused-vars` |
| `fixtureImports` | 禁止 production code import fixtures |
| `deepWatch` | `blueprint/no-deep-watch`（Vue） |
| `usePrefix` / `usePrefixReactivity` | hook 命名，雙向各一條 |
| `testFilename` | `blueprint/test-filename-matches-source` |
| `typedefOnlyFile` | `blueprint/no-typedef-only-file`（JS + JSDoc） |
| `cycles` | 生成 config 的 `import/no-cycle` + `inspect` |
| `deadCode` | `knip` + `inspect`（刻意不是 ESLint rule） |

內嵌 plugin 直接跟著產出的 config 一起下水 —— 不用另外裝任何東西。

## 🤝 Agent Contracts

同一份契約、一次編譯，分發到團隊在用的每個工具：

| Target | 檔案 | 策略 |
|---|---|---|
| `claude` | `CLAUDE.md` | merge（marker 區塊，手寫內容保留） |
| `agents` | `AGENTS.md` | merge |
| `gemini` | `GEMINI.md` | merge |
| `copilot` | `.github/copilot-instructions.md` | merge |
| `cursor` | `.cursor/rules/blueprint.mdc` | owned（frontmatter、整檔覆寫） |
| `windsurf` | `.windsurf/rules/blueprint.md` | owned |

預設 `['claude', 'agents']`；用 `emit.agents` 調整。

## 📚 API

以下全部從 package 根匯出。所有 emitter 都是**純函式、決定論** —— 同一份 blueprint 永遠吐同一份輸出。

### `defineBlueprint(config): Blueprint`

先驗證引用完整性 —— 層名重複、importer 沒宣告在前面、覆寫 managed lint rule、未知 agent target、axis / playbook id 重複 —— 驗過原封不動回傳。`validateBlueprint(config)` 是同一套檢查的獨立版。

#### `Blueprint`

| Field | Type | 說明 |
|---|---|---|
| `name?` | `string` | 手冊標題 / agent 契約的 context |
| `framework` | `'vue' \| 'react' \| 'auto'` | `auto` = bootstrap 時偵測 |
| `architecture` | `ArchitectureDef` | 見下表 |
| `rules?` | `Record<string, RuleSetting>` | `'error' \| 'warn' \| 'off'` 或 `{ tier, value?, …options }`；已知 id 見上方對照表 |
| `principles?` | `PrincipleDef[]` | `{ id, say, why, land: 'lint' \| 'claude' }` |
| `componentShape?` | `AxisDef[]` | `{ id, name, say, why, triage? }` |
| `playbook?` | `PlaybookSection[]` | `{ title, rules: { id, say, why? }[] }` |
| `emit?` | `EmitDef` | 輸出路徑與目標，見下表 |

#### `architecture`

| Field | Type | 說明 |
|---|---|---|
| `alias` | `string` | 專案 import alias（如 `~app`）—— 必填 |
| `additionalAliases?` | `Record<string, string>` | 額外 alias → 目錄 |
| `layers` | `LayerDef[]` | **有序** —— 順序本身就是單向依賴流 |
| `flow` | `'one-way'` | |
| `module` | `{ layout: 'folder' \| 'flat', entry, private }` | feature-folder 形狀 |
| `layerFiles?` | `string \| string[]` | lint glob，帶 `{layer}` placeholder |
| `layerFilesIgnore?` | `string \| string[]` | 全域忽略的 glob |
| `testFiles?` | `string \| string[]` | 預設 `*.test.* / *.spec.*` —— 結構規則跟 metric gate 不咬測試檔（per-entry 排除，所以 test 專屬 rule 還碰得到） |
| `naming?` | `Record<string, string>` | 概念 → 命名慣例，render 進文件 |

#### `LayerDef`

| Field | 說明 |
|---|---|
| `name` / `does` | 資料夾名 / 一句話職責 |
| `mustNot?` | render 進手冊與 agent 契約 |
| `owns?` | `'axios'` 簡寫、`{ package, imports?, pattern?, exempt? }`、或 `{ global: 'fetch' }` —— 獨佔歸屬，其他層一律禁用 |
| `allowedImporters?` | `('name' \| { layer, selfOnly?, description? })[]` —— 只能填**宣告在前面**的層；`selfOnly` = 可依賴、不可再輸出 |
| `lintOverrides?` | 該層的 ESLint 覆寫（managed rules 會被擋） |

#### `emit`

| Field | 說明 |
|---|---|
| `handbook?` | 手冊輸出路徑（預設 `docs/architecture-handbook.md`） |
| `agents?` | `(target \| { target, path? })[]` —— 預設 `['claude', 'agents']`，`[]` = 不吐 |
| `ci?` | `'github' \| 'none'` |
| `lint?` | `{ severity?: 'error' \| 'warn' }`，管 structural rules 的等級 |

### Emitters

| Function | 回傳 |
|---|---|
| `emitLint(blueprint)` | `LintConfigEntry[]` —— spread 進 `eslint.config.js`；內嵌 plugin 跟著 `plugins` 一起帶出 |
| `emitHandbook(blueprint)` | 手冊 markdown `string` |
| `emitAgentContract(blueprint)` | agent 契約 `string`（`##` 標題，可嵌進現有 CLAUDE.md） |
| `emitAgentFiles(blueprint)` | `AgentFile[]` —— `{ target, path, strategy: 'merge' \| 'own', content }` |
| `emitCi(blueprint, { packageManager? })` | GitHub Actions workflow `string`（認 `npm`/`pnpm`/`yarn`） |

### `runInspect(root, options?): Promise<{ findings, ok }>`

程式化的 `blueprint inspect`。`options`：`{ framework?, json?, log?, loadConfig? }`。每個 `Finding` 是 `{ severity: 'error' | 'warn' | 'info', rule, path, message }`；有任何 error 級 finding 時 `ok` 為 `false`。

### `vuePreset(options?)` / `reactPreset(options?)`

`{ name?, alias? }` → 一份全新、已驗證、承載完整治理手冊的 Blueprint。每次呼叫都是獨立物件 —— 改了不影響下一份。

### `plugin`

內嵌的 ESLint plugin，也能單獨掛（`plugins: { blueprint: plugin }`）：

| Rule | 檢查什麼 |
|---|---|
| `blueprint/no-deep-watch` | `watch(src, cb, { deep: true })` —— deep watch 每次變動都掃整個 source |
| `blueprint/use-prefix` | hooks 層的 function 形狀 export 必須 `use` 開頭 |
| `blueprint/use-prefix-needs-reactivity` | 叫 `useX` 的檔案必須真的呼叫 reactive / lifecycle API |
| `blueprint/test-filename-matches-source` | 測試檔必須有同名 co-located source |
| `blueprint/no-typedef-only-file` | 禁止只有 `@typedef` 的檔（JS + JSDoc 專案） |

### `injectBetweenMarkers(source, tag, content)`

把 `source` 裡 `<!-- TAG:START -->` 與 `<!-- TAG:END -->` 之間的內容換掉；marker 缺少或順序錯就 throw。init 就是用它在現有 CLAUDE.md / AGENTS.md 裡刷新自己的區塊、不碰手寫內容。

### CLI

| Command | Flags | Exit |
|---|---|---|
| `blueprint init` | `--framework vue\|react` · `--no-install` · `--dry-run` | 失敗時 `1` |
| `blueprint inspect` | `--framework vue\|react` · `--json` | 有 error 級 finding 時 `1` |

## 🧠 Philosophy

Lint 是進場點，不是結論。Blueprint 把機器查得了的全部推進 gate，查不了的編譯進「人跟 agent 真的會讀」的兩份 artifact —— 讓判斷規則在每次改動的 context 裡，而不是在沒人開的 wiki 分頁裡。這個 package 自己就活在自己的手冊裡：entry-only module import、沒有 `utils` 雜物櫃、100% 測試覆蓋率是硬 gate。

## License

[MIT](./LICENSE) © taco3064
