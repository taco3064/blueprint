# 產出檔案

`init` 會在執行前或執行當下列出每一項動作。實際內容取決於專案現況、拓樸、`emit` 路徑、
所選 Agent，以及既有整合能否安全合併。要確認特定專案會發生什麼，請以 `--dry-run` 的
預覽為準：

```bash
npx @kekkai/blueprint init --topology layer-first --dry-run
```

本頁將副作用分成三類：

1. 長期保留的 Blueprint 設定與產出；
2. 編寫、轉換或升級期間使用的暫存交接檔案；
3. `init` 可能更新的既有專案檔案。

解除 Blueprint 導入時，[`remove`](/zh-TW/commands#remove) 要刪除、移除區塊、還原或保留哪些內容，<br>
也由同一套所有權規則決定。

## 長期設定與產出

### `blueprint.config.mjs`

**存在目的：** 導入完成後，作為架構權威。

**內容：** 框架、原始碼根目錄、layer-first 或 module-first 結構、依賴與所有權規則、專案
理念及產出政策。詳見[設定](/zh-TW/configuration)。

**管理權責：** 架構決策屬於導入方。Blueprint 可建立已知預設設定，但不會根據資料夾形狀
暗中以預設設定或推測結果覆蓋自訂設定檔。

**生命週期：** 預設設定流程會建立此檔，包含沒有原始碼時的 module-first 起點；<br>
架構編寫指南則要求 Agent 建立。後續 `init` 會先
載入並驗證，再更新其他產出。Blueprint 3.2 設定會先正規化成受支援的 4.0 layer-first
格式，作為可復原檢查點；若要改成相反拓樸，必須在後續另一次執行啟動受保護轉換。<br>
正規化直接修改設定檔本身的原始碼：移除 `architecture.module` 與每一層的 `module`，<br>
只在遷移後的值和 4.x 預設不同時補上 `layout` / `entry`。<br>
預設設定的呼叫、`defineBlueprint`、註解以及其他所有內容都維持原樣。

### `.blueprint-lifecycle.json`

**用途：** 記錄 Blueprint 的生命週期檢查點，以及 `upgrade`、`remove` 判斷所有權時需要的可證明事實。

**內容：** 包含生命週期格式版本、專案已完成的 Blueprint 生命週期版本、已完成的升級操作、目前是否有尚未完成的升級，以及各個已導入應用程式的 Blueprint 所有權紀錄。所有權紀錄可能包含 Blueprint 完整產生或建立的檔案、管理的文件區塊、對共用檔案做過且可精確還原的修改、建立的資料夾，以及安裝的相依套件。

**管理權責：** 這個檔案由 Blueprint 完整管理，應提交進版本控制，不要手動修改。它只記錄運作狀態與所有權歷史，不是架構設定；`blueprint.config.mjs` 仍是架構、拓樸與規則的唯一權威。

**生命週期：** 第一次導入開始產生可證明由 Blueprint 擁有的內容時，就會建立這個檔案。若導入途中失敗，已經落地內容的所有權紀錄仍會保留，但不會因此把目前的 Blueprint 版本記成已完成的生命週期；下一次成功完成 `init` 後，才會建立完成檢查點。之後的 `init`、`upgrade` 與其他受支援流程會持續更新可證明的所有權紀錄。

`upgrade` 會先記錄尚未完成的升級，再開始修改專案；只有升級工作與驗證全部完成後，才會推進生命週期檢查點。移除最後一個已導入的應用程式時，`remove` 會一併刪除這個檔案。

在生命週期狀態功能加入之前就已導入 Blueprint 的專案，可以從受支援且可證明的套件與設定證據建立初始檢查點；在那之前做過、但無法證明所有權的修改，不會被自動當成 Blueprint 擁有。

如果生命週期狀態損壞、內容無法驗證，或 Git 歷史能證明它曾經存在但目前檔案已遺失，Blueprint 會停止需要這份狀態的操作，不會自行重建或猜測歷史；無法取得完整 Git 歷史時也同樣停止。請先從版本控制或其他可信來源還原，再重新執行原本的指令。

如果這個檔案目前不存在，而且完整 Git 歷史中所有目前可追溯的 ref 都找不到曾包含這個檔案的 commit，Blueprint 不會把它視為遺失，因為現有版本控制證據無法證明 lifecycle 曾經成立；這個專案會被當成生命週期狀態功能加入之前就已導入的專案。Git 無法區分「套件被直接升級」和「導入後從未提交這個檔案、之後又刪掉」，所以請把這個檔案提交進版本控制，讓後續遺失時有可恢復的歷史依據。

**寫入安全性：** Blueprint 更新生命週期狀態時，不會直接覆寫正式檔案。新狀態會先完整寫入同目錄的 `.blueprint-lifecycle.json.tmp`，確認寫入完成後，再以檔案替換方式更新 `.blueprint-lifecycle.json`。如果暫存檔寫入失敗，原本的生命週期狀態會保持不變。

`.blueprint-lifecycle.json.tmp` 只是寫入過程中的暫存檔，永遠不會被當成生命週期權威讀取。若先前的中斷留下暫存檔，後續安全移除 Blueprint 時也會一併清理。

### ESLint 設定

**存在目的：** 承載模組／分層流、標準別名、單元入口、相對路徑逃逸、套件／全域物件
所有權、`selfOnly` 與選用規則關卡。

**內容：** `emitLint(blueprint, plugins)`、內建 Blueprint 外掛，以及需要的第三方外掛接線。

**管理權責與生命週期依專案現況而定：**

- **尚無 ESLint 設定**
  - 結果：建立 `eslint.config.mjs`。
  - 管理權責：只要保留 Blueprint 的首行產生標記，就由 Blueprint 完整管理，之後可重新產生。
- **現有設定是 Blueprint 產生**
  - 結果：更新同一個檔案。
  - 管理權責：Blueprint 完整管理。
- **已有手寫 flat config**
  - 結果：建立 `eslint.config.blueprint.mjs` 並顯示合併指示。
  - 管理權責：只供參考；導入方決定如何與既有規則整合，完成後刪除。
- **現有 flat config 已接上 `emitLint`**
  - 結果：不取代任何設定檔。
  - 管理權責：導入方管理。
- **存在舊式 `.eslintrc`**
  - 結果：產生 flat config 參考檔與遷移指示。
  - 管理權責：遷移決策由導入方負責。

若選定的應用程式位於 repository-level flat config 下方，該上層設定仍是實際生效的政策；
`init` 不會在應用程式內建立會遮蔽它的 live config。若先前的 Blueprint 執行留下這類產生
檔，`init` 會移除該產生檔並改寫一份可直接合併至 repository root 的參考設定；手寫的下層
設定絕不會被移除。參考設定會從 repository 路徑匯入應用程式 blueprint，並為
`emitLint(..., { basePath: applicationRoot })` 計算絕對 `applicationRoot`。解析器與防繞過規則
也使用相同的原生 flat config `basePath`，因此無論從 repository 或應用程式目錄執行 ESLint，
Blueprint 規則與既有 repository 規則都會涵蓋選定的應用程式。

Flat config 在相同作用範圍遇到同一規則時，後者會取代前者，不會合併選項。手動整合後，
可用 `blueprint doctor` 確認結構限制在最後的設定順序裡仍然有效。

產生的架構手冊與 Agent 守則會區分「僅供參考的 lint 設定」與「已驗證的專案 lint 整合」。
設定檔提到 Blueprint，不代表規則真的會執行。合併後請重新執行 `init`；它會檢查有效規則
是否保留，並安全重跑專案 lint 指令，取得證據後才更新文件中的執行保證。證據不足時，
文件會明確保留「尚未驗證」或「僅供參考」的說明。

### 架構手冊

**預設路徑：** `docs/architecture-handbook.md`  
**設定欄位：** `emit.handbook`

**存在目的：** 向人說明拓樸、相依圖、分層責任、命名、核心信念、元件軸線、規則與工作指南。<br>
Module-first 的架構手冊還會標明應用程式是否仍是空的模組起點，並附上給未來產品需求用的模組成長流程。

**管理權責：** Blueprint 完整管理解析後的目標檔案，每次更新都會覆寫。請修改設定權威，
不要直接編輯產生後的手冊。

**生命週期：** 只要建置／修復流程已有有效設定檔，就會寫入。若 `.gitignore` 會隱藏它，
`init` 會加入範圍精確的排除規則，避免架構契約消失在版本控制之外。

### Agent 守則 {#agent-contracts}

`emit.agents` 決定產出目標，每個目標都可改成自訂的專案相對路徑。省略時預設產生 Claude
與 AGENTS；空陣列代表不產生任何 Agent 守則。

- **`claude`** — 預設路徑：`CLAUDE.md`；與導入方共用，採標記區塊合併。
- **`agents`** — 預設路徑：`AGENTS.md`；與導入方共用，採標記區塊合併。
- **`gemini`** — 預設路徑：`GEMINI.md`；與導入方共用，採標記區塊合併。
- **`copilot`** — 預設路徑：`.github/copilot-instructions.md`；與導入方共用，採標記區塊合併。
- **`cursor`** — 預設路徑：`.cursor/rules/blueprint.mdc`；Blueprint 完整管理。
- **`windsurf`** — 預設路徑：`.windsurf/rules/blueprint.md`；Blueprint 完整管理。

**存在目的：** 讓架構事實與無法機械判斷的專案規則，出現在程式撰寫 Agent 平常會讀取的
上下文裡。

**內容：** 解析後的原始碼配置、相依與所有權邊界、命名、專案理念及驗證指令。Cursor 與
Windsurf 另有各自工具需要的 frontmatter。<br>
Module-first 時，新的產品邊界會導向模組成長流程，而不是禁止成長；<br>
內部分層、規則與門檻仍由 owner 決定。

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

既有原始碼樹不會為尚不存在的分層塞入空殼；module-first 也不會自行發明模組資料夾。<br>
Module-first 起點一個模組都沒有；等產品需求提出證據，再透過模組成長流程建立，<br>
既有原始碼則需要架構編寫時的明確判斷。

## 暫存流程檔案

### `blueprint-authoring.md`

這份根目錄執行指南用於既有專案架構編寫（包含以 module-first 導入既有原始碼）、<br>
以 `--authoring` 強制產生時，以及 layer-first ↔ module-first 轉換。內容包含實測專案證據、決策邊界、操作步驟、拒絕條件與驗收關卡，供人或
Agent 完成工作。

Blueprint 只在進行中的流程期間管理它。這不是架構權威，完成指南最後的清理步驟後必須
刪除；`doctor` 發現殘留檔案時會判定導入尚未完成。

全專案轉換只會在專案根目錄建立一份指南，並為每個已導入的應用程式保留各自的量測區段。
Blueprint 不會自動搬移應用程式原始碼；Agent 依指南使用能保留 Git 歷史的方式執行。

### `blueprint-transformation.json`

layer-first → module-first 工作也會在各應用程式建立這份供機器讀取的轉換義務。內容記錄可復原
的 Git 起始 commit、應用程式與原始碼範圍、框架／路由位置，以及量測到的 `pages`、`app`、
`containers` 來源成員。Agent 必須在 `target.decisions` 記錄每一項經確認的來源 → 目的地決策；
僅把設定檔換成有效的 module-first 設定，不能消除這項義務。Blueprint 在寫入指南之前，會先把
不可任意修改的起始資料保存在各應用程式專屬的 `refs/blueprint/transformations/` Git ref。
刪除 JSON 或修改其起始資料後，一般 init 會拒絕繼續，直到原始證據恢復。這些 ref 屬於目前
的 Git repository，一般 clone 不會自動傳送。整個 repository 的登錄使用單一 Git 原子交易，
一次建立所有應用程式的 ref；若登錄失敗，不會留下部分應用程式已登錄的狀態，修正 Git 存取問題後可重試。

初次寫入工作檔失敗，或 JSON 後來被刪除時，請在受影響的應用程式執行
`blueprint init --recover-transformation`。復原會驗證保留資料的格式、起始 HEAD 與應用程式範圍，
補回缺少的 JSON 與精簡復原指南，並完整保留現有有效 JSON 及決策的原始內容。它不會產生一般採用檔案、
修改原始碼、啟動 Agent 或退役義務。補回的 JSON 只有初始決策；因刪檔遺失的編輯必須重新確認。
`--dry-run` 僅預覽而不寫入，復原不能搭配其他 init 選項。HEAD 已改變或保留範圍不安全時會拒絕復原。
整個 repository 的工作檔寫入失敗後，各應用程式可分別復原自己的證據。

每項決策包含 `source`、`destinations` 與 `members: [{ source, destination }]`。每個來源成員
都必須恰好對應一個目的地，且不同成員不能共用同一目的地。Blueprint 會比對 Git 起始內容與
目的地內容，要求保留相同副檔名，且只允許 CRLF 正規化，以及 ESM import/export、字串常值動態 import、未被區域宣告遮蔽的
CommonJS `require()` 與 TypeScript import-equals 的模組路徑改寫。被區域宣告遮蔽的 `require`
呼叫與執行期運算式必須保持不變。其他內容修改須等這次可驗證
的搬移完成後再進行；僅有檔案存在或指向無關的既有模組，不能證明完成轉移。

下一次執行 `init --topology module-first` 會核對 Git 來源清單、保留的 `app` 路由組裝、
container seeds 是否已被模組吸收、目的地位置、目前的 import analysis 與未套用 baseline 的所有架構錯誤。要求不同 topology 時，必須先完成
目前義務的退役，否則會拒絕執行。只有
驗證成功才能退役這份檔案與轉換指南。`--authoring` 明確代表重新編寫架構，不能當作歷史轉換
證明。沒有待完成 Git 轉換義務的手寫 module-first 專案仍可刻意使用 `pages`、`containers` 等自訂 layer
名稱；Doctor 與 Inspect 證明的是目前設定，而不是過去曾完成轉換。

### `.claude/commands/blueprint-author.md`

這份啟動器只包含要求 Claude 開啟 `blueprint-authoring.md` 的短提示。只有解析後的架構編寫
政策包含 Claude 時才會建立；明確使用 `--agent codex` 不會產生，`--agent claude` 則會。
全專案轉換若遇到各應用程式政策互相衝突，會拒絕執行，不會任意挑一種啟動方式。

啟動器與架構編寫指南一樣，完成後要刪除；殘留時 `doctor` 會判定導入未完成。

### `blueprint-upgrade.md`

當最終升級計畫仍包含需要人或程式撰寫 Agent 判斷的語意操作時，`upgrade` 會在專案生命週期根目錄產生 `blueprint-upgrade.md`。

這份檔案只包含整個「起始版本 → 目標版本」區間解析後仍然有效的操作，並依正確順序列出每項操作適用的應用程式、Blueprint 已量測到的證據、要執行的工作、驗證方式，以及目前是否已完成。

已被取消的操作不會出現在待執行計畫裡；被新操作取代的舊操作也不會要求 Agent 再做一次。若舊操作過去已經執行過，取代它的新操作會明確負責把既有結果收斂到目前版本需要的最終狀態。

`blueprint-upgrade.md` 是暫時的執行指南，不是生命週期紀錄。每完成一項操作，都要透過：

```bash
npx blueprint upgrade --complete <operation-id>
```

把完成狀態寫回 `.blueprint-lifecycle.json`。

只要升級還沒完成，Blueprint 都會依目前的 pending state 重新產生這份檔案；整個升級完成後，它就會被刪除。

### 參考與遷移交接檔

`*.blueprint.*`，特別是 `eslint.config.blueprint.mjs` 與 Agent 合併參考檔，只用來協助手動
整合。內容納入正式檔案後就應刪除；它們不是可反覆產生的產品權威，未完成整合時 `doctor` 會回報；legacy ESLint 遷移參考檔的保留條件見下方補充。

## `init` 可能更新的既有檔案

### `tsconfig.json`、被引用的 TypeScript 設定或 `jsconfig.json`

Blueprint 會確保標準 `architecture.alias` 與所有 `additionalAliases` 在
`compilerOptions.paths` 對應到設定的根目錄。

- 可安全解析的既有設定只會補上缺少項目，不取代其他欄位。
- 根 `tsconfig.json` 若只是 references 外殼，且應用程式設定存在，會沿引用找到實際目標。
- 完全沒有設定檔的 JavaScript 專案可能建立最小 `jsconfig.json`。
- TypeScript 設定無法安全修改時，Blueprint 會顯示明確的手動接線內容，不自行發明設定檔。

這些檔案仍由導入方管理；Blueprint 只加入缺少的別名，不改寫既有對應。

對支援的 JSON 編輯，除了插入別名屬性，其餘原始內容皆保持不變，包括單行陣列、縮排與換行格式。

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

### 舊設定與驗證範圍補充

3.2 設定改寫前，`init` 會將包含註解的完整原文保存在旁邊的
`blueprint.config.mjs.pre-v4-<sha256>`。寫入訊息會提示 `architecture.module.private`
沒有 4.0 替代宣告；宣告治理語意等價前，必須檢視原始政策。備份是專案證據，不會被當作設定載入。<br>
如果這些鍵不是設定檔裡直接寫出的屬性（由輔助函式組出、用展開帶入，或是計算出來的），<br>
`init` 不會動這個檔案的任何一個位元組，也不寫備份，而是點名需要手動改寫的鍵。

`target.decisions.destinations` 必須恰好列出每個 `members` 的目的**檔案**路徑，
例如 `["src/app/Game.tsx"]`，不能填 `["src/app"]` 等模組或單元目錄。

使用 legacy ESLint 時，應保留 `eslint.config.blueprint.mjs`，直到專案負責人決定並完成
flat config 遷移。Doctor 不再要求提前刪除此參考檔；ESLint 尚未接線的獨立檢查仍會顯示未完成。

Doctor 會檢查應用程式目錄與實際 ESLint 設定目錄內的 suppressions ledger；
每筆檔案路徑都以該 ledger 所在目錄解析。
