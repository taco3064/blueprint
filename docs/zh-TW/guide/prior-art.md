# 相近工具 —— 差異在哪

import 邊界檢查是一塊很成熟的領域：<br>
dependency-cruiser、eslint-plugin-boundaries、Nx module boundaries、sheriff 都在你的 import graph 上畫線，越線就讓 CI 失敗。<br>
它們都是成熟的工具 —— 如果你要的只是 import 規則，直接評估它們就好。<br>
這頁講的是設計上的差異，不是比較表。

## blueprint 重疊的部分

在 lint 這一層，blueprint 做的事跟這些工具一樣：<br>
單向分層流、模組只能走公開入口、套件與全域物件的所有權 —— 轉譯成 ESLint flat config，plugin 內建。<br>
跟既有結構檢查工具並存也實測過，見[實測相容性](/zh-TW/guide/field-tested#框架注意事項)。

## 差異的部分

差異不在 lint —— 在**同一份來源**還轉譯出了什麼：

- **給人讀的架構手冊（`docs/architecture-handbook.md`）** ——<br>
  「為什麼」跟規則出自同源，天生不會漂移
- **AI Agent 的守則（`CLAUDE.md`、`AGENTS.md`、Cursor、Windsurf…）** ——<br>
  Agent 在放檔案**之前**就拿到規則，而不是 lint 掛掉之後
- **唯讀的 `inspect` / `deps` 指令** ——<br>
  lint 看不到的檢測（未宣告資料夾、循環、缺入口…）＋影響範圍查詢
- **既有專案的導入流（`survey` → 作業手冊 → baseline 棘輪）** ——<br>
  在老 repo 上導入是一條有證據支撐的正式路徑，不是「打開然後淹死在紅字裡」

這個設計背後的賭注是：AI Agent 寫的 code 佔比越來越高，只活在 lint 裡的規則，等到報錯時檔案早就放錯位置了。<br>
同一套規則必須事先就在 Agent 的 context 裡 —— 而這只有在「守則跟 lint 永遠不可能不一致」時才成立。<br>
一份來源、轉譯到所有地方，就是這個機制。

## 誠實的界線

我們沒有逐項實測過上述工具，這頁也不主張 lint 層面比較強。<br>
如果你的需求純粹是 import graph 加規則，上面任何一套都可能很適合你。<br>
blueprint 的價值在於：手冊、AI Agent 必須跟規則完全同步的時候 —— 因為它們本來就是同一份東西。
