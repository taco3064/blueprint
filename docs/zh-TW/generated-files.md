# 產出檔案

`init` 會在執行前或執行當下列出每一項動作。實際內容取決於專案現況、拓樸、`emit` 路徑、
所選 Agent，以及既有整合能否安全合併。要確認特定專案會發生什麼，請以 `--dry-run` 的
預覽為準：

```bash
npx @kekkai/blueprint init --topology layer-first --dry-run
```

本頁將副作用分成三類：

1. 長期保留的 Blueprint 設定與產出；
2. 編寫／轉換期間使用的暫存交接檔案；
3. `init` 可能更新的既有專案檔案。

## 長期設定與產出

### `blueprint.config.mjs`

**存在目的：** 導入完成後，作為架構權威。

**內容：** 框架、原始碼根目錄、layer-first 或 module-first 結構、依賴與所有權規則、專案
理念及產出政策。詳見[設定](/zh-TW/configuration)。

**管理權責：** 架構決策屬於導入方。Blueprint 可建立已知預設設定，但不會根據資料夾形狀
暗中以 preset 或推測結果覆蓋自訂設定檔。

**生命週期：** 預設設定流程會建立此檔；架構編寫指南則要求 Agent 建立。後續 `init` 會先
載入並驗證，再更新其他產出。Blueprint 3.2 設定會先正規化成受支援的 4.0 layer-first
格式，作為可復原檢查點；若要改成相反拓樸，必須在後續另一次執行啟動受保護轉換。

### ESLint 設定

**存在目的：** 承載模組／分層流、標準別名、單元入口、相對路徑逃逸、套件／全域物件
所有權、`selfOnly` 與選用規則關卡。

**內容：** `emitLint(blueprint, plugins)`、內建 Blueprint 外掛，以及需要的第三方外掛接線。

**管理權責與生命週期依專案現況而定：**

| 現況 | 結果 | 管理權責 |
|---|---|---|
| 尚無 ESLint 設定 | 建立 `eslint.config.mjs`。 | 只要保留 Blueprint 的首行產生標記，就由 Blueprint 完整管理，之後可重新產生。 |
| 現有設定是 Blueprint 產生 | 更新同一個檔案。 | Blueprint 完整管理。 |
| 已有手寫 flat config | 建立 `eslint.config.blueprint.mjs` 並顯示合併指示。 | 只供參考；導入方決定如何與既有規則整合，完成後刪除。 |
| 現有 flat config 已接上 `emitLint` | 不取代任何設定檔。 | 導入方管理。 |
| 存在舊式 `.eslintrc` | 產生 flat config 參考檔與遷移指示。 | 遷移決策由導入方負責。 |

Flat config 在相同作用範圍遇到同一規則時，後者會取代前者，不會合併選項。手動整合後，
可用 `blueprint doctor` 確認結構限制在最後的設定順序裡仍然有效。

### 架構手冊

**預設路徑：** `docs/architecture-handbook.md`  
**設定欄位：** `emit.handbook`

**存在目的：** 向人說明拓樸、相依圖、分層責任、命名、核心信念、元件軸線、規則與工作指南。

**管理權責：** Blueprint 完整管理解析後的目標檔案，每次更新都會覆寫。請修改設定權威，
不要直接編輯產生後的手冊。

**生命週期：** 只要建置／修復流程已有有效設定檔，就會寫入。若 `.gitignore` 會隱藏它，
`init` 會加入範圍精確的排除規則，避免架構契約消失在版本控制之外。

### Agent 守則 {#agent-contracts}

`emit.agents` 決定產出目標，每個目標都可改成自訂的專案相對路徑。省略時預設產生 Claude
與 AGENTS；空陣列代表不產生任何 Agent 守則。

| 目標 | 預設路徑 | 管理策略 |
|---|---|---|
| `claude` | `CLAUDE.md` | 與導入方共用，採標記區塊合併 |
| `agents` | `AGENTS.md` | 與導入方共用，採標記區塊合併 |
| `gemini` | `GEMINI.md` | 與導入方共用，採標記區塊合併 |
| `copilot` | `.github/copilot-instructions.md` | 與導入方共用，採標記區塊合併 |
| `cursor` | `.cursor/rules/blueprint.mdc` | Blueprint 完整管理 |
| `windsurf` | `.windsurf/rules/blueprint.md` | Blueprint 完整管理 |

**存在目的：** 讓架構事實與無法機械判斷的專案規則，出現在程式撰寫 Agent 平常會讀取的
上下文裡。

**內容：** 解析後的原始碼配置、相依與所有權邊界、命名、專案理念及驗證指令。Cursor 與
Windsurf 另有各自工具需要的 frontmatter。

**標記區塊合併：** Blueprint 只管理 `<!-- BLUEPRINT:START -->` 與
`<!-- BLUEPRINT:END -->` 之間的內容，標記外仍由導入方管理。既有共用檔案沒有標記時，
Blueprint 不會覆寫：

- 若檔案已提到 `@kekkai/blueprint`，`init` 會要求導入方替既有整合補上管理標記；
- 否則會建立 `CLAUDE.blueprint.md`、`AGENTS.blueprint.md` 等同層參考檔，並顯示明確合併步驟。

參考檔只是暫時的整合工具，不是第二份長期權威。

