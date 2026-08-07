# 實測相容性

每個版本除了單元測試之外，都會實際在真實專案上跑一次導入來驗證。<br>
本頁記錄實際跑過的情境、結果與注意事項，讓你判斷哪些環境已經驗證過、哪些還是未知領域。

## 這一頁背後有什麼

五層，每一層存在的理由都是：它底下那一層碰到真實缺陷時會通過。

- **導入一致性測試套件** —— 五種納入版本控制的範本（Vite React 與 Vue、Next、turbo + pnpm workspace 套件、以及植入既有債務的既有專案），每次 commit、push 與發佈都完整跑一遍 init、inspect 與 baseline 流程，用的是本 repo 自己開發依賴裡那份真正的 ESLint。
- **兩套作業系統，而且兩邊都要回報** —— CI 在 `ubuntu-latest` 與 `windows-latest` 上各跑一次完整檢核，任一邊失敗都不准被另一邊蓋掉。<br>
  這個工具會去讀寫別人的 repo，為此帶了好幾條專門處理 Windows 的分支；在 posix 上那些分支等同空操作，所以它們的行為以前從來沒被實際觀察過。<br>
  另有一條獨立的流程：用當前版本的 Node 建置，再把建置產物拿到 `18.18.0` 上執行 —— `engines` 宣告的下限是被跑出來的，不是宣稱的。
- **`npm run dist:verify`** —— 行程內測試碰不到的那一層：它實際執行 `dist/bin.js`、解析 `bin` 欄位、匯入套件進入點。<br>
  它存在的理由是 0.1.1 的那個 bug —— npm 會把 bin 裝成 symlink，少了 `realpathSync` 會讓發佈出去的 CLI 什麼都沒做就以 exit 0 收場，**而這個狀態在每一項行程內測試裡都是通過的**。<br>
  CI 建置後跑一次，實際發佈的那個 job 再跑一次，因為 npm 收到的產物是那個 job 產出來的。
- **每週的地形檢查** —— 用最新的上游 `create-vite` 與 `create-next-app` 範本實際建專案跑導入，範本長相漂移時自動開 issue。<br>
  刻意排除在 PR 檢核之外：它依賴網路，而且變數在上游。
