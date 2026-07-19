# The Operating Contract

Blueprint 是一套工程治理手冊的工具面 —— 一套前端**元件與架構**的設計思維：分層、元件形狀、資料邊界、重構紀律。**同一組原則在 Vue 跟 React 都成立** —— 形狀對得起來，差的只是 reactive primitive（`ref`/`computed` vs `useState`/`useMemo`）跟 lifecycle API。

手冊的立場：**它是 operating contract，不是討論稿**。給任何靠 AI agent 協作的專案，第一天就裝上 —— 一開始把規則控好，後面就在可控範圍內長成你要的樣子，而不是等它快失控了才回頭 refactor。

## 三級落點

手冊裡每條規則都落在三個位置之一：

| 級 | 落點 | 意義 |
|---|---|---|
| ✅ | **lint / config** | 有 rule 撐 —— 進 CI 自動擋。裝一次就好。 |
| ◐ | **lint（triage）＋ agent 契約** | lint 只抓得到「進場點」（掛 `warn`）；結論交 review。 |
| ○ | **agent 契約** | lint 抓不到（語意 / 流程 / 人工判斷）—— 寫成 behavioral 規則，靠 agent 每輪自己守。 |

這就是 Blueprint 設計的骨架：機器查得了的編譯進 ESLint config，只有 review 判得了的編譯進手冊跟 agent 契約。**lint 全綠 ≠ 架構合格** —— 這是信念 #7。

## Blueprint 怎麼承載

| 手冊章節 | Blueprint 載體 |
|---|---|
| 分層架構、模組形狀、套件歸屬 | `architecture` → `emitLint` + `inspect` |
| 十條核心信念 | `principles` → 手冊 + agent 契約 |
| 元件形狀（7 軸） | `componentShape` → 手冊 + agent 契約 |
| 資料完整性 / runtime / 重構 / 協作 | `playbook` → 手冊 + agent 契約 |
| Metric gates 與 custom rules | `rules` → `emitLint`（內嵌 plugin） |
| CI | `emit.ci` → `emitCi` |

繼續讀：[十條核心信念](/zh-TW/philosophy/beliefs) · [分層架構](/zh-TW/philosophy/layers) · [元件形狀](/zh-TW/philosophy/component-shape) · [工作紀律](/zh-TW/philosophy/discipline)
