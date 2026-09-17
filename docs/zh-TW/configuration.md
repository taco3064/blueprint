# 設定

導入完成後，`blueprint.config.mjs` 就是專案的架構權威。你可以匯出經 `defineBlueprint()`
驗證的物件，或使用內建預設設定：

```js
import { defineBlueprint } from '@kekkai/blueprint';

export default defineBlueprint({
  name: 'storefront',
  framework: 'react',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'pages', does: '組合路由頁面。' },
      { name: 'components', does: '可重用介面。' },
      { name: 'services', does: '網路存取。', owns: ['axios'] },
    ],
  },
});
```

`defineBlueprint()` 會立刻驗證；Blueprint 載入一般物件時也會再次驗證。未知的結構欄位與
不成立的相依圖會回報明確錯誤，不會默默忽略。[API 參考](/zh-TW/api/)保留完整型別簽章；
本頁則說明這些欄位如何組成同一個模型。

套件提供兩個具有完整宣告檔的公開入口。架構編寫、預設設定、emitters 與 runtimes 使用
`@kekkai/blueprint`；需要組合 Blueprint 管理的執行期或產生文字時，整合工具可從
`@kekkai/blueprint/operational-contract` 使用具型別的 `OperationalText` renderers。一般導入
不需要使用此子路徑；確有整合需求時應匯入這個公開入口，不要直接引用 `dist/` 內部檔案。

## 根欄位

- **`name`**
  - 型別與預設值：選填 `string`。
  - 用途：顯示於架構手冊與 Agent 守則的專案名稱。
- **`framework`**
  - 型別與預設值：必填 `'vue' | 'react' | 'auto'`。
  - 用途：決定原始碼 glob 與框架限定規則；`auto` 交由執行期偵測。
- **`architecture`**
  - 型別與預設值：必填 `ArchitectureDef`。
  - 用途：定義原始碼根目錄、拓樸、依賴方向、單元配置、別名與所有權。
- **`rules`**
  - 型別與預設值：`Record<string, RuleSetting>`，預設 `{}`。
  - 用途：選用的 lint／執行期關卡與文件判斷準則。規則有備用數值，不代表未宣告時會自動啟用。
- **`principles`**
  - 型別與預設值：`PrincipleDef[]`，預設 `[]`。
  - 用途：產生給人與 Agent 閱讀的核心工程信念。
- **`componentShape`**
  - 型別與預設值：`AxisDef[]`，預設 `[]`。
  - 用途：各自獨立的元件設計判斷軸線。
- **`playbook`**
  - 型別與預設值：`PlaybookSection[]`，預設 `[]`。
  - 用途：依主題分組的工作規則。
- **`emit`**
  - 型別與預設值：選填 `EmitDef`。
  - 用途：架構手冊、Agent 守則與結構性 lint 的產出政策。

## 架構

### 別名與原始碼根目錄

```js
architecture: {
  alias: '~app',
  additionalAliases: {
    '@legacy': './src',
    '@shared': './src/shared',
  },
  sourceRoot: 'src',
  // ...
}
```

- **`alias`** 必填且沒有預設值，是跨越受管理模組或分層邊界時唯一標準的原始碼根別名。
- **`additionalAliases`** 將既有別名對應至專案相對路徑，供解析與相依診斷使用；它們不會
  變成跨邊界時的另一套標準寫法。
  若在此重複標準 `alias`，只有正規化後仍指向相同原始碼根目錄才會接受；指向不同位置時，
  會在設定驗證階段直接拒絕，不讓互相矛盾的別名身分進入 lint 產出、檢查或遷移建議。
- **`sourceRoot`** 預設為 `src`。Next.js 未使用 `src/` 等根目錄配置可設為 `.`。Lint、
  `inspect`、`deps`、產生後的守則與建置路徑都以它為基準。

### Layer-first

沒有 `architecture.modules` 時，實體結構是 `Layer → Unit`：

```js
architecture: {
  alias: '~app',
  layers: [
    { name: 'pages', does: '路由與頁面組合。' },
    { name: 'components', does: '可重用介面。' },
    { name: 'services', does: '網路存取原語。' },
  ],
}
```

分層宣告順序就是預設的單向流：前面的層可以匯入後面的層，反向則不行。以上例來說，
`pages` 可匯入 `components` 與 `services`，`services` 則不能匯入上游。

### Module-first

`architecture.modules` 以「有沒有宣告」決定拓樸：

