# Security & Trust

這個套件在你機器上做什麼、以及**刻意不做**什麼。以下每句聲明都能在 source 裡驗證。

## 預設不啟動任何 agent —— 除非你顯式要求

Blueprint **替 coding agent 備料，預設不代替你操作 agent**。它寫的是純 markdown 契約（`CLAUDE.md`、`AGENTS.md`、Cursor / Windsurf rules），brownfield repo 上再多一份 authoring 劇本，寫完就交棒 —— 它**不會**設定、或向 `claude` / `codex` / 任何 agent CLI 認證。不存在憑證、token、授權面：`init`、`survey`、`inspect` 做的分析全是決定論的檔案操作，不是 agent 呼叫。

唯一的例外是顯式的：`init --agent claude|codex` 會在 authoring 劇本上啟動**你自己的** agent CLI。這個 opt-in 的邊界：

- **執行前先印出指令原文** —— 跟你自己貼上去跑的是同一行；`--agent` 除了替你執行它，不多做任何事
- **前景、互動式** —— session 跑在你的 agent CLI 自己的權限確認之下。Blueprint 不代授任何權限、不傳任何 token、也不回讀 session 內容
- **所有產物在 spawn 之前就已落盤** —— 啟動失敗（或 agent 中途放棄）就退回手動路徑，而手動路徑就是同一條路
- **`--dry-run` 永不啟動**

## 零網路存取

每個指令都只操作本地檔案。沒有 telemetry、沒有 update check、不回報任何東西 —— 套件裡根本沒有網路 code。

## 零 runtime 依賴

`npm install @kekkai/blueprint` 就裝這一個套件。你 audit 到的就是會跑的全部。

## Child process：明列、可跳過

Blueprint 只會執行兩種外部指令，跑之前都先明列：`init` 的依賴安裝（`npm install -D …`，印在計畫裡、`--no-install` 可跳過），以及上面說的 opt-in agent 啟動。除此之外不執行任何東西。

## 寫入有宣告、有邊界

- `init --dry-run` 印出全部效果、不碰任何檔案
- `inspect` 跟 `deps` 唯讀（`inspect --update-baseline` 只寫一個明列的檔：`.blueprint-baseline.json`）
- 你擁有的檔案**只在能無損寫回時**才會被改（無註解的 `tsconfig.json` / `jsconfig.json`）；其他 —— 包含任何既有的 eslint config —— 一律給貼了能用的 snippet，絕不覆蓋
- 重跑 `init` 冪等；共用 context 檔裡的手寫內容躲在 marker 區塊後面，不會被動到

## 發佈帶 provenance 簽章

每一版都從 GitHub Actions 發佈、帶 [npm provenance](https://docs.npmjs.com/generating-provenance-statements) —— build 來源在 Sigstore 公開可驗，且 release workflow 全程被 100% coverage 的測試 gate 擋著。
