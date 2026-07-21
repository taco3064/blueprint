# AI 協助導入

在既有專案導入 blueprint 是判斷性工作，不是初始化工作：分層結構早就存在，必須先有人「讀懂」它，規則才有辦法把它編碼下來。blueprint 把這件事切成三個階段，只有中間那段需要智慧判斷：

| 階段 | 執行者 | 工具 |
|---|---|---|
| **蒐證** —— 資料夾結構、匯入關係矩陣、模組形狀、套件集中度 | 決定性程序 | `blueprint survey` |
| **判斷** —— 哪些資料夾是分層、依賴方向往哪、哪些是債務、哪些是設計意圖 | AI Agent（或開發者本人） | 導入作業手冊 |
| **驗證** —— 每項違規都要能解釋為真實債務，而不是 config 譯錯 | 決定性程序 | `blueprint inspect` 與 baseline 棘輪 |

## 導入流程

於「已有程式碼、尚無 `blueprint.config.mjs`」的專案執行 init：

```bash
npx @kekkai/blueprint init
```

init 不會硬套預設藍圖，而是掃描程式碼後產出：

- **`blueprint-authoring.md`** —— 可執行的導入作業手冊：蒐證數據、推導方法、config 結構速覽與驗收條件
- **`.claude/commands/blueprint-author.md`** —— Claude Code 使用者可直接輸入 `/blueprint-author` 啟動

接著交給 AI Agent 執行：

```bash
claude "Read blueprint-authoring.md at the repository root and execute it end to end."
# codex 亦使用相同的提示語
# 或以單一指令完成：
npx @kekkai/blueprint init --agent claude
```

Agent 依蒐證數據推導 config，反覆對照 `blueprint inspect` 直到每項違規都能解釋為真實債務，再重新執行 `init` 產出各項成品並鎖定 baseline。開發者只需要審閱最終結果。

`--agent` 是刻意設計得最薄的一層：它在前景以互動模式執行**畫面上已印出的那行指令**，且跑在你自己 Agent CLI 的權限之下。確切的安全邊界見[安全與信任](/zh-TW/guide/security)。

若欲完全跳過編寫流程、即使在既有專案上也直接以框架預設藍圖建置，可改用 `init --preset` —— 這是已確認預設藍圖適用時的快捷途徑。

## 蒐證步驟的必要性

讓 AI Agent 自己從零翻整個專案，又慢又不可靠。`survey` 直接把決定性的事實餵給 Agent：

```bash
npx @kekkai/blueprint survey          # 供人閱讀的報告
npx @kekkai/blueprint survey --json   # 供工具或 Agent 讀取
```

- 頂層資料夾清單與**模組形狀證據**（`index` 檔覆蓋率、巢狀深度 —— 作為判斷資料夾式或扁平式模組的依據）
- **資料夾之間的匯入關係矩陣**，依匯入次數由高至低排列 —— 呈現設計意圖中的依賴方向，以及屬於債務的逆向依賴
- **套件集中度** —— 作為 `owns`（套件歸屬）宣告的候選依據
- 測試檔慣例統計 —— 應歸入 `testFiles` 而非 `layers` 的項目

## 失敗情境的處理原則

所有產出物都在任何 AI Agent 啟動**之前**就寫入磁碟。啟動失敗、或 Agent 中途放棄，流程就回到手動路徑 —— 同一份作業手冊，改由開發者親自執行。`inspect` 唯讀、`init` 冪等、baseline 只在最後一步寫入，所以不存在「導入到一半」的中間狀態要清理。

## 範圍的誠實界定

作業手冊只承諾「產出 config 並鎖定 baseline」，**不承諾**幫你清償既有債務。既有違規會記錄進 baseline，後續透過 [baseline 棘輪](/zh-TW/guide/getting-started)逐步清償 —— 導入跟債務清償是兩件獨立的事。