- **省略** — layer-first。
- **`[]`** — module-first 起點：拓樸已宣告，但還沒有任何領域模組。<br>
  所有內部分層、規則與理念都已生效；lint、`inspect`、`deps`、`doctor`、`impact`、<br>
  架構手冊與 Agent 守則都會把這個應用程式當成 module-first。<br>
  空的起點是刻意的狀態，不是導入沒做完。
- **一個以上的模組** — 已建立領域模組的 module-first。

宣告模組後，一般模組的實體結構改為 `Module → Layer → Unit`：

```js
architecture: {
  alias: '~app',
  modules: [
    { name: 'checkout', does: '結帳流程。', dependsOn: ['catalog'] },
    { name: 'catalog', does: '商品探索。' },
    { name: 'app', does: '路由組合。' },
  ],
  layers: [
    { name: 'components', does: '模組介面。' },
    { name: 'hooks', does: '狀態轉接。' },
    { name: 'services', does: '資料存取。' },
  ],
  layerFiles: '{module}/{layer}/**/*.{ts,tsx}',
}
```

每個一般模組都重複使用同一份分層定義，模組根目錄的檔案則佔 container 的位置：<br>
它們負責組合自己與可達模組的內部分層，所以 layer-first 的 `containers` 層不會在模組裡重複出現。<br>
`dependsOn` 列出直接依賴；實際權限依相依圖的
遞移可達性決定，與宣告順序無關。一次受管理的匯入必須同時通過外層模組圖與內部分層流。

模組名稱即使只有大小寫不同也不能重複。相依目標必須已宣告，且不得為空、重複、指向
自己或形成循環。

`app` 是選用的保留名稱。它代表 container 位置上的遞迴路由組合，不是一般領域模組，
也不重複內部分層。

### 分層欄位

- **`name`**
  - 型別與預設值：必填非空 `string`。
  - 意義：資料夾／分層識別碼。不得重複，也不能是路徑或保留的產出檔名。
- **`does`**
  - 型別與預設值：必填 `string`。
  - 意義：一行責任說明，會寫入產出守則。
- **`mustNot`**
  - 型別與預設值：`string[]`，預設 `[]`。
  - 意義：不該承擔的責任，由人與 Agent 判斷。
- **`layout`**
  - 型別與預設值：`'folder' | 'file'`，預設 `'file'`。
  - 意義：Folder layout 的單元具有公開入口；file layout 採分層粒度的相依關係。
- **`entry`**
  - 型別與預設值：`string`，預設 `'index'`。
  - 意義：Folder layout 單元的公開入口檔名。
- **`allowedImporters`**
  - 型別與預設值：選填 `(string | AllowedImporter)[]`。
  - 意義：縮小哪些上游層可以匯入本層；省略時允許所有較早宣告的層。
- **`owns`**
  - 型別與預設值：`OwnedPrimitive[]`，預設 `[]`。
  - 意義：只允許本層使用的套件、具名匯入或全域物件。
- **`lintOverrides`**
  - 型別與預設值：`Record<string, unknown>`，預設 `{}`。
  - 意義：本層的 ESLint 覆寫；Blueprint 管理的限制規則不能在這裡取代。

物件形式的 importer 可加入 `selfOnly` 與 `description`：

```js
{
  name: 'contexts',
  does: '定義 Context 與 Provider。',
  allowedImporters: [
    { layer: 'containers', description: '只掛載 Provider' },
    { layer: 'hooks', selfOnly: true, description: '只使用 Context' },
  ],
}
```

`selfOnly` 允許依賴，但禁止繼續再匯出。每個 importer 必須是不重複、且已在更前面宣告的
分層，因此這個欄位只能縮小單向圖，不能建立回頭依賴。

所有權有三種寫法：

```js
owns: [
  'axios',
  { package: 'react', imports: ['useContext'] },
  { package: '@company/*', pattern: true, exempt: ['**/*.adapter.ts'] },
  { global: 'WebSocket' },
]
```

- 字串代表擁有完整套件／模組識別字。
- `{ package, imports }` 只擁有具名匯入；`pattern` 將套件名稱視為 glob 群組，`exempt`
  則排除符合條件的檔案。
- `{ global }` 代表不經 import 宣告的全域物件。

### 檔案範圍與命名

- **`layerFiles`**
  - 預設值：依框架產生原始碼 glob。
  - 意義：可填一個或多個 glob。Layer-first 必須包含 `{layer}`；module-first 必須同時包含 `{module}` 與 `{layer}`。
