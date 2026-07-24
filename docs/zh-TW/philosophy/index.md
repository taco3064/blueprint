# 運作守則

blueprint 不只是產生一份 ESLint 設定。<br>
它讓專案裡的每個人 —— 開發者、code reviewer，以及在旁邊一起寫 code 的 AI agent —— 都在同一套工程規則底下工作。<br>
當大家都照同一份守則走，<br>
架構就不會隨著時間、人員更迭、agent 換手而慢慢漂移。

這一頁就是那份守則的核心 —— 而且它不是延伸閱讀。<br>
`vuePreset()` / `reactPreset()` 就是以資料的形式，承載本章節的每一頁；<br>
跑一次 `init`，這些信念就會變成你 repo 裡的 ESLint 規則與 AI agent 守則 —— 是開發當下的護欄，不是口頭支票。<br>
它的定位是「運作守則，不是討論稿」：<br>
只要專案有 AI agent 參與協作，第一天就把規則裝上 —— 及早把形狀定下來，<br>
codebase 就會長成你設計的樣子，而不是壞掉之後才回頭重構。

## Blueprint 不替你設計架構

blueprint 不會告訴你：

> Components 該怎麼分層？
>
> 到底該不該有 `container` 這一層？
>
> feature folder，要還是不要？

這些都是你們團隊自己的決定，<br>
blueprint 尊重你既有的設計。<br>
它只做一件事：

> **把你已經選定的架構，變成一套所有人都能共同遵守的工程規則。**

所以不管你用內建 preset，還是把既有專案接進來，<br>
blueprint 都是在「承載」你的架構 —— 而不是替你發明一套。<br>
修改 blueprint 裡的 `principles` / `componentShape` / `playbook`，<br>
就是在修改專案自己這份守則。

## 一份守則，多種形式

同一份守則，會為不同的讀者編譯成不同形式：

- **ESLint 規則** —— 機器查得動的部分，自動強制
- **架構手冊** —— 給人讀的「為什麼」
- **AI agent 守則**（`CLAUDE.md`、`AGENTS.md`⋯⋯）—— agent 依循的規則

它們講的是同一件事，只是面向不同：<br>
開發者讀手冊，agent 遵守守則，ESLint 檢查工具查得動的部分。<br>
每一份產物都從同一份 blueprint 編譯出來，<br>
所以彼此永遠不會互相矛盾。

## 三種級別落點

blueprint 不相信「lint 全綠就代表架構沒問題」。<br>
很多架構上的取捨本質上是語意問題 —— 需要有人真正讀懂 code「在做什麼」：

- 這個元件是不是扛了太多責任？
- 這個 hook / composable 是不是抽象過頭？
- 這個重構方向對不對？
- 模組邊界真的清楚嗎？

這些都不是 AST 答得出來的。<br>
所以手冊裡每一條規則，都會落在以下三個層級之一：

- **✅ lint／config** —<br>
  完全查得動：lint 自動攔下違規，設定一次就好。
- **◐ lint（初篩）＋ agent 守則** —<br>
  lint 只能標出「需要檢視的位置」（設為 `warn`），結論仍要人來判定。
- **○ 只在 agent 守則** —<br>
  語意、流程、人為判斷 —— 沒有工具攔得住，交給 agent 每一輪工作自行守住。

這就是 blueprint 的設計骨架：<br>
機器查得動的，編譯成 ESLint 設定；<br>
只有審查能判定的，編譯成手冊與 agent 守則。

> **lint 通過，只代表規則通過。**
>
> **架構品質，仍然來自這份守則** —— 這正是信念第六條。

## 框架只是語法不同

blueprint 不綁 React 或 Vue。<br>
兩者的 reactive 原語不一樣 ——

- `ref()` ↔ `useState()`
- `computed()` ↔ `useMemo()`

—— 但工程原則是對得上的：分層方式、元件設計、依賴方向、重構策略、協作方式。<br>
blueprint 在乎的是這些，不是底下那個框架。<br>
這組信念在兩邊都成立，變的只有 reactive 原語。

## Blueprint 怎麼承載這份守則

每一種規則，都對應到 blueprint 裡的一個欄位，<br>
以及承載它的那份產物：

- **分層架構、模組形狀、套件歸屬** — `architecture` → `emitLint` 與 `inspect`
- **核心信念** — `principles` → 手冊與 agent 守則
- **元件設計** — `componentShape` → 手冊與 agent 守則
- **執行期負載／重構／協作** — `playbook` → 手冊與 agent 守則
- **量化門檻與自訂規則** — `rules` → `emitLint`（內嵌外掛）

修改 `blueprint.config`，就是在修改專案的運作守則。<br>
重新產生後，ESLint 設定、架構手冊、agent 守則會一起同步 —— 永遠不會各走各的。

延伸閱讀：[核心信念](/zh-TW/philosophy/beliefs) · [分層架構](/zh-TW/philosophy/layers) · [元件設計](/zh-TW/philosophy/component-shape) · [工作紀律](/zh-TW/philosophy/discipline)
