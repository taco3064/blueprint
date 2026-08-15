# 影響範圍 —— `blueprint deps`

`blueprint deps` 在動任何模組之前，先回答一個問題：**改這個模組，會波及誰？**<br>
它是唯讀指令，除了 blueprint config 本身不需要任何額外設定，也不會寫入任何檔案。

它與 [`blueprint inspect`](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect) 的分工：<br>
`inspect` 負責**裁決**架構（違規、循環相依、exit code 1），<br>
`deps` 只負責**描述** —— 逐模組列出被誰引用、引用了誰，不做任何判定。

兩者讀的是同一張圖，而那張圖是**從原始碼文字掃出來的，不是解析 AST** —— 見 [import graph 是怎麼讀出來的](/zh-TW/guide/reference#import-graph-是怎麼讀出來的)。<br>
算出來的 `import(path)` 不會出現在被引用次數裡，所以影響範圍要當成下限看，不是精確值。<br>
`deps` 的每一種輸出都會以那段說明收尾。

## 操作方式

```bash
npx @kekkai/blueprint deps                      # 全模組排行：依被引用數排序
npx @kekkai/blueprint deps hooks/useCart        # 以模組鍵查詢單一模組
npx @kekkai/blueprint deps src/hooks/useCart/useCart.ts   # 以檔案路徑查詢，結果相同
```

三種輸入形式都會解析為相同的模組鍵 ——<br>
是否帶有 `src/` 前綴、是否附上副檔名，均不影響查詢結果。

- `--json` —— 輸出機器可讀格式（供工具或 AI Agent 使用）
- `--framework vue|react` —— 專案無 config 且框架無法自動判定時，強制指定 preset

## 輸出結果

**不帶參數** —— 影響範圍排行榜。<br>
所有模組依「被多少模組匯入」排序，異動風險最高的模組列於最上方：

```
Blast radius (imported-by count):
  2 ← hooks/useCart
  1 ← services/api
  0 ← containers/Cart
  0 ← pages/Home
  (not under a declared layer, invisible to deps: legacy/)
```

**指定模組** —— 同時呈現上下游兩個方向。<br>
`imported by` 為異動此模組的影響範圍；`imports` 為此模組所依賴的對象：

```
hooks/useCart
  imported by (2):
    ← containers/Cart
    ← pages/Home
  imports (1):
    → services/api
```

**加上 `--json`** —— 相同資料的結構化形式。<br>
排行榜的輸出結構為 `{ modules, skipped, derivation }`；單一查詢則回傳單一節點物件：

```json
{
  "module": "hooks/useCart",
  "importedBy": ["containers/Cart", "pages/Home"],
  "imports": ["services/api"],
  "derivation": "How this graph was read: source text, not a parsed AST …"
}
```

`derivation` 兩種形式的輸出都會帶著 —— 它就是下面「相依圖的涵蓋範圍與邊界」那段的告誡，濃縮成一個字串，<br>
讓「拿這張圖去回報的工具」把這個限制一起帶走，而不是自己重講一遍。

宣告 [`modules`](/zh-TW/guide/structure) 之後，兩種輸出都會同時帶上兩種粒度：<br>
排行榜在 `modules` 旁邊多一個 `units`；單一查詢的 key 則從 `module` 換成 `unit`，並額外帶上它自己的 `module` 與該模組的 `moduleImportedBy`。

查詢不存在的模組時，以 exit code 1 結束，並提示可以跑排行榜列出所有模組；<br>
查詢成功則以 exit code 0 結束。

## 查詢粒度 —— 由 `layer.layout` 決定

每個查詢結果的單位是**模組**，<br>
而模組的界定方式取決於各分層自己宣告的 [`layout`](/zh-TW/api/interfaces/LayerDef)：

- **`folder` 佈局** —— 分層之下的每個直屬子項各自成為一個模組（`hooks/useCart`、`components/HelloWorld`）。<br>
  直屬檔案的模組鍵不含副檔名，因此 `deps components/HelloWorld` 與 `components/HelloWorld.vue` 指向同一個模組。
- **`file` 佈局** —— 整個分層收斂為**單一節點**。<br>
  此佈局適用於「巢狀資料夾並非模組」的分層 —— 例如 Next.js 的路由樹，`app/(marketing)/pricing/page.tsx` 是一條路由，而非功能資料夾。<br>
  不寫 `layout` 就會落在這裡。<br>
  粒度切換時，deps 會明確標示，不會無聲改變回答的層級：

```
app (file-layout layer — answers at layer granularity)
```

在 [`modules`](/zh-TW/guide/structure) 之下有兩種粒度，排行榜兩份都印 ——<br>
先是根目錄上的模組，再來是各模組**裡面**的單元，而單元的鍵會帶上它所屬的模組：

```
Blast radius per module (imported-by count):
  1 ← common
  0 ← app

Blast radius per unit (inside its own module — imported-by count):
  1 ← app/hooks/useThing
  1 ← common/services/api
  0 ← app/components/Panel
```

## 相依圖的涵蓋範圍與邊界

- **僅涵蓋已宣告的分層。**<br>
  `architecture.layers` 以外的資料夾不會納入相依圖；排行榜會將其列為略過項目（如上例的 `legacy/`），避免把「未被掃描」誤讀為「沒有任何模組引用」。<br>
  查詢此類資料夾內的模組時，會直接說明原因，並把兩種解法一起講出來：

```
✗ "legacy/" is not a declared layer, so nothing governs it — the import graph holds no node inside it and there is no blast radius to report. Declare it in `architecture.layers`, or run `blueprint deps` for the nodes it does hold.
```

- **測試檔案一律排除**（`architecture.testFiles`）——<br>
  測試對模組的匯入不算進影響範圍，跟 lint 側的行為一致。
- **僅有別名匯入與相對路徑匯入會構成相依邊。**<br>
  套件匯入（`axios`、`vue`）不屬於模組相依圖 —— 套件的**所有權**檢核屬於 `inspect` 的職責。
- **循環相依僅如實列出，不作裁決。**<br>
  兩個互相匯入的模組，會分別出現在彼此的上下游清單中；裁決屬於 `inspect` 的職責。

## config 驗證

手寫、沒包 `defineBlueprint` 的 `blueprint.config.mjs`，載入時一樣會跑完整驗證。<br>
結構性錯誤會立刻以精確訊息回報，而不是在指令跑到一半時炸出一個難以定位的例外：

```
✗ blueprint.config.mjs: architecture.layers must be an array.
```

不認得的鍵也會被同樣擋下，而且會講明它被什麼取代了 ——<br>
3.x 的 config 還留著 `architecture.module` 是最常撞到這一則的情況：

```
✗ blueprint.config.mjs: Unknown key "module" in architecture — nothing reads it, so the declaration is silently dead. The module shape moved onto each layer in 4.0.0 — write `layout` / `entry` there instead: layers: [{ name: 'components', does: '…', layout: 'folder', entry: 'index' }] (entry defaults to "index", layout to "file"). `private` is gone with no replacement: the entry-only ban already covers every non-entry file, so nothing was enforcing it. Every 3.x config must make this edit, including a flat project that is not adopting `modules`.
```