**完整管理檔案：** Cursor 與 Windsurf 規則檔每次更新都會完整取代。若某個目標從
`emit.agents` 移除，`init` 可刪除完全由 Blueprint 管理或只有產生內容的過期檔案；共用且
含手寫內容的文件不會被刪除，只會要求導入方處理過期標記區塊。

與架構手冊相同，若所選守則被 `.gitignore` 隱藏，`init` 會加入範圍精確的排除規則。

### 全新分層資料夾

全新的 **layer-first 預設設定**可在 `sourceRoot` 下建立缺少的分層資料夾，並放入
`.gitkeep`，讓空專案具有選定的預設結構。

既有原始碼樹不會為尚不存在的分層塞入空殼；module-first 也不會自行發明模組資料夾，
因為模組命名與所有權需要明確判斷。

## 暫存流程檔案

### `blueprint-authoring.md`

這份根目錄執行指南用於既有專案架構編寫、首次 module-first 導入，以及 layer-first ↔
module-first 轉換。內容包含實測專案證據、決策邊界、操作步驟、拒絕條件與驗收關卡，供人或
Agent 完成工作。

Blueprint 只在進行中的流程期間管理它。這不是架構權威，完成指南最後的清理步驟後必須
刪除；`doctor` 發現殘留檔案時會判定導入尚未完成。

全專案轉換只會在專案根目錄建立一份指南，並為每個已導入的應用程式保留各自的量測區段。
Blueprint 不會自動搬移應用程式原始碼；Agent 依指南使用能保留 Git 歷史的方式執行。

### `.claude/commands/blueprint-author.md`

這份啟動器只包含要求 Claude 開啟 `blueprint-authoring.md` 的短提示。只有解析後的架構編寫
政策包含 Claude 時才會建立；明確使用 `--agent codex` 不會產生，`--agent claude` 則會。
全專案轉換若遇到各應用程式政策互相衝突，會拒絕執行，不會任意挑一種啟動方式。

啟動器與架構編寫指南一樣，完成後要刪除；殘留時 `doctor` 會判定導入未完成。

### 參考與遷移交接檔

`*.blueprint.*`，特別是 `eslint.config.blueprint.mjs` 與 Agent 合併參考檔，只用來協助手動
整合。內容納入正式檔案後就應刪除；它們不是可反覆產生的產品權威，存在期間 `doctor` 會
持續回報導入尚未完成。

## `init` 可能更新的既有檔案

### `tsconfig.json`、被引用的 TypeScript 設定或 `jsconfig.json`

Blueprint 會確保標準 `architecture.alias` 與所有 `additionalAliases` 在
`compilerOptions.paths` 對應到設定的根目錄。

- 可安全解析的既有設定只會補上缺少項目，不取代其他欄位。
- 根 `tsconfig.json` 若只是 references 外殼，且應用程式設定存在，會沿引用找到實際目標。
- 完全沒有設定檔的 JavaScript 專案可能建立最小 `jsconfig.json`。
- TypeScript 設定無法安全修改時，Blueprint 會顯示明確的手動接線內容，不自行發明設定檔。

這些檔案仍由導入方管理；Blueprint 只加入缺少的別名，不改寫既有對應。

### Bundler 別名設定

全新的 Vite 建置若能安全修改，Blueprint 可加入標準別名。若現有設定已直接引用別名，或
透過 `tsconfig-paths` 接線外掛整合，就會保留原狀；其他情況會列出要由導入方套用的 Vite
或一般 bundler 對應方式。

Bundler 設定仍由導入方管理。TypeScript paths 本身無法證明執行期模組解析有效，因此
`doctor` 會檢查工具鏈接線，執行指南也會要求跑一次真實 build。

### `package.json` 與套件管理工具的 lockfile

全新建置可能加入一般 `lint` script；若已有不含 ESLint 的 lint 指令且修改語意明確，則會
在後方加上 ESLint。自訂架構專案若無法安全理解原本指令，只會顯示操作建議，不直接改寫。

除非使用 `--no-install`，`init` 會透過偵測到的 npm、pnpm 或 Yarn 指令安裝缺少的
Blueprint／ESLint 相依套件。`package.json` 與 lockfile 的變更由套件管理工具產生，
Blueprint 不會手寫 lockfile。工作區會依應用程式與工具鏈的實際根目錄判斷，不假設目前
目錄一定擁有 lockfile。

### `.gitignore`

若設定的架構手冊或所選 Agent 守則被現有 ignore 規則隱藏，`init` 會附加一組有標記、且
只針對目標路徑的 `!path` 例外。原檔案的換行格式會保留，也不會把整個上層目錄全面取消忽略。

其他 ignore 規則仍由導入方管理。

### `.blueprint-baseline.json` 與 `eslint-suppressions.json`

`init` 不會建立架構檢查基準線。`.blueprint-baseline.json` 由
`blueprint inspect --update-baseline` 建立或更新，再交給 `inspect --baseline` 當作既有債務。

`eslint-suppressions.json` 也不是 `init` 的產出；`doctor` 只確認其中沒有指向已不存在檔案的
過期項目。

## 驗證結果

完成整合或架構編寫後執行：

```bash
npx @kekkai/blueprint inspect --baseline
npx @kekkai/blueprint doctor --json
```

若自動化流程不能接受 Doctor 跳過檢查，請判讀 JSON，而不是只看 exit code。專案平常的 lint
與 build 也要各自執行，才能證明合併後的 ESLint 與別名設定真的能在現有工具鏈運作。