- **真實導入測試** —— 讓真正的 agent CLI 帶著真實 repo 走過 `init` → `inspect` → `impact` → `doctor`，全程無人介入，最後用真的 doctor 驗收。<br>
  它負責找**新的**情境；已知的情境交給一致性測試套件顧著，在那裡失敗的情境會連同修正一起變成常駐案例。<br>
  逐項的來龍去脈是公開的，就在本 repo 已關閉的 [`field-run` issues](https://github.com/taco3064/blueprint/issues?q=is%3Aissue+label%3Afield-run)。

**突變測試是 3.0.0 之後才有的**，它稽核的是測試套件本身 —— 問的不是「這行有沒有被測到」，而是「這行如果被改錯，斷言接不接得住」。<br>
測試套件因此大約翻倍，而其中大部分找出來的，都是「原始碼改錯了也會帶著全綠的測試出貨」的地方。<br>
它是需要時手動跑，刻意不當成 gate：分數門檻會是一個每次改 code 就失效的數字，而這個專案的立場是不要一種沒人能安撫的紅燈。

## 已驗證且通過

**Vite + Vue 3（JavaScript、pnpm）**
- 專案形態 —— 489 個檔案的正式產品，既有 structure-lint 治理與手寫的 CLAUDE.md
- 結果 —— 依蒐證數據與專案自身的意圖文件推導 config；**零檢測項目**；`emitLint` 併入既有的 flat config（結構規則與原有檢查工具證實等價）；守則依手寫 CLAUDE.md 自身的結構完成整合；完整測試套件（4,196 項）通過。未修改任何原始碼。

**Vite + React + TypeScript（npm、舊制 `.eslintrc`）**
- 專案形態 —— 852 個檔案的正式產品，先前無結構治理
- 結果 —— 依蒐證數據推導 config；**246 項真實檢測項目**鎖定為基準（包含一條真實的 `services → types → resources → services` 循環依賴）；採用分層各異的模組配置（`resources` 為資料夾式模組）。舊制 ESLint config 的遷移列為待決事項，不強制執行。

**create-vite `react-ts`（全新）**
- 專案形態 —— 全新專案
- 結果 —— 單一指令完成：preset 建置、精簡守則，程式碼檢查、架構檢測與建置全數通過。

**create-vite `vue-ts`（全新）**
- 專案形態 —— 全新專案
- 結果 —— 同上，另附範本整理指引：起始範本的 `../assets` 相對匯入違反 preset —— init 逐項列出違規位置與修正方式（接上匯入別名，共三處小幅修改）。

**create-next-app —— App Router、`src/`、TypeScript**
- 專案形態 —— 全新專案
- 結果 —— 單一指令：自動選用 `nextPreset`（偵測 router 與 srcDir），config `app` → `components` → `hooks` → `lib`，架構檢測與 `next build` 全數通過；手寫的 CLAUDE / AGENTS 不動。

**Next.js —— App Router 位於專案根（無 `src/`）**
- 專案形態 —— 全新專案
- 結果 —— 以 `sourceRoot: '.'` 掃描根層的 `app/` 目錄樹；對其反向匯入照常攔截。

**Next.js —— Pages Router（`src/pages`）**
- 專案形態 —— 全新專案
- 結果 —— `pages/` 為頂層；`pages/api/*` handler 向下匯入 `lib`，無違規。

**Monorepo：turbo + pnpm**
- 專案形態 —— 以套件為單位導入
- 結果 —— 支援模式：於各套件目錄內執行 `blueprint init`（`pnpm --filter <pkg> exec …`）。套件管理工具自**工作區根目錄**偵測（向上層目錄尋找 lockfile 與 `pnpm-workspace.yaml`）。Blueprint 必須為該套件自身的開發依賴，守則中的 `node_modules` 連結方能解析。建議以 turbo 任務逐套件接入 `blueprint inspect --baseline`（`"inspect": "blueprint inspect --baseline"`），再照你原本 gate monorepo 的方式接上即可。

## 框架注意事項

- **Next.js**：`init` 會偵測路由樹（`app/` 與／或 `pages/`，位於 `src/` 或專案根），產出 `nextPreset` ——<br>
  路由目錄即頂層、扁平模組配置，且**不設 `fetch` 歸屬**（server component 本就到處 fetch，強加限制即為造假）。<br>
  兩種 router 收斂為同一形態；匯入皆為顯式，依賴圖真實、強制有效。
- **Vue 單檔元件**：`<script setup>` 的匯入與一般原始碼相同納入掃描；<br>
  Vite 起始範本需將三處資源匯入改走匯入別名。
- **Legacy ESLint（`.eslintrc` / v8）**：導入成本會從「跑個指令」跳成「一次遷移決策」——<br>
  flat-config 遷移由你拍板，且 ESLint 原生的 suppressions 帳本需要 ≥ 9.24。<br>
  遷移前的過渡姿勢是 severity `'warn'`（代價：新的度量債不擋）；完整 doctrine 見[弄紅，然後上棘輪](/zh-TW/guide/ai-adoption#既有債務-——-弄紅-然後上棘輪)。
- **上游 plugin 的規則漂移**：規則改名（例如 typescript-eslint v8 把 `no-var-requires` 併進 `no-require-imports`）會讓舊的 disable 註解在合併途中變 stale ——<br>
  只有真的跑起 lint 才會浮現；逐條當合併決策處理，不是 blocker。
- **Windows**：每次 commit 都會在上面跑完整套檢核，所以那些做路徑正規化的分支（`scan`、`ignored`、`impact`、相對路徑逃逸規則）是被實際執行的，不是用推論的。<br>
  在這個平台上有一件事值得知道：**CRLF 換行的 `tsconfig.json`**（Windows 的預設）以前會掉進「請自己補上這些 paths」那條路，匯入別名沒被接上，而且什麼都不會說。<br>
  現在換行字元是從檔案本身讀出來的，這同時也避免了改動把兩種換行慣例混進同一個檔案 —— 那會被你自己的 `linebreak-style` 規則抓。
- **既有結構治理工具並存**（structure-lint、dependency-cruiser）：將 Blueprint 接於其後時，同名規則由 Blueprint 的語意接管（已於實測專案證實等價）；<br>
  治理工具的整併列為團隊決策事項，不擅自執行。

## 不支援

- **Nuxt** —— blueprint 是依賴**靜態匯入分析**強制依賴流向在運作的，但 Nuxt 的自動匯入使原始碼不含 import 敘述，這對於 blueprint 來說完全失去檢查依據，<br>
  經評估後是選擇不支援 Nuxt 專案：`init` 會直接拒絕，而不是產出一個什麼都查不到的假綠燈。<br>
  （未來若補上框架 auto-import 的還原器有機會翻案，但那是實打實的工程，目前沒有規劃。）

## 尚未驗證

Remix / React Router 框架模式、經 `extends` 鏈繼承的 tsconfig `paths`（偵測遺漏時可以 `--alias` 參數補足）。<br>
如果你在上述環境跑過 blueprint，無論結果通過與否，[回報 issue](https://github.com/taco3064/blueprint/issues) 都是最有價值的貢獻。
