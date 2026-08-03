# 檢測與 config 總表

本頁彙整 blueprint 所有查得到的東西，以及指南各頁沒逐一說明的 config 欄位。<br>
完整型別簽名見 [API 文件](/zh-TW/api/)；本頁的定位是索引地圖。

## `inspect` 回報的檢測項目

只要有 `error` 等級的違規，就以 exit code 1 結束；`warn` 與 `info` 只提示、不影響檢核結果。<br>
測試檔案（`architecture.testFiles`）一律豁免。

- **`undeclared-folder`** · error —— 原始碼根目錄下存在未宣告為分層的資料夾
- **`flow-violation`** · error —— 逆向匯入，或透過別名進行的同層匯入
- **`deep-import`** · error —— 別名匯入直接觸及資料夾模組的**內部**，未經公開入口
- **`relative-escape`** · error —— 相對路徑匯入越出所屬分層、逃逸出原始碼根目錄，或伸進鄰居模組的入口之後。<br>在 `folder` 佈局下，鄰居模組**是**碰得到的 —— `../Sibling` 就是同層之間互相使用的方式，而且是唯一的方式，因為別名寫法（`~app/{自己這層}/Sibling`）仍然被擋
- **`package-ownership`** · error —— 從非擁有者分層匯入某分層專屬的套件（或受限的具名匯入）
- **`selfonly-reexport`** · error —— 再匯出標記為 `selfOnly` 的依賴 —— 僅可依賴，不可轉手輸出
- **`cycle`** · error —— 模組層級的循環匯入，並列出完整路徑
- **`no-entry`** · warn —— 資料夾模組缺少公開入口檔 —— 外部無從匯入
- **`missing-layer`** · info —— 已宣告的分層尚無對應資料夾
- **`declaratory-self-only`** · info —— `selfOnly` 保護的分層還沒有任何檔案 —— 再匯出禁令是宣告性的，要等 code 進來才會真正生效

既有專案可透過 [baseline 棘輪](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect)，把這份清單轉成「只攔新增的違規」。

## 內嵌 ESLint 外掛

`emitLint` 在生成的 config 裡內建自訂規則 —— 不用額外安裝。<br>
其中一條是結構規則、永遠開著；其餘由 `blueprint.rules` 的規則識別碼控制。<br>
plugin 物件本身也有匯出（`import { plugin } from '@kekkai/blueprint'`）—— 這是給「不 spread `emitLint`、想手動掛某條 `blueprint/*` 規則」的逃生口，其他人永遠用不到它：

- **`blueprint/relative-escape`** · 恆常啟用（結構規則）—— inspect 同名檢測的「看得懂深度」孿生版：<br>兩者呼叫同一個 `relativeVerdict`，所以任一方都不可能得出另一方不會同意的結論
- **`blueprint/no-deep-watch`** · `rules.deepWatch` —— 禁用 `deep: true` 的監聽 —— 每次變更都會遍歷整個資料來源（Vue preset：`error`）
- **`blueprint/use-prefix`** · `rules.usePrefix` —— hook 分層匯出的函式必須帶 `use` 前綴（分層與前綴皆可設定）
- **`blueprint/use-prefix-needs-reactivity`** · `rules.usePrefixReactivity` —— 帶 `use` 前綴的檔案必須實際呼叫 reactive 或生命週期 API
- **`blueprint/test-filename-matches-source`** · `rules.testFilename` —— 測試檔必須有同目錄、同名的原始碼檔案
- **`blueprint/no-typedef-only-file`** · `rules.typedefOnlyFile` —— JS 檔案不得僅含 `@typedef` 宣告（僅套用於 `.js`）

另有三條**受管規則** —— 由 `layers` / `owns` / `alias` 轉譯而成、歸生成器管：`no-restricted-imports`、`no-restricted-syntax`、`no-restricted-globals`。<br>
這三條沒辦法透過 `lintOverrides` 設定；要調整就改 blueprint config 本身。

## `blueprint.rules` —— 哪些識別碼會成為檢核關卡

`blueprint.rules` 裡的識別碼，只有機器查得動的才會轉譯成 lint 關卡。<br>
查得動的集合如下：

