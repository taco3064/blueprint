# 元件形狀 · 7 條正交軸線

元件 / composable 的形狀，七條軸線。**這是一個「集合」，不是一條「流程」**：七軸彼此正交、各自獨立作「要 / 不要」的決定 —— 別用「滿足 #3 所以 #1 自動成立」這種推論。編號是 identifier，不代表順序；trivial 的改動不用硬套。

這整個部分的 lint 幾乎都是 ◐/○ —— 元件形狀是設計判斷，這正是信念 #7。

### 1. Ownership Inversion —— 誰需要 derived state，誰自己持有

Parent 不要先算好再 props drill，child 直接 import composable / hook 自己算。實戰：props 17 → 7。

### 2. IO Shrinkage —— 輸入窄、輸出少

三種 move：拆多 concern、平行 raw state 帶 invariant → 收成單一 modeled state、對稱 twin 收成同型 object。count / size 是弱訊號；**有沒有 model 化**是 review 判斷。Triage：`max-params`。

### 3. SRP Decomposition —— 按責任邊界切，不按大小

Naming test：不用「and」就講不清 → 該拆。Dissolution 也是拆。例外：共用必須同步的 writable state —— 強拆製造 sync bug。Triage：`max-statements`。

### 4. Orchestration Shell —— Page 只做協調

Route / id 解析、loading shell、shared source、跨 child lifecycle —— 不替每個 child 算 derived。實戰：detail page 6666 行 → 552 行。Triage：`max-lines`（on pages）。

### 5. Scoped Writable State —— 放「寫的人 + 讀的人」的最近共同 ancestor

只有真跨界共享的 writable state 才往上送；要跨 route → 進 URL query / store。「未來可能共享」= YAGNI，要共享時再 hoist。

### 6. Lifecycle Internalization —— lifecycle 是責任一部分就內建

Caller 該拿到「已經跑起來、會自己清理」的東西，不是自己去接線 `onMounted` / `useEffect`。實戰：19 個 export → caller 一行。

### 7. Pure Helpers ≠ Composables —— 純函式跟 reactive unit 不要混

一個 export function ≠ 一個檔：責任切在 function 層級，檔案切分只在 `max-lines` 逼近時才做。曝的是 unit 做的**決定**，不是原料。

---

**Lint 與 review 的分工（貫穿 7 軸）**：一個 unit 可能 size 小、complexity 低、fan-out 低 —— 全綠 —— 卻是 raw-state dump、或把 derivation 存成 mutable ref，metric 全看不到。lint warning = review 的進場點，不是結論。