- **`layerFilesIgnore`**
  - 預設值：無。
  - 意義：從產生的 lint 與 lint 型 finding 排除；其他 inspect 分析仍可能看見。
- **`testFiles`**
  - 預設值：`**/*.test.{js,jsx,ts,tsx,vue}` 與 `**/*.spec.{js,jsx,ts,tsx,vue}`。
  - 意義：從結構／度量分析與相依圖排除，同時作為測試限定規則範圍。`[]` 會關閉兩者，也讓 `testFilename` 沒有作用範圍。
- **`naming`**
  - 預設值：`{}`。
  - 意義：依概念命名的文字慣例，會寫入架構手冊與 Agent 守則。

可攜式 glob 使用 `/`、`**`、`*`、`?` 與 `*.{ts,tsx}` 這類單層大括號選項。Lint 與
inspect 共用的語法不包含反向條件、字元集合、extglob 或巢狀大括號。

## 規則 {#rules}

規則可直接填 tier，或使用含 tier 與選項的物件：

```js
rules: {
  maxLines: { tier: 'error', value: 400 },
  usePrefix: { tier: 'error', layer: 'hooks', prefix: 'use' },
  codeStyle: { tier: 'warn', indent: 2, quotes: 'single', semi: true, maxLen: 90 },
  deadCode: 'warn',
}
```

有效 tier 為 `error`、`warn`、`off`。未宣告的選用規則不會產生。度量規則只有在已宣告但
省略 `value` 時，才會採用備用數值。

- **`maxLines`** — 由 `max-lines` 執行；備用值為 `400`，只計算程式行。
- **`maxLinesPerFunction`** — 由 `max-lines-per-function` 執行；備用值為 `100`，只計算程式行。
- **`maxParams`** — 由 `max-params` 執行；備用值為 `3`。
- **`maxStatements`** — 由 `max-statements` 執行；備用值為 `15`。
- **`complexity`** — 由 `complexity` 執行；備用值為 `12`。
- **`unusedVars`** — 由 core 或 TypeScript 版 `no-unused-vars` 執行；底線開頭的參數可忽略，變數改成底線開頭不算刪除。
- **`explicitAny`** — 由 `@typescript-eslint/no-explicit-any` 執行；只有提供 TypeScript 外掛時產生。
- **`codeStyle`** — 由 `@stylistic` 規則組與 `curly` 執行；預設縮排 `2`、單引號、分號、最大行長 `90`。
- **`statementsPerLine`** — 由 `@stylistic/max-statements-per-line` 執行；固定最多 `1` 個 statement。
- **`statementPadding`** — 由 `@stylistic/padding-line-between-statements` 執行；採固定留白政策。
- **`importBlock`** — 由 `import-x/first` 與 `import-x/no-duplicates` 執行；需要 import-x 外掛。
- **`fixtureImports`** — 由結構性 restricted imports 執行；禁止正式程式碼從別名下的 `fixtures` 路徑匯入。
- **`deepWatch`** — 由 `blueprint/no-deep-watch` 執行；只適用 Vue。
- **`usePrefix`** — 由 `blueprint/use-prefix` 執行；預設分層為 `hooks`、前綴為 `use`。
- **`usePrefixReactivity`** — 由 `blueprint/use-prefix-needs-reactivity` 執行；檢查 `use` 命名單元是否在同一檔案直接呼叫可辨識的響應式／生命週期 API。它不會追查被呼叫的其他 hooks，因此警告不能證明函式是純函式；重新命名或搬移前，應先檢查組合的 hooks。
- **`testFilename`** — 由 `blueprint/test-filename-matches-source` 執行；使用 `architecture.testFiles`，空陣列時無法啟用。
- **`typedefOnlyFile`** — 由 `blueprint/no-typedef-only-file` 執行；只適用 JavaScript 檔案。
- **`cycles`** — 由 `inspect` 的循環 finding 執行；執行指令或 CI 時分析，預設不是 ESLint 規則。
- **`deadCode` 與其他識別碼** — 只寫入產出守則，沒有機器關卡；可另用 knip 等合適工具。

結構性規則不屬於這份選用清單。只要執行 `emitLint`，模組可達性、分層流、標準別名、單元
入口、相對路徑逃逸、所有權與 `selfOnly` 就會由 `architecture` 產生。