- **`maxLines`** → `max-lines` · error · 400
- **`maxLinesPerFunction`** → `max-lines-per-function` · warn · 100
- **`maxParams`** → `max-params` · warn · 3
- **`maxStatements`** → `max-statements` · warn · 15
- **`complexity`** → `complexity` · warn · 12
- **`unusedVars`** → `no-unused-vars`（TypeScript 專案自動改用 TS 感知版本）· error
- **`explicitAny`** → `@typescript-eslint/no-explicit-any` · error
- **`codeStyle`** → `@stylistic` 的 `customize()` 整組，加上 `max-len`、`linebreak-style` 與原生 `curly` —— 約 68 條 · error
- **`statementsPerLine`** → `@stylistic/max-statements-per-line`，寫死 `{ max: 1 }` · error
- **`statementPadding`** → `@stylistic/padding-line-between-statements`，帶固定的 17 條設定 · error
- **`importBlock`** → `import-x/first` + `import-x/no-duplicates` · error
- **`fixtureImports`** → 禁止產品程式碼匯入 fixture 目錄 · error（Vue preset）
- **`cycles`** → inspect 的 `cycle` 檢測（模組層級；生成 config 已不再帶 `import/no-cycle` —— 它逐檔重查同一張圖，850 檔實測要 92 秒）· error
- **`deepWatch` / `usePrefix` / `usePrefixReactivity` / `testFilename` / `typedefOnlyFile`** → 上面外掛那節的規則（見上）

