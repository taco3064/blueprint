# 檢測與 config 總表

本頁彙整 blueprint 所有查得到的東西，以及指南各頁沒逐一說明的 config 欄位。完整型別簽名見 [API 文件](/zh-TW/api/)；本頁的定位是索引地圖。

## `inspect` 回報的檢測項目

共九種檢測。只要有 `error` 等級的違規，就以 exit code 1 結束；`warn` 與 `info` 只提示、不影響檢核結果。測試檔案（`architecture.testFiles`）一律豁免。

| 規則 | 等級 | 檢測內容 |
| --- | --- | --- |
| `undeclared-folder` | error | 原始碼根目錄下存在未宣告為分層的資料夾 |
| `flow-violation` | error | 逆向匯入，或透過別名進行的同層匯入 |
| `deep-import` | error | 別名匯入直接觸及資料夾模組的**內部**，未經公開入口 |
| `relative-escape` | error | 相對路徑匯入越出所屬模組，或逃逸出原始碼根目錄 |
| `package-ownership` | error | 從非擁有者分層匯入某分層專屬的套件（或受限的具名匯入） |
| `selfonly-reexport` | error | 再匯出標記為 `selfOnly` 的依賴 —— 僅可依賴，不可轉手輸出 |
| `cycle` | error | 模組層級的循環匯入，並列出完整路徑 |
| `no-entry` | warn | 資料夾模組缺少公開入口檔 —— 外部無從匯入 |
| `missing-layer` | info | 已宣告的分層尚無對應資料夾 |

既有專案可透過 [baseline 棘輪](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect)，把這份清單轉成「只攔新增的違規」。

## 內嵌 ESLint 外掛

`emitLint` 在生成的 config 裡內建六條自訂規則 —— 不用額外安裝。其中一條是結構規則、永遠開著；其餘五條由 `blueprint.rules` 的規則識別碼控制：

| ESLint 規則 | 控制來源 | 強制內容 |
| --- | --- | --- |
| `blueprint/relative-escape` | 恆常啟用（結構規則） | 相對路徑匯入不得越出所屬模組 —— 與 inspect 同名檢測共用同一套解析邏輯 |
| `blueprint/no-deep-watch` | `rules.deepWatch` | 禁用 `deep: true` 的監聽 —— 每次變更都會遍歷整個資料來源（Vue 預設藍圖：`error`） |
| `blueprint/use-prefix` | `rules.usePrefix` | hook 分層匯出的函式必須帶 `use` 前綴（分層與前綴皆可設定） |
| `blueprint/use-prefix-needs-reactivity` | `rules.usePrefixReactivity` | 帶 `use` 前綴的檔案必須實際呼叫 reactive 或生命週期 API |
| `blueprint/test-filename-matches-source` | `rules.testFilename` | 測試檔必須有同目錄、同名的原始碼檔案 |
| `blueprint/no-typedef-only-file` | `rules.typedefOnlyFile` | JS 檔案不得僅含 `@typedef` 宣告（僅套用於 `.js`） |

另有三條**受管規則** —— 由 `layers` / `owns` / `alias` 轉譯而成、歸生成器管：`no-restricted-imports`、`no-restricted-syntax`、`no-restricted-globals`。這三條沒辦法透過 `lintOverrides` 設定；要調整就改 blueprint config 本身。

## `blueprint.rules` —— 哪些識別碼會成為檢核關卡

`blueprint.rules` 裡的識別碼，只有機器查得動的才會轉譯成 lint 關卡。查得動的集合如下：

| 識別碼 | 編譯目標 | 預設藍圖的設定 |
| --- | --- | --- |
| `maxLines` | `max-lines` | error · 400 |
| `maxLinesPerFunction` | `max-lines-per-function` | warn · 100 |
| `maxParams` | `max-params` | warn · 3 |
| `maxStatements` | `max-statements` | warn · 15 |
| `complexity` | `complexity` | warn · 12 |
| `unusedVars` | `no-unused-vars`（TypeScript 專案自動改用 TS 感知版本） | error |
| `fixtureImports` | 禁止產品程式碼匯入 fixture 目錄 | error（Vue 預設藍圖） |
| `cycles` | inspect 的 `cycle` 檢測（模組層級；生成 config 已不再帶 `import/no-cycle` —— 它逐檔重查同一張圖，850 檔實測要 92 秒） | error |
| `deepWatch` / `usePrefix` / `usePrefixReactivity` / `testFilename` / `typedefOnlyFile` | 上表的外掛規則 | 見上表 |

其餘任何識別碼（例如 `deadCode`）都屬於文件性質：會寫進手冊與 AI Agent 守則，作為 Agent 必須持守的判斷，但不會被說成硬性關卡。這個劃分就是[三級落點](/zh-TW/philosophy/#三級落點)的機制。

一個實戰會咬人的範圍細節：**`emit.lint.severity` 只蓋結構家族**（`no-restricted-imports` / `-syntax` / `-globals` 與 `blueprint/relative-escape`）。上表每條規則都吃自己的 `blueprint.rules` tier —— severity 設 `warn` **不會**讓 `maxLines` 或 `unusedVars` 變安靜。

## 快速上手範例以外的 config 欄位

[快速上手](/zh-TW/guide/getting-started#blueprint-config)的 `defineBlueprint` 範例涵蓋核心欄位。其餘欄位一覽如下 —— 完整結構見 [API 文件](/zh-TW/api/)：

| 欄位 | 用途 |
| --- | --- |
| `architecture.sourceRoot` | 分層所在目錄（相對於專案根目錄）。預設 `src`；根目錄式佈局（如無 `src/` 的 Next.js）設為 `.` |
| `architecture.additionalAliases` | `alias` 以外、同樣納入所有結構禁令的額外匯入根 |
| `architecture.testFiles` | 豁免於結構規則與度量關卡的測試檔樣式（預設 `*.test.*` / `*.spec.*`） |
| `architecture.layerFiles` / `layerFilesIgnore` | 框架預設樣式不適用時，逐層指定檔案樣式 |
| `architecture.naming` | 依概念設定的命名慣例（如 `{ hook: 'useX + reactivity' }`）—— 寫入手冊與契約 |
| `layer.module` | 逐層覆寫共用的模組形狀 —— 例如某一分層採資料夾模組、其餘維持單檔 |
| `layer.lintOverrides` | 逐層的 ESLint 調整（三條受管規則除外） |
| `emit.agents` | Agent 守則的發佈目標：`claude`、`agents`、`gemini`、`copilot`、`cursor`、`windsurf`（可逐目標指定 `path`）。預設 `['claude', 'agents']`；空陣列就不產出 |
| `emit.handbook` / `emit.ci` / `emit.lint` | 手冊輸出路徑 · CI 供應商（`github` / `none`）· lint config 路徑＋**結構規則**的等級（度量規則吃自己的 `rules` tier） |

## 命令列旗標

| 指令 | 旗標 |
| --- | --- |
| `init` | `--agent claude\|codex`（啟動編寫用的 Agent CLI）· `--preset`（強制建 preset）· `--authoring`（即使小 repo 也強制產 playbook；與 `--preset` 相反）· `--framework vue\|react` · `--no-install` · `--dry-run` |
| `survey` | `--alias <name>`（tsconfig paths 偵測不到別名時指定）· `--json` |
| `inspect` | `--baseline` · `--update-baseline` · `--framework vue\|react` · `--json` |
| `impact` | `--framework vue\|react` · `--json` |
| `deps [module]` | `--framework vue\|react` · `--json` |
| `doctor` | `--framework vue\|react` · `--json` |

所有指令都支援 `--help`；CLI 本身支援 `--version`。
