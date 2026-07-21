# 影響範圍 —— `blueprint deps`

`blueprint deps` 在異動任何模組之前，先回答一個問題：**改動這個模組，會波及誰？**此指令為唯讀操作，除 Blueprint 組態本身外不需任何額外設定，也不會寫入任何檔案。

它與 [`blueprint inspect`](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect) 的分工如下：`inspect` 負責**裁決**架構（違規項目、循環相依、以狀態碼 1 結束），`deps` 僅負責**描述** —— 逐模組列出被引用與引用的關係，不附帶任何判定。

## 操作方式

```bash
npx @kekkai/blueprint deps                      # 全模組排行：依被引用數排序
npx @kekkai/blueprint deps hooks/useCart        # 以模組鍵查詢單一模組
npx @kekkai/blueprint deps src/hooks/useCart/useCart.ts   # 以檔案路徑查詢，結果相同
```

三種輸入形式都會解析為相同的模組鍵 —— 是否帶有 `src/` 前綴、是否附上副檔名，均不影響查詢結果。

| 旗標 | 效果 |
| --- | --- |
| `--json` | 輸出機器可讀格式（供工具或 AI 代理使用） |
| `--framework vue\|react` | 專案無組態且框架無法自動判定時，強制指定預設藍圖 |

## 輸出結果

**不帶參數** —— 影響範圍排行榜。所有模組依「被多少模組匯入」排序，異動風險最高的模組列於最上方：

```
Blast radius (imported-by count):
  2 ← hooks/useCart
  1 ← services/api
  0 ← containers/Cart
  0 ← pages/Home
  (not under a declared layer, invisible to deps: legacy/)
```

**指定模組** —— 同時呈現上下游兩個方向。`imported by` 為異動此模組的影響範圍；`imports` 為此模組所依賴的對象：

```
hooks/useCart
  imported by (2):
    ← containers/Cart
    ← pages/Home
  imports (1):
    → services/api
```

**加上 `--json`** —— 相同資料的結構化形式。排行榜的輸出結構為 `{ modules, skipped }`；單一模組查詢則回傳該模組物件：

```json
{
  "module": "hooks/useCart",
  "importedBy": ["containers/Cart", "pages/Home"],
  "imports": ["services/api"]
}
```

查詢不存在的模組時，以狀態碼 1 結束，並提示可執行排行榜列出所有模組；查詢成功則以狀態碼 0 結束。

## 查詢粒度 —— 由 `module.layout` 決定

每個查詢結果的單位是**模組**，而模組的界定方式取決於 Blueprint 組態中的 [`module.layout`](/zh-TW/api/interfaces/ModuleDef)（可透過 `layer.module` 逐層覆寫）：

- **`folder` 佈局** —— 分層之下的每個直屬子項各自成為一個模組（`hooks/useCart`、`components/HelloWorld`）。直屬檔案的模組鍵不含副檔名，因此 `deps components/HelloWorld` 與 `components/HelloWorld.vue` 指向同一個模組。
- **`flat` 佈局** —— 整個分層收斂為**單一節點**。此佈局適用於「巢狀資料夾並非模組」的分層 —— 例如 Next.js 的路由樹，`app/(marketing)/pricing/page.tsx` 是一條路由，而非功能資料夾。粒度切換時，deps 會明確標示，不會無聲改變回答的層級：

```
app (flat layer — answers at layer granularity)
```

## 相依圖的涵蓋範圍與邊界

- **僅涵蓋已宣告的分層。**`architecture.layers` 以外的資料夾不會納入相依圖；排行榜會將其列為略過項目（如上例的 `legacy/`），避免把「未被掃描」誤讀為「沒有任何模組引用」。查詢此類資料夾內的模組時，會直接說明原因：`✗ "legacy/" is not a declared layer`。
- **測試檔案一律排除**（`architecture.testFiles`）—— 測試對模組的匯入不計入影響範圍，與程式碼檢查側的行為一致。
- **僅有別名匯入與相對路徑匯入會構成相依邊。**套件匯入（`axios`、`vue`）不屬於模組相依圖 —— 套件的**所有權**檢核屬於 `inspect` 的職責。
- **循環相依僅如實列出，不作裁決。**兩個互相匯入的模組，會分別出現在彼此的上下游清單中；裁決屬於 `inspect` 的職責。

## 組態驗證

手寫且未經 `defineBlueprint` 包裝的 `blueprint.config.mjs`，於載入時仍會執行完整驗證。結構性錯誤會立即以精確訊息回報，而非在指令執行過程中拋出難以定位的例外：

```
✗ blueprint.config.mjs: architecture.module.private must be an array.
```