請用 `blueprint rules` 查看真實專案的有效規則。若自行呼叫 `emitLint`，第三方規則需要在
`EmitLintOptions` 提供對應的 `typescript`、`stylistic` 或 `imports` 外掛；自動產生的設定檔
已經完成接線。

## 核心信念、元件設計與工作指南

這三組欄位承載專案自己的工程理念，不假裝所有判斷都能自動化：

```js
principles: [{
  id: 'single-source',
  say: '維持單一真相來源。',
  why: '衍生值不該成為重複的可變狀態。',
  land: 'claude',
}],
componentShape: [{
  id: 'narrow-inputs',
  name: '收窄輸入',
  say: '單元只依賴真正需要的內容。',
  why: '介面越小，耦合越少。',
  triage: 'max-params',
}],
playbook: [{
  title: '審查',
  rules: [{ id: 'measure-first', say: '最佳化前先量測。' }],
}],
```

- principle 需要不重複的 `id`、`say`、`why` 與 `land`（`lint` 或 `claude`）。
- component axis 需要不重複的 `id`、`name`、`say` 與 `why`；`triage` 可指定用來找出候選
  問題的規則。
- 每個執行指南區段都要有非空 `title`；規則 id 必須在所有區段間保持唯一，並
  提供 `say` 與選填 `why`。

Vue 與 React 預設設定會帶入 Blueprint 的標準理念；自訂設定可保留、替換或省略。概念本身
見[工程理念](/zh-TW/philosophy/)。

## 產出目標

```js
emit: {
  handbook: 'docs/architecture-handbook.md',
  agents: [
    'agents',
    { target: 'cursor', path: '.cursor/rules/architecture.mdc' },
  ],
  lint: { severity: 'warn' },
}
```

- **`emit.handbook`**
  - 預設值：`docs/architecture-handbook.md`。
  - 意義：相對於專案根目錄的架構手冊路徑。
- **`emit.agents`**
  - 預設值：`['claude', 'agents']`。
  - 意義：守則目標。可用值為 `claude`、`agents`、`gemini`、`copilot`、`cursor`、`windsurf`；物件形式可改路徑，`[]` 代表完全不產生。
- **`emit.lint.severity`**
  - 預設值：`'error'`。
  - 意義：只控制結構性規則；選用 `rules` 仍使用各自 tier。

Agent 目標不能重複，自訂路徑也不能是空字串。預設路徑、合併／完整管理策略與生命週期見
[產出檔案](/zh-TW/generated-files#agent-contracts)。

## 預設設定

```js
import { nextPreset, reactPreset, vuePreset } from '@kekkai/blueprint';

export default vuePreset({ name: 'admin', alias: '~app' });
// export default reactPreset({ name: 'web', emit: { agents: ['agents'] } });
// export default nextPreset({ router: 'app', srcDir: true });
```

`vuePreset()` 與 `reactPreset()` 提供標準單向應用程式分層、所有權、規則、核心信念、元件
軸線與工作指南。選項為 `name`、`alias`（預設 `~app`）、`emit` 與 `modules`。

`modules` 跟 `architecture.modules` 用同一條「有沒有宣告」規則。<br>
省略時，預設設定維持 layer-first 分層。<br>
給 `[]` 或宣告模組時，預設設定會投影成 module-first：`pages` 與 `containers` 離開內部分層 ——<br>
路由組合交給保留的 `app` 模組，模組根目錄佔 container 的位置 ——<br>
其餘分層守則、規則、核心信念、元件軸線與工作指南全部不變：

```js
// 以 --topology module-first 導入、經量測確認沒有原始碼的應用程式：
export default reactPreset({ name: 'web', modules: [] });
```

`nextPreset()` 使用 React 語意，並依 `app`、`pages` 或 `both` 調整 layer-first 路由樹；
`router` 預設為 `app`。`srcDir: true` 會選擇 `src`，否則原始碼根目錄為 `.`；別名預設為
`@`。由於 Server Component 原本就可能在路由樹各處取得資料，它不會將 `fetch` 限定在單一層。

## 從 3.2 升級到 4.0

有效的 3.2 設定仍是既有 layer-first 專案的權威。執行 4.0 `init` 會先完成支援的正規化與
修復。若同一次執行要求 module-first，Blueprint 會先把正規化後的 layer-first 設定寫成可
復原的檢查點，並停在此處。接著再次執行 `init --topology module-first`，才會從明確的 4.0
權威啟動受保護的轉換；不會在同一步裡重新解讀舊格式並搬移原始碼。
