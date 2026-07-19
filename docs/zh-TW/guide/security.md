# Security & Trust

這個套件在你機器上做什麼、以及**刻意不做**什麼。以下每句聲明都能在 source 裡驗證。

## 它不操作任何 agent

Blueprint **替 coding agent 備料，不代替你操作 agent**。它寫的是純 markdown 契約（`CLAUDE.md`、`AGENTS.md`、Cursor / Windsurf rules），寫完就交棒 —— 它**不會**啟動、shell out、設定、或向 `claude` / `codex` / 任何 agent CLI 認證。不存在憑證、token、授權面 —— 這是設計，不是巧合：`init` 跟 `inspect` 做的「分析與設置」全是決定論的檔案操作，不是 agent 呼叫。

## 零網路存取

每個指令都只操作本地檔案。沒有 telemetry、沒有 update check、不回報任何東西 —— 套件裡根本沒有網路 code。

## 零 runtime 依賴

`npm install @kekkai/blueprint` 就裝這一個套件。你 audit 到的就是會跑的全部。

## 唯一的 child process：明列、可跳過

Blueprint 唯一會執行的外部指令是 `init` 的依賴安裝（`npm install -D …`）—— 跑之前會印在計畫裡，`--no-install` 可以整個跳過。除此之外不執行任何東西。

## 寫入有宣告、有邊界

- `init --dry-run` 印出全部效果、不碰任何檔案
- `inspect` 跟 `deps` 唯讀（`inspect --update-baseline` 只寫一個明列的檔：`.blueprint-baseline.json`）
- 你擁有的檔案**只在能無損寫回時**才會被改（無註解的 `tsconfig.json` / `jsconfig.json`）；其他 —— 包含任何既有的 eslint config —— 一律給貼了能用的 snippet，絕不覆蓋
- 重跑 `init` 冪等；共用 context 檔裡的手寫內容躲在 marker 區塊後面，不會被動到

## 發佈帶 provenance 簽章

每一版都從 GitHub Actions 發佈、帶 [npm provenance](https://docs.npmjs.com/generating-provenance-statements) —— build 來源在 Sigstore 公開可驗，且 release workflow 全程被 100% coverage 的測試 gate 擋著。
