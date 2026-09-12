# 影響範圍 —— `blueprint deps`

`blueprint deps` 在動任何 unit 之前，先回答一個問題：**改這個 unit，會波及誰？**<br>
它是唯讀指令，除了 blueprint config 本身不需要任何額外設定，也不會寫入任何檔案。

它與 [`blueprint inspect`](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect) 的分工：<br>
`inspect` 負責**裁決**架構（違規、循環相依、exit code 1），<br>
`deps` 只負責**描述** —— 逐 unit 列出被誰引用、引用了誰，不做任何判定。

兩者讀的是同一張圖：靜態語法從文字掃描，可化約成確定字串的動態 `import()` 會經 AST 解析後納入 —— 見 [import graph 是怎麼讀出來的](/zh-TW/guide/reference#import-graph-是怎麼讀出來的)。<br>
若輸出結尾的分析限制仍列出執行期目標，影響範圍就是下限而非精確值。

## 操作方式

```bash
npx @kekkai/blueprint deps                      # 全 unit 排行：依被引用數排序
npx @kekkai/blueprint deps hooks/useCart        # 以 unit key 查詢單一 unit
npx @kekkai/blueprint deps src/hooks/useCart/useCart.ts   # 以檔案路徑查詢，結果相同
```

三種輸入形式都會解析為相同的 unit key ——<br>
是否帶有 `src/` 前綴、是否附上副檔名，均不影響查詢結果。

- `--json` —— 輸出機器可讀格式（供工具或 AI Agent 使用）
- `--framework vue|react` —— 專案無 config 且框架無法自動判定時，強制指定 preset

## 輸出結果

**不帶參數** —— 影響範圍排行榜。<br>
所有 unit 依「被多少 unit 匯入」排序，異動風險最高的 unit 列於最上方：

```
Blast radius (imported-by count):
  2 ← hooks/useCart
  1 ← services/api
  0 ← containers/Cart
  0 ← pages/Home
  (outside the declared architecture, invisible to deps: legacy/)
```

**指定 unit** —— 同時呈現上下游兩個方向。<br>
`imported by` 為異動此 unit 的影響範圍；`imports` 為此 unit 所依賴的對象：

```
hooks/useCart
  imported by (2):
    ← containers/Cart
    ← pages/Home
  imports (1):
    → services/api
```

**加上 `--json`** —— 相同資料的結構化形式。<br>
排行榜的輸出結構為 `{ units, skipped }`；單一 unit 查詢則回傳該 unit 物件：

```json
{
  "unit": "hooks/useCart",
  "importedBy": ["containers/Cart", "pages/Home"],
  "imports": ["services/api"]
}
```

查詢不存在的 unit 時，以 exit code 1 結束，並提示可以跑排行榜列出所有 unit；<br>
查詢成功則以 exit code 0 結束。

## 查詢粒度 —— 由 `layer.layout` 決定

每個查詢結果的單位是 **unit**，其界定方式由各 layer 的 `layout` 決定：

- **`folder` 佈局** —— 分層之下的每個直屬子項各自成為一個 unit（`hooks/useCart`、`components/HelloWorld`）。<br>
  直屬檔案的 unit key 不含副檔名，因此 `deps components/HelloWorld` 與 `components/HelloWorld.vue` 指向同一個 unit。
- **`file` 佈局** —— 保留原 flat 佈局行為，整個分層收斂為**單一節點**。<br>
  此佈局適用於「巢狀資料夾只用來整理檔案，而非宣告 unit」的分層 —— 例如 `styles/themes/dark.ts` 仍可歸入同一個 styles 節點。<br>
  粒度切換時，deps 會明確標示，不會無聲改變回答的層級：

```
styles (file-layout layer — answers at layer granularity)
```

## 相依圖的涵蓋範圍與邊界

- **僅涵蓋已宣告的分層。**<br>
  layer-first 設定中，`architecture.layers` 以外的資料夾不會納入相依圖；排行榜會將其列為略過項目（如上例的 `legacy/`），避免把「未被掃描」誤讀為「沒有任何 unit 引用」。<br>
  module-first 設定則以 `architecture.modules` 為外層邊界；一般 module 的內層資料夾必須位於共用的 `architecture.layers` 清單中。已宣告且保留的 `app` module 是例外，其下所有 router-composition 原始碼都會解析至 container node。其他不在契約裡的外層或內層資料夾會列為略過；查詢時會直接說明原因：`✗ "legacy/" is outside the declared architecture`。
<!-- @include: @/publication/semantic/test-files/deps.zh-TW.md -->
- **僅有別名匯入與相對路徑匯入會構成相依邊。**<br>
  套件匯入（`axios`、`vue`）不屬於 unit 相依圖 —— 套件的**所有權**檢核屬於 `inspect` 的職責。
- **循環相依僅如實列出，不作裁決。**<br>
  兩個互相匯入的 unit，會分別出現在彼此的上下游清單中；裁決屬於 `inspect` 的職責。

## config 驗證

手寫、沒包 `defineBlueprint` 的 `blueprint.config.mjs`，載入時一樣會跑完整驗證。<br>
結構性錯誤會立刻以精確訊息回報，而不是在指令跑到一半時炸出一個難以定位的例外：

```
✗ blueprint.config.mjs: architecture.module is retired in Blueprint 4.0 — move layout and entry onto each layer.
```
