# 安全與信任

由於此套件的部分功能會在使用者機器上操作 AI Agent 來協助導入，希望以下聲明可以釐清使用者在安全性上的疑慮 —— 每項聲明均可於原始碼中查證。

## 預設不啟動任何 AI Agent —— 除非使用者明確要求

blueprint **為 AI Agent 準備素材，預設不代替使用者操作 Agent**。它產出的是純 markdown 格式的守則檔（`CLAUDE.md`、`AGENTS.md`、Cursor 與 Windsurf 規則檔），在既有專案上另產出一份導入作業手冊，完成後即交棒。它**不會**設定 `claude`、`codex` 或任何 Agent CLI，亦不會向其進行身分驗證。此套件不存在憑證、權杖或授權介面：`init`、`survey`、`inspect` 所執行的分析均為決定性的檔案操作，而非 Agent 呼叫。

唯一的例外必須由使用者明確啟用：`init --agent claude|codex` 會以導入作業手冊為輸入，啟動**使用者自己的** Agent CLI。此選項的安全邊界如下：

- **執行前先印出完整指令** —— 與使用者親自貼上執行的指令完全相同；`--agent` 除了代為執行之外，不做任何額外的事
- **前景互動模式** —— 工作階段執行於使用者 Agent CLI 自身的權限確認機制之下。Blueprint 不代為授權、不傳遞任何權杖、亦不讀取工作階段的內容
- **所有產出物在子行程啟動之前均已寫入磁碟** —— 啟動失敗或 Agent 中途停止時，即回歸手動路徑；手動路徑與 Agent 路徑是同一條路徑
- **`--dry-run` 一律不啟動任何 Agent**

## 零網路存取

每個指令僅操作本機檔案。無遙測、無版本更新檢查、不回傳任何資料 —— 套件內不含任何網路程式碼。

## 零執行期依賴

`npm install @kekkai/blueprint` 僅安裝此一套件。稽核所見即為實際執行的全部內容。

## 子行程：事先明列、可以跳過

Blueprint 僅執行兩種外部指令，且執行前均事先明列：其一為 `init` 的依賴安裝（`npm install -D …`，列印於執行計畫中，可以 `--no-install` 跳過）；其二為前述須明確啟用的 Agent 啟動。除此之外不執行任何外部指令。

## 寫入行為均有宣告與邊界

- `init --dry-run` 列印全部效果，不寫入任何檔案
- `inspect` 與 `deps` 為唯讀（`inspect --update-baseline` 僅寫入一個明列的檔案：`.blueprint-baseline.json`；檢測項目為零時不產生任何檔案）
- 使用者持有的檔案**僅在可無損重寫時**才會修改（即無註解的 `tsconfig.json` / `jsconfig.json`）；其餘情況 —— 包括任何既有的 ESLint config 與手寫的 Agent 守則檔 —— 一律提供可直接使用的合併指引，絕不覆蓋
- 唯一的範圍例外：於**全新初始化的專案**（blueprint config 於同一次執行中產生），init 會將匯入別名一併寫入範本的 `vite.config.*` 與含註解的 tsconfig，並在 `lint` script 沒跑 eslint 時幫它接上（讓 lint 跑得到產生的規則）—— 這些是前置條件保護的文字修改，僅處理已知的範本形態，於 `--dry-run` 中完整可見，形態不符時退回指引。既有專案一律不走此路徑
- 重複執行 `init` 具冪等性；共用守則檔中的手寫內容受標記區塊保護，不會被更動

## 發佈附來源簽章

每個版本均由 GitHub Actions 發佈，並附 [npm provenance](https://docs.npmjs.com/generating-provenance-statements) 來源證明 —— 建置來源可於 Sigstore 公開查驗，且發佈流程受完整測試套件（涵蓋率 100%）把關。
