# 功能總覽

blueprint 的全部功能，每項一句話說明。每個項目均連結至對應的使用說明頁面。

## 指令 —— 你所執行的

| 功能 | 說明 |
| --- | --- |
| [`init` —— 全新專案建置](/zh-TW/guide/getting-started#全新專案-——-blueprint-init) | 單一指令建置整套運作契約：分層資料夾、組態、程式碼檢查、手冊、AI 代理契約、持續整合與匯入別名 |
| [`init` —— 既有專案編寫流程](/zh-TW/guide/ai-adoption#導入流程) | 對有程式碼但無組態的專案，不猜測預設藍圖，改為產出一份可執行的編寫作業手冊 |
| [`init --agent claude\|codex`](/zh-TW/guide/ai-adoption) | 啟動使用者自身的代理工具執行該作業手冊 —— 由證據推導組態，反覆檢核至每項檢測結果均可解釋 |
| [`survey`](/zh-TW/guide/ai-adoption#蒐證步驟的必要性) | 決定性的專案蒐證：資料夾形狀、匯入矩陣、套件使用集中度 —— 編寫組態的原料 |
| [`inspect`](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect) | 唯讀架構報告，存在違規即以狀態碼 1 結束 —— 持續整合的檢核關卡 |
| [`inspect --baseline`](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect) | 既有專案的基準棘輪：記錄今日債務、僅攔截新增違規，並隨債務清償逐步收緊 |
| [`deps`](/zh-TW/guide/deps) | 逐模組的影響範圍 —— 改動它會波及誰，以及全模組的被引用數排行 |
| [完整命令列旗標](/zh-TW/guide/reference#命令列旗標) | 各指令的旗標總表，含 `init --preset` 與 `--dry-run` |

## 產出物 —— 一份組態編譯出的成果

| 功能 | 說明 |
| --- | --- |
| [`eslint.config.mjs`](/zh-TW/guide/generated-artifacts#eslint-config-mjs-——-強制-enforce) | `emitLint` 將分層流向、套件所有權與模組邊界編譯為檢查組態 —— 內建外掛，無須額外安裝 |
| [`docs/architecture-handbook.md`](/zh-TW/guide/generated-artifacts#docs-architecture-handbook-md-——-說明-explain) | `emitHandbook` 由與規則相同的來源渲染架構手冊（mermaid 圖、分層表、作業守則）—— 兩者不會脫節 |
| [`CLAUDE.md` / `AGENTS.md` / …](/zh-TW/guide/generated-artifacts#claude-md-agents-md-——-協作-collaborate) | `emitAgentFiles` 將同一份代理契約發佈至 Claude、AGENTS.md、Gemini、Copilot、Cursor 與 Windsurf —— 手寫內容於標記區塊外一律保留 |
| [`blueprint-ci.yml`](/zh-TW/guide/generated-artifacts#github-workflows-blueprint-ci-yml-——-檢核-gate) | `emitCi` 產出 GitHub Actions 工作流程：自第一個 commit 起執行程式碼檢查與唯讀架構報告 |

## Blueprint 組態 —— 你所宣告的

| 功能 | 說明 |
| --- | --- |
| [`defineBlueprint`](/zh-TW/guide/getting-started#blueprint-組態) | 唯一真實來源 —— 於定義時**與**每次載入時均執行驗證，結構性錯誤會以精確訊息即時回報 |
| [分層與單向流](/zh-TW/philosophy/layers) | 有序分層，每層僅可向下匯入；`allowedImporters` 收窄可匯入者，`selfOnly` 禁止再匯出 |
| [所有權 —— `owns`](/zh-TW/philosophy/layers#所有權-——-owns) | 分層專屬持有套件、具名匯入或全域物件 —— 其餘分層一律禁止使用 |
| [模組形狀](/zh-TW/philosophy/layers#功能資料夾-——-模組的組成方式) | `folder` 為一功能一資料夾、以公開入口對外；`flat` 為整層單一節點（如 Next 路由樹）—— 可逐層覆寫 |
| [`blueprint.rules`](/zh-TW/guide/reference#blueprint-rules-——-哪些識別碼會成為檢核關卡) | 帶等級的規則識別碼：機器可檢驗者編譯為檢查關卡，其餘寫入手冊與代理契約作為判斷準則 |
| [其餘組態欄位](/zh-TW/guide/reference#快速上手範例以外的組態欄位) | `sourceRoot`、`additionalAliases`、`naming`、`lintOverrides`、`emit.*` —— 每項一句話，完整型別見 API 文件 |
| [預設藍圖](/zh-TW/guide/field-tested#框架注意事項) | `vuePreset` / `reactPreset` 完整編碼治理手冊；`nextPreset` 相容 App 與 Pages 路由、有無 `src/` 皆可 |

## 檢測 —— 會被攔下的

| 功能 | 說明 |
| --- | --- |
| [`inspect` 的九種檢測](/zh-TW/guide/reference#inspect-回報的檢測項目) | 未宣告資料夾、流向違規、深入匯入、所有權、相對路徑逃逸、selfOnly 再匯出、循環、缺入口、缺分層資料夾 |
| [六條內嵌 ESLint 規則](/zh-TW/guide/reference#內嵌-eslint-外掛) | `relative-escape`、`no-deep-watch`、`use-prefix`（含響應式檢核）、`test-filename-matches-source`、`no-typedef-only-file` |
| [三級落點](/zh-TW/philosophy/#三級落點) | 機器可檢驗者編譯為檢查規則；需要判斷者編譯為契約 —— 檢查通過永遠不等於架構正確 |

## 信任與相容性

| 功能 | 說明 |
| --- | --- |
| [安全與信任](/zh-TW/guide/security) | 無網路存取、零執行期依賴、唯讀檢測、寫入行為皆事先宣告、`--dry-run`、出處簽章發佈 |
| [實測相容性](/zh-TW/guide/field-tested) | 實際驗證過的環境 —— 正式產品專案、五種技術組合、單一儲存庫多套件模式 —— 以及不支援的項目（Nuxt）與其原因 |
| [程式化 API](/zh-TW/api/) | 所有生成器與執行器皆可匯入 —— 於自己的 ESLint 組態使用 `emitLint`，於自己的工具鏈使用 `runInspect` / `runDeps` |
