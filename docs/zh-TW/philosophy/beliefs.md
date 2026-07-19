# 十條核心信念

所有規則收斂下來，就這幾條底層信念。後面每一部分都是它們的展開。

### 1. 按責任切，不按大小切

該拆的訊號是「這在做幾件事」，不是「這檔太長」。行數是衍生訊號；`max-lines` 是唯一的行數級 backstop（`max-statements` / per-function 都只是 triage）。

### 2. 單一真實來源

衍生值就 derive（`computed` / `useMemo`），不存成會 desync 的 mutable state；同一筆資料不在兩處各寫一份。

### 3. 介面要窄

輸入窄、輸出少 —— 讓非法狀態根本表達不出來，讓 caller 只依賴它真正要的東西。

### 4. 知識放在需要它的地方

Derivation 給 child、writable state 放 lowest common reader/writer、lifecycle 內建在擁有它的 unit —— 不往上堆。

### 5. BE 的東西不破壞、不造假、不擦屁股

保留 BE shape、對 drift 留防護、缺資料就讓它空 / error —— 不 fake fallback，也不用 FE hack 掩蓋 BE 該做的事。

### 6. 死碼要嘛刪、要嘛標清楚

沒有 consumer 的抽象就是死碼；改完順手掃 orphan；要留的 dead code 用 `@deprecated` 標。

### 7. Lint 是進場點，不是結論

機械層（行數 / 複雜度 / fan-out）只做 triage；cohesion、有沒有 model 化、SoT、invariant 有沒有結構保證，只有 review 抓得到。**lint 全綠 ≠ 合格。**

### 8. AC 是起點，不是聖旨

發現它違反了某個抽象的職責，去修它是在守設計，不是偏離 ticket。

### 9. YAGNI，別 over-engineer

Trivial 改動不用硬套 pattern；「未來可能會共享 / 需要」不是現在就上提 / 抽象的理由。

### 10. 成本是第三個維度

值對（寫對框架）、結構對（分層乾淨）都不保證成本對。成本 = 每事件工作量 × 事件頻率，而「頻率」這個變數不在 code 裡 —— 任何邏輯掛上資料來源時都要「定價」，沿用既有寫法不等於免定價。
