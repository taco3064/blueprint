# 實測相容性

每個版本除了單元測試之外，均以真實專案的實際導入進行驗證。此驗證由兩層自動化機制支撐：其一為**導入端對端測試套件**（五種納入版本控制的範本複製品 —— Vite React 與 Vue、Next、turbo + pnpm 工作區套件、以及植入既有債務的既有專案 —— 於每次提交、推送與發佈時完整執行初始化、檢測與基準流程）；其二為**每週地形檢查**，以最新的上游範本實際建置專案並執行導入，範本形態漂移時自動開立 issue。本頁記錄實際執行過的情境、結果與注意事項，供使用者判斷哪些環境已經驗證、哪些仍屬未知領域。

## 已驗證且通過

| 環境 | 專案形態 | 結果 |
|---|---|---|
| **Vite + Vue 3（JavaScript、pnpm）** | 489 個檔案的正式產品，既有 structure-lint 治理與手寫的 CLAUDE.md | 依蒐證數據與專案自身的意圖文件推導組態；**零檢測項目**；`emitLint` 併入既有的 flat config（結構規則與原有檢查工具證實等價）；契約依手寫 CLAUDE.md 自身的結構完成整合；完整測試套件（4,196 項）通過。未修改任何原始碼。 |
| **Vite + React + TypeScript（npm、舊制 `.eslintrc`）** | 852 個檔案的正式產品，先前無結構治理 | 依蒐證數據推導組態；**246 項真實檢測項目**鎖定為基準（包含一條真實的 `services → types → resources → services` 循環依賴）；採用分層各異的模組配置（`resources` 為資料夾式模組）。舊制 ESLint 組態的遷移列為待決事項，不強制執行。 |
| **create-vite `react-ts`**（全新） | 全新專案 | 單一指令完成：預設藍圖建置、精簡契約，程式碼檢查、架構檢測與建置全數通過。 |
| **create-vite `vue-ts`**（全新） | 全新專案 | 同上，另附範本整理指引：起始範本的 `../assets` 相對匯入違反預設藍圖 —— init 逐項列出違規位置與修正方式（接上匯入別名，共三處小幅修改）。 |
| **create-next-app —— App Router、`src/`、TypeScript** | 全新專案 | 單一指令：自動選用 `nextPreset`（偵測 router 與 srcDir），組態 `app` → `components` → `hooks` → `lib`，架構檢測與 `next build` 全數通過；手寫的 CLAUDE / AGENTS 不動。 |
| **Next.js —— App Router 位於專案根（無 `src/`）** | 全新專案 | 以 `sourceRoot: '.'` 掃描根層的 `app/` 目錄樹；對其反向匯入照常攔截。 |
| **Next.js —— Pages Router（`src/pages`）** | 全新專案 | `pages/` 為頂層；`pages/api/*` handler 向下匯入 `lib`，無違規。 |
| **Monorepo：turbo + pnpm** | 以套件為單位導入 | 支援模式：於各套件目錄內執行 `blueprint init`（`pnpm --filter <pkg> exec …`）。套件管理工具自**工作區根目錄**偵測（向上層目錄尋找 lockfile 與 `pnpm-workspace.yaml`）。Blueprint 必須為該套件自身的開發依賴，契約中的 `node_modules` 連結方能解析。持續整合建議以 turbo 任務逐套件接入（`"inspect": "blueprint inspect --baseline"`），不使用 `emit.ci`。 |

## 框架注意事項

- **Next.js**：`init` 會偵測路由樹（`app/` 與／或 `pages/`，位於 `src/` 或專案根），產出 `nextPreset` —— 路由目錄即頂層、扁平模組配置，且**不設 `fetch` 歸屬**（server component 本就到處 fetch，強加限制即為造假）。兩種 router 收斂為同一形態；匯入皆為顯式，依賴圖真實、強制有效。
- **Vue 單檔元件**：`<script setup>` 的匯入與一般原始碼相同納入掃描；Vite 起始範本需將三處資源匯入改走匯入別名。
- **既有結構治理工具並存**（structure-lint、dependency-cruiser）：將 Blueprint 接於其後時，同名規則由 Blueprint 的語意接管（已於實測專案證實等價）；治理工具的整併列為團隊決策事項，不擅自執行。

## 不支援

- **Nuxt** —— Nuxt 的 auto-import 不留任何 `import` 陳述句，而 Blueprint 透過**靜態匯入分析**強制依賴流。其依賴圖將近乎空集合、回報空洞的「乾淨」—— 比不檢查更糟。`init` 對 Nuxt 專案直接拒絕，不產出假性通過的設置。（未來若加入框架 auto-import 還原器可改變此結論，但那是實打實的工程，暫無規劃。）

## 尚未驗證

Remix / React Router 框架模式、Windows 路徑、經 `extends` 鏈繼承的 tsconfig `paths`（偵測遺漏時可以 `--alias` 參數補足）。若您在上述環境執行 Blueprint，無論結果通過與否，[回報 issue](https://github.com/taco3064/blueprint/issues) 都是最有價值的貢獻。
