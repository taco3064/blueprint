# 實測相容性

每個版本除了單元測試之外，都會實際在真實專案上跑一次導入來驗證。<br>
背後有兩層自動化在撐：其一是**導入 e2e 測試套件**（五種納入版本控制的範本 —— Vite React 與 Vue、Next、turbo + pnpm workspace 套件、以及植入既有債務的既有專案 —— 每次 commit、push 與發佈都完整跑一遍 init、inspect 與 baseline 流程）；<br>
其二是**每週的地形檢查**，用最新的上游範本實際建專案跑導入，範本長相漂移時自動開 issue。<br>
本頁記錄實際跑過的情境、結果與注意事項，讓你判斷哪些環境已經驗證過、哪些還是未知領域。

## 已驗證且通過

| 環境 | 專案形態 | 結果 |
|---|---|---|
| **Vite + Vue 3（JavaScript、pnpm）** | 489 個檔案的正式產品，既有 structure-lint 治理與手寫的 CLAUDE.md | 依蒐證數據與專案自身的意圖文件推導 config；**零檢測項目**；`emitLint` 併入既有的 flat config（結構規則與原有檢查工具證實等價）；守則依手寫 CLAUDE.md 自身的結構完成整合；完整測試套件（4,196 項）通過。未修改任何原始碼。 |
| **Vite + React + TypeScript（npm、舊制 `.eslintrc`）** | 852 個檔案的正式產品，先前無結構治理 | 依蒐證數據推導 config；**246 項真實檢測項目**鎖定為基準（包含一條真實的 `services → types → resources → services` 循環依賴）；採用分層各異的模組配置（`resources` 為資料夾式模組）。舊制 ESLint config 的遷移列為待決事項，不強制執行。 |
| **create-vite `react-ts`**（全新） | 全新專案 | 單一指令完成：預設藍圖建置、精簡守則，程式碼檢查、架構檢測與建置全數通過。 |
| **create-vite `vue-ts`**（全新） | 全新專案 | 同上，另附範本整理指引：起始範本的 `../assets` 相對匯入違反預設藍圖 —— init 逐項列出違規位置與修正方式（接上匯入別名，共三處小幅修改）。 |
| **create-next-app —— App Router、`src/`、TypeScript** | 全新專案 | 單一指令：自動選用 `nextPreset`（偵測 router 與 srcDir），config `app` → `components` → `hooks` → `lib`，架構檢測與 `next build` 全數通過；手寫的 CLAUDE / AGENTS 不動。 |
| **Next.js —— App Router 位於專案根（無 `src/`）** | 全新專案 | 以 `sourceRoot: '.'` 掃描根層的 `app/` 目錄樹；對其反向匯入照常攔截。 |
| **Next.js —— Pages Router（`src/pages`）** | 全新專案 | `pages/` 為頂層；`pages/api/*` handler 向下匯入 `lib`，無違規。 |
| **Monorepo：turbo + pnpm** | 以套件為單位導入 | 支援模式：於各套件目錄內執行 `blueprint init`（`pnpm --filter <pkg> exec …`）。套件管理工具自**工作區根目錄**偵測（向上層目錄尋找 lockfile 與 `pnpm-workspace.yaml`）。Blueprint 必須為該套件自身的開發依賴，守則中的 `node_modules` 連結方能解析。建議以 turbo 任務逐套件接入 `blueprint inspect --baseline`（`"inspect": "blueprint inspect --baseline"`），再照你原本 gate monorepo 的方式接上即可。 |

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
- **既有結構治理工具並存**（structure-lint、dependency-cruiser）：將 Blueprint 接於其後時，同名規則由 Blueprint 的語意接管（已於實測專案證實等價）；<br>
  治理工具的整併列為團隊決策事項，不擅自執行。

## 不支援

- **Nuxt** —— blueprint 是依賴**靜態匯入分析**強制依賴流向在運作的，但 Nuxt 的自動匯入使原始碼不含 import 敘述，這對於 blueprint 來說完全失去檢查依據，<br>
  經評估後是選擇不支援 Nuxt 專案：`init` 會直接拒絕，而不是產出一個什麼都查不到的假綠燈。<br>
  （未來若補上框架 auto-import 的還原器有機會翻案，但那是實打實的工程，目前沒有規劃。）

## 尚未驗證

Remix / React Router 框架模式、Windows 路徑、經 `extends` 鏈繼承的 tsconfig `paths`（偵測遺漏時可以 `--alias` 參數補足）。<br>
如果你在上述環境跑過 blueprint，無論結果通過與否，[回報 issue](https://github.com/taco3064/blueprint/issues) 都是最有價值的貢獻。