其餘任何識別碼（例如 `deadCode`）都屬於文件性質：會寫進手冊與 AI Agent 守則，作為 Agent 必須持守的判斷，但不會被說成硬性關卡。<br>
這個劃分就是[三種級別落點](/zh-TW/philosophy/#三種級別落點)的機制。

這整份對照隨時問得到工具本人：<br>
`npx blueprint rules` 會印出 catalog，有 config 時還會標註實際宣告的 tier。

### 有五個關卡靠注入的外掛才活著

這個套件**沒有任何 runtime 依賴**，<br>
所以上面每一條會 emit 第三方規則的識別碼，都得由你把外掛交給 `emitLint`。<br>
而外掛缺席的關卡會**完全不 emit，同時 lint 照樣是綠的** —— 讀起來跟一次乾淨的合併一模一樣。<br>
生成的 config 三個外掛都接好了，`init` 也會裝；<br>
手動合併的 config 要自己把參數帶過去：

```js
import stylistic from '@stylistic/eslint-plugin';
import imports from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

export default [
  /* …你原本的設定 */
  ...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports }),
];
```

- **`explicitAny`** 要 `typescript`。<br>
  跟 `unusedVars` 不一樣，這條沒有原生規則可以退回去 —— `any` 是 TypeScript 才有的東西，<br>
  所以在 JS 專案裡這個關卡沒有意義，`inspect` 會直接把它從涵蓋率的分母移掉，<br>
  而不是回報一個沒人開得起來的關卡。
- **`codeStyle`**、**`statementsPerLine`**、**`statementPadding`** 要 `stylistic`。<br>
  ESLint 自己的排版規則，在它把排版交給 `@stylistic` 那次就被標為 deprecated 並凍結了，<br>
  照原本的識別碼 emit 等於塞一批隨時會被移除的規則給使用者。<br>
  `codeStyle` 還會去讀外掛的 `configs.customize()` factory，讀不到就**直接拋錯**，<br>
  而不是安靜地什麼都不管。
- **`importBlock`** 要 `imports`。<br>
  ESLint 原生和 `@stylistic` 都沒有任何規則會合併重複的 import。

### 這裡是 ESLint 在管排版

`codeStyle` 不是包在 formatter 外面的便利層 —— **它就是 formatter**。<br>
兩個後果值得直說：

- **紅字本身就是完整的執行機制。**<br>
  不需要編輯器整合、不需要存檔掛鉤、也不假設誰用哪個編輯器：<br>
  agent 跑 lint、讀到紅字、自己修好。<br>
  約 68 條裡只有 5 條沒有自動修正，所以 `eslint --fix` 會清掉第一輪的絕大部分，<br>
  剩下的才是真的需要判斷的部分。
- **本來就有自己 formatter 的 repo，屬於「工具重疊」那一類。**<br>
  排版的所有權留一個，並把選了哪個記錄下來。<br>
  兩邊設在同一個 key 上的規則是機械性衝突 —— flat config 是取代而不是合併。

`codeStyle` 裡面有三個細節是刻意的，不是順手加的：

- **`statementsPerLine` 是讓 `maxLines` 有意義的那條。**<br>
  `maxLines` 數的是程式行（空行與註解跳過），<br>
  所以一個沒有限制「一行能裝多少」的行數預算，把敘述壓成一行就過得去 —— 根本不用拆檔案。<br>
  `{ max: 1 }` 寫死就是為了這件事：這個關卡的旋鈕是 tier。<br>
  `curly` 堵的是同一條路的下一層：沒有它，`if (x) return;` 會被算成一個敘述而溜過去。
- **`max-len` 不放過純字串，而且沒有自動修正。**<br>
  一個「行裡有字串就豁免」的長度上限不是上限；<br>
  而過長的行要的是重構，不是重排。
- **`linebreak-style` 是 `unix`，而它的紅字通常不是在講那個檔案。**<br>
  會炸的是混用換行，所以立場是全部 LF ——<br>
  但違規的成因通常在 git 的 `autocrlf` 或缺少 `.gitattributes`。<br>
  去那邊修，不然下次 checkout 就把自動修正蓋回去了。

可調參數：`indent`（2）、`quotes`（`single`）、`semi`（`true`）、`maxLen`（90），<br>
寫在 gate 上，例如 `codeStyle: { tier: 'error', indent: 4, maxLen: 120 }`。<br>
其餘都是固定的 —— 想要不一樣的括號風格就把這個關卡關掉，自己宣告一套。

一個實戰會咬人的範圍細節：**`emit.lint.severity` 只蓋結構家族**（`no-restricted-imports` / `-syntax` / `-globals` 與 `blueprint/relative-escape`）。<br>
上面每條規則都吃自己的 `blueprint.rules` tier —— severity 設 `warn` **不會**讓 `maxLines` 或 `unusedVars` 變安靜。

## 快速上手範例以外的 config 欄位

[快速上手](/zh-TW/guide/getting-started#blueprint-config)的 `defineBlueprint` 範例涵蓋核心欄位。<br>
其餘欄位一覽如下 —— 完整結構見 [API 文件](/zh-TW/api/)：

- **`architecture.sourceRoot`** —— 分層所在目錄（相對於專案根目錄）。預設 `src`；根目錄式佈局（如無 `src/` 的 Next.js）設為 `.`
- **`architecture.additionalAliases`** —— `alias` 以外、同樣納入所有結構禁令的額外匯入根
- **`architecture.testFiles`** —— 豁免於結構規則與度量關卡的測試檔樣式（預設 `*.test.*` / `*.spec.*`）
- **`architecture.layerFiles` / `layerFilesIgnore`** —— 框架預設樣式不適用時，逐層指定檔案樣式
- **`architecture.naming`** —— 依概念設定的命名慣例（如 `{ hook: 'useX + reactivity' }`）—— 寫入手冊與守則
- **`layer.module`** —— 逐層覆寫共用的模組形狀 —— 例如某一分層採資料夾模組、其餘維持單檔
- **`layer.lintOverrides`** —— 逐層的 ESLint 調整（三條受管規則除外）
- **`emit.agents`** —— Agent 守則的發佈目標：`claude`、`agents`、`gemini`、`copilot`、`cursor`、`windsurf`（可逐目標指定 `path`）。預設 `['claude', 'agents']`；空陣列就不產出。縮窄清單後，下一次 init 會自動移除「整份都是自己產出」的過期守則檔（被人手改過的只提醒、不動手）
- **`emit.handbook` / `emit.lint`** —— 手冊輸出路徑 · **結構規則**的等級（度量規則吃自己的 `rules` tier）

## 命令列旗標

- **`init`** —— `--agent claude|codex`（啟動編寫用的 Agent CLI）· `--preset`（強制建 preset）· `--authoring`（即使小 repo 也強制產 playbook；與 `--preset` 相反）· `--framework vue|react` · `--no-install` · `--dry-run`
- **`survey`** —— `--alias <name>`（tsconfig paths 偵測不到別名時指定）· `--json`
- **`inspect`** —— `--baseline` · `--update-baseline` · `--framework vue|react` · `--json`
- **`impact`** —— `--json`
- **`deps [module]`** —— `--framework vue|react` · `--json`
- **`rules`** —— `--json`
- **`doctor`** —— `--json`

所有指令都支援 `--help`；CLI 本身支援 `--version`。
