# 影響範圍 —— `blueprint deps`

`blueprint deps` 在動任何模組之前，先回答一個問題：**改這個模組，會波及誰？**<br>
它是唯讀指令，除了 blueprint config 本身不需要任何額外設定，也不會寫入任何檔案。

它與 [`blueprint inspect`](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect) 的分工：<br>
`inspect` 負責**裁決**架構（違規、循環相依、exit code 1），<br>
`deps` 只負責**描述** —— 逐模組列出被誰引用、引用了誰，不做任何判定。

## 操作方式

```bash
npx @kekkai/blueprint deps                      # 全模組排行：依被引用數排序
npx @kekkai/blueprint deps hooks/useCart        # 以模組鍵查詢單一模組
npx @kekkai/blueprint deps src/hooks/useCart/useCart.ts   # 以檔案路徑查詢，結果相同
```

三種輸入形式都會解析為相同的模組鍵 ——<br>
是否帶有 `src/` 前綴、是否附上副檔名，均不影響查詢結果。

| 旗標 | 效果 |
| --- | --- |
| `--json` | 輸出機器可讀格式（供工具或 AI Agent 使用） |
| `--framework vue\|react` | 專案無 config 且框架無法自動判定時，強制指定預設藍圖 |

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
排行榜的輸出結構為 `{ modules, skipped }`；單一模組查詢則回傳該模組物件：

```json
{
  "module": "hooks/useCart",
  "importedBy": ["containers/Cart", "pages/Home"],
  "imports": ["services/api"]
}
```

查詢不存在的模組時，以 exit code 1 結束，並提示可以跑排行榜列出所有模組；<br>
查詢成功則以 exit code 0 結束。

## 查詢粒度 —— 由 `module.layout` 決定

每個查詢結果的單位是**模組**，<br>
而模組的界定方式取決於 Blueprint config 中的 [`module.layout`](/zh-TW/api/interfaces/ModuleDef)（可透過 `layer.module` 逐層覆寫）：

- **`folder` 佈局** —— 分層之下的每個直屬子項各自成為一個模組（`hooks/useCart`、`components/HelloWorld`）。<br>
  直屬檔案的模組鍵不含副檔名，因此 `deps components/HelloWorld` 與 `components/HelloWorld.vue` 指向同一個模組。
- **`flat` 佈局** —— 整個分層收斂為**單一節點**。<br>
  此佈局適用於「巢狀資料夾並非模組」的分層 —— 例如 Next.js 的路由樹，`app/(marketing)/pricing/page.tsx` 是一條路由，而非功能資料夾。<br>
  粒度切換時，deps 會明確標示，不會無聲改變回答的層級：

```
app (flat layer — answers at layer granularity)
```

## 相依圖的涵蓋範圍與邊界

- **僅涵蓋已宣告的分層。**<br>
  `architecture.layers` 以外的資料夾不會納入相依圖；排行榜會將其列為略過項目（如上例的 `legacy/`），避免把「未被掃描」誤讀為「沒有任何模組引用」。<br>
  查詢此類資料夾內的模組時，會直接說明原因：`✗ "legacy/" is not a declared layer`。
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
✗ blueprint.config.mjs: architecture.module.private must be an array.
```
