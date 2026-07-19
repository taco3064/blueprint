# 工作紀律

沒有工具能強制的判斷規則 —— Blueprint 把它們編譯進手冊跟 agent 契約，讓它們在每次改動的 context 裡。四個主題。

## 資料完整性與 BE 邊界

- **不用 fake-data fallback。** `payload.field || fixture.field` 這種「BE 缺就拿假資料頂上」的 fallback —— 它是 bug，不是 safety net：它把 integrity 問題藏起來。Prod 該老實顯示 empty / error / skeleton。
- **刻意留的防護框成「guard against BE drift」**，不要框成「支援某個欄位缺失的 payload」。要 strip 的前提：沒有 drift 疑慮 + test 能證明零 callsite。
- **BE-bound 的問題不主動提 FE workaround。** 問題本質在 BE、立場又已經公開 —— 提「FE 可以短期 hack」會給 BE 台階把工作推回 FE。
- **Service 層保留 BE 的 locale shape。** 在 service 就解析成單一字串會丟掉另一語變體、把 presentation 混進 service —— 曝 `{ zh_cn, en }`，讓 view 解析。

## Runtime 負載紀律

資料進來的下一個問題不是「對不對」，是「**進來得多快**」—— lint 跟結構都看不到的維度。這掛在信念 #10 底下。

- **掛 handler 前先定價。** 掛上 WS / polling / scroll / input 之前回答三題：每秒幾次？每次多少資料？每事件成本是 O(什麼)？講不出來 → 不能 merge。「跟既有 pattern 一致」正是這個失誤的放大器 —— 頻率不在 code 裡。
- **高頻更新走 in-place / field-level 寫入。** 保住容器與未變節點的 identity；whole-replace 留給基線重建。一次事件後「identity 變了、值沒變」的 prop edge = 病。寫入形狀不能跨框架照搬 —— React 靠 immutable + memo、Vue 靠 property-level tracking。
- **Render 診斷四步，沒有一步靠猜。** 誰在 render（profiler）→ 誰觸發（render tracing）→ 誰生產 identity（grep 賦值點）→ 值得嗎（對照事件 payload）。
- **效能宣稱要可驗收。**「減少 re-render」不是形容詞；「單一事件 re-render ≤ N components」才是。用 render-count / identity-stability test pin 住 —— 沒被測住的效能宣稱，等於沒做。

## 死碼與抽象紀律

- 抽象要在**同一個 PR** 接上至少一個 production consumer —— 只有自己的 test 當 caller = 死碼偽裝成架構工作。
- 拿掉唯一的 callsite，就在同一個 PR 把不可達的 code 也刪掉。
- 要留但停用 → `@deprecated` 指向 status 文件 —— 標停用的實體本身，不標它的 test。
- 把 anti-pattern 搬去 sibling + `eslint-disable` 不算「修好」；逐行 disable 也不算 migration。

## 重構與協作

- **Safety-net 先行三階段**：補邊界測試 → 拆 / 改 → 整理測試，每階段一個 commit、review scope 互不重疊。
- **從 source 抽取，不憑記憶重寫** —— 抽完跟 git history diff；「test pass」不是抽取正確的唯一證明。
- **抽取前遞迴掃依賴** —— 所有 identifier，不只 reactive ref。
- **Safety net 別鎖 refactor 自己要改的 contract。**
- **架構修正框成「守設計」**，不是「偏離 ticket」—— 先講被守的原則，再說明照字面讀 ticket 為什麼會違反它。
- **不重開已經定案的設計**；有真正的疑慮一次講清楚、附理由，不要列菜單。
- **「使用者能繞過」不是放生 ticket 的理由** —— 判準看 scope 跟 standalone impact。
