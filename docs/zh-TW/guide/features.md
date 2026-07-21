# 功能總覽

這是 blueprint 的全部功能及相關簡易說明，點擊功能名稱就能看到對應的使用方式。

## 指令 —— 你所執行的

| 功能 | 說明 |
| --- | --- |
| [`init` —— 全新專案建置](/zh-TW/guide/getting-started#全新專案-——-blueprint-init) | 單一指令完成設計理念的護欄導入：分層資料夾、config、lint、手冊、AI Agent 守則、CI 與匯入別名 |
| [`init` —— 既有專案編寫流程](/zh-TW/guide/ai-adoption#導入流程) | 對有程式碼但沒有 config 的專案，不硬猜預設藍圖，改為產出一份可執行的編寫作業手冊 |
| [`init --agent claude\|codex`](/zh-TW/guide/ai-adoption) | 啟動你自己的 Agent CLI 執行該作業手冊 —— 由證據推導 config，反覆檢核到每項違規都能解釋為止 |
| [`survey`](/zh-TW/guide/ai-adoption#蒐證步驟的必要性) | 決定性的專案蒐證：資料夾形狀、匯入矩陣、套件使用集中度 —— 編寫 config 的原料 |
| [`inspect`](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect) | 掃描 `src/` 並對照 blueprint config 列出所有違規；只要有 error 等級的違規就以 exit code 1 結束，可直接作為 CI 關卡 |
| [`inspect --baseline`](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect) | 既有專案的 baseline 棘輪：先把今日的債務記錄下來，之後只攔「新增」的違規，隨著債務清償逐步收緊 |
| [`deps`](/zh-TW/guide/deps) | 逐模組的影響範圍 —— 改動它會波及誰，以及全模組的被引用數排行 |
| [完整命令列旗標](/zh-TW/guide/reference#命令列旗標) | 各指令的旗標總表，含 `init --preset` 與 `--dry-run` |

## 產出物 —— 一份 config 編譯出的成果

| 功能 | 說明 |
| --- | --- |
| [`eslint.config.mjs`](/zh-TW/guide/generated-artifacts#eslint-config-mjs-——-強制-enforce) | `emitLint` 將分層流向、套件所有權與模組邊界轉譯為 lint config —— plugin 內建，不用額外安裝 |
| [`docs/architecture-handbook.md`](/zh-TW/guide/generated-artifacts#docs-architecture-handbook-md-——-說明-explain) | `emitHandbook` 由與規則相同的來源產出架構手冊（mermaid 圖、分層表、作業守則）—— 兩者不會脫節 |
| [`CLAUDE.md` / `AGENTS.md` / …](/zh-TW/guide/generated-artifacts#claude-md-agents-md-——-協作-collaborate) | `emitAgentFiles` 將同一份 AI Agent 守則發佈至 Claude、AGENTS.md、Gemini、Copilot、Cursor 與 Windsurf —— 標記區塊外的手寫內容一律保留 |
| [`blueprint-ci.yml`](/zh-TW/guide/generated-artifacts#github-workflows-blueprint-ci-yml-——-檢核-gate) | `emitCi` 產出 GitHub Actions workflow：從第一個 commit 起執行 lint 與唯讀架構報告 |

## Blueprint config —— 你所宣告的

| 功能 | 說明 |
| --- | --- |
| [`defineBlueprint`](/zh-TW/guide/getting-started#blueprint-config) | 唯一真實來源 —— 定義時**與**每次載入時都會驗證，結構性錯誤以精確訊息即時回報 |
| [分層與單向流](/zh-TW/philosophy/layers) | 有序分層，每層僅可向下匯入；`allowedImporters` 收窄可匯入者，`selfOnly` 禁止再匯出 |
| [所有權 —— `owns`](/zh-TW/philosophy/layers#所有權-——-owns) | 分層專屬持有套件、具名匯入或全域物件 —— 其餘分層一律禁止使用 |
| [模組形狀](/zh-TW/philosophy/layers#功能資料夾-——-模組的組成方式) | `folder` 為一功能一資料夾、以公開入口對外；`flat` 為整層單一節點（如 Next 路由樹）—— 可逐層覆寫 |
| [`blueprint.rules`](/zh-TW/guide/reference#blueprint-rules-——-哪些識別碼會成為檢核關卡) | 帶等級的規則識別碼：機器查得動的轉譯成 lint 關卡，其餘寫進手冊與 Agent 守則作為判斷準則 |
| [其餘 config 欄位](/zh-TW/guide/reference#快速上手範例以外的-config-欄位) | `sourceRoot`、`additionalAliases`、`naming`、`lintOverrides`、`emit.*` —— 每項一句話，完整型別見 API 文件 |
| [預設藍圖](/zh-TW/guide/field-tested#框架注意事項) | `vuePreset` / `reactPreset` 完整編碼治理手冊；`nextPreset` 相容 App 與 Pages 路由、有無 `src/` 皆可 |

## 檢測 —— 會被攔下的

| 功能 | 說明 |
| --- | --- |
| [`inspect` 的九種檢測](/zh-TW/guide/reference#inspect-回報的檢測項目) | 未宣告資料夾、流向違規、深入匯入、所有權、相對路徑逃逸、selfOnly 再匯出、循環、缺入口、缺分層資料夾 |
| [六條內嵌 ESLint 規則](/zh-TW/guide/reference#內嵌-eslint-外掛) | `relative-escape`、`no-deep-watch`、`use-prefix`（含 reactive 檢核）、`test-filename-matches-source`、`no-typedef-only-file` |
| [三級落點](/zh-TW/philosophy/#三級落點) | 機器查得動的轉譯成 lint 規則；需要判斷的轉譯成 Agent 守則 —— lint 全綠永遠不等於架構正確 |

## 信任與相容性

| 功能 | 說明 |
| --- | --- |
| [安全與信任](/zh-TW/guide/security) | 無網路存取、零執行期依賴、唯讀檢測、寫入行為都事先宣告、`--dry-run`、出處簽章發佈 |
| [實測相容性](/zh-TW/guide/field-tested) | 實際驗證過的環境 —— 正式產品專案、五種技術組合、monorepo 模式 —— 以及不支援的項目（Nuxt）與原因 |
| [相近工具 —— 差異在哪](/zh-TW/guide/prior-art) | blueprint 跟 import-boundary linter 重疊在哪 —— 以及只有它能從同一份來源轉譯出的東西 |
| [程式化 API](/zh-TW/api/) | 所有生成器與執行器都可以直接 import —— 在自己的 ESLint config 用 `emitLint`，在自己的工具鏈用 `runInspect` / `runDeps` |
