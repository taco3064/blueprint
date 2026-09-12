# `init` 產出結果

一份 `blueprint.config.mjs` 轉譯出四種產出結果。<br>
本頁列出它們的實際樣貌 —— 內容取自在全新 Vue 專案上執行 `init` 的實際產出。<br>
兩個語系共用同一份 literal artifact；中文說明留在 code block 外，所以範例就是磁碟上的原始輸出。<br>
通則只有一條：**改 blueprint config，不要改產出結果** —— 所有產出結果都由 config 重新生成，手動編輯的內容在設計上就會被蓋掉。

## 來源：`blueprint.config.mjs`

全新專案的 config 即為一次 preset 呼叫：

<<< @/publication/generated/fresh-vue-js/blueprint.config.mjs{js}

以下所有內容都由這份 config 轉譯而來。

## `eslint.config.mjs` —— 強制

生成的 lint config 刻意保持精簡：結構規則在跑 lint 時由 `emitLint(blueprint)` 展開，所以 config 永遠不會跟 blueprint 脫節。<br>
這同時也是併入**既有** ESLint config 的作法 —— 在自己的 config 檔展開 `...emitLint(blueprint)`，而且要放在**既有 entry 之後**（flat config 後者為王，這樣 blueprint 的逐層調校才不會被泛用 preset 蓋掉；兩邊都設的規則 —— `no-restricted-*` —— 仍要合併成同一個 entry）：

<<< @/publication/generated/fresh-vue-js/eslint.config.mjs{js}

`stylistic` 跟 `imports` 是**參數**，不是套件的依賴：blueprint 一個依賴都沒有，<br>
所以外掛缺席的關卡會完全不 emit，而 lint 照樣是綠的。<br>
哪個關卡靠哪個外掛，以及 `emitLint` 展開的內容 —— 分層流向、套件所有權、unit 入口、[內嵌 plugin 規則](/zh-TW/guide/reference#內嵌-eslint-外掛) —— 總表頁有完整清單。

範例中的 `src/**/*` 範圍來自 `architecture.sourceRoot` 的預設值，不是生成器寫死的路徑。<br>
設定其他 root 時，這份檔案中的 `src` 會全部換成該 root；設為 `sourceRoot: '.'` 時，生成範圍會從專案根目錄開始。

## `docs/architecture-handbook.md` —— 說明

給人閱讀的架構手冊：分層圖（mermaid）、職責表、unit 形狀與匯入紀律 ——<br>
跟 lint 規則出自同一份 config，所以不會彼此脫節。節錄如下：

<<< @/publication/generated/fresh-vue-js/architecture.md{md}

上面是生成出的完整架構段落。<br>
**畫出來的線不等於流向** —— 這是唯一要看仔細的地方，因為直覺剛好相反：<br>
可達性看的是分層順序，而線只有在某一層**收窄了誰可以匯入它**時才會畫出來。

完整手冊還有元件設計軸線、核心信念與作業守則 ——<br>
這些內容的正典版本就是本站的[工程理念](/zh-TW/philosophy/)章節。

## `CLAUDE.md` / `AGENTS.md` —— 協作

AI Agent 守則刻意保持精簡：分層流向與硬性關卡直接內嵌，放置判斷指向手冊、作業紀律指向套件內附的守則文件。<br>
守則放在標記註解之間，所以手寫的 `CLAUDE.md` 在重新生成時，區塊以外的內容一律保留：

<<< @/publication/generated/fresh-vue-js/agent-contract.md{md}

裡面有四件事不是裝飾用的。<br>
**不指名執行器** —— 寫的是「專案的 lint」（原文 the project's lint run），因為只從 blueprint config 生成的守則，看不到你的 repo 用 npm 還是 pnpm。<br>
**`cycles` 是 `blueprint inspect` 被執行時或 CI 裡的診斷**，不是持續的 lint 檢查。<br>
`--baseline` 會保留已記錄的 cycle finding，只對新 finding 失敗，所以綠燈的 lint 不會被讀成「循環依賴也顧到了」。<br>
**每條硬性關卡都寫出自己的作用範圍** —— 只管架構 glob 打到的檔案，這也是為什麼剛建好、已宣告位置還空著的專案沒有東西會失敗。<br>
**清單上會出現哪些關卡，取決於技術棧** —— 上面這個範例是 JS 專案，所以 `explicitAny` 不在它的清單裡，而 TypeScript 專案的守則就會有；只有工具真的擋得住的關卡，才會被列成硬性關卡。

發佈目標（Cursor、Windsurf、Gemini、Copilot）由 [`emit.agents`](/zh-TW/guide/reference#快速上手範例以外的-config-欄位) 設定。

如果要讓每一次 lint 都拒絕 cycle，可以透過生成 config 已經匯入的 import 外掛 opt in。<br>
把這個 entry 放在 `...emitLint(...)` 後面：

```js
{
  plugins: { 'import-x': imports },
  rules: { 'import-x/no-cycle': 'error' },
}
```

這不是預設值，因為該規則會逐檔重走 dependency graph，在 850 檔的 repo
實測為 92 秒。只有在持續預防值得這筆 lint 成本時才啟用；否則在 CI 執行
`blueprint inspect --baseline`。
