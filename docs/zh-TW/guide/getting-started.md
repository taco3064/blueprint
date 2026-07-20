# 快速上手

## 全新專案 —— `blueprint init`

```bash
npx @kekkai/blueprint init
```

單一指令即完成整套運作契約的建置：

- 為每個宣告的分層建立 `src/<layer>/` 資料夾
- `blueprint.config.mjs` —— 架構的唯一真實來源
- `eslint.config.mjs` —— 結構規則與第三方基礎規則
- `docs/architecture-handbook.md` 與 AI 代理契約（`CLAUDE.md`、`AGENTS.md`）
- 將匯入別名寫入 `tsconfig.json` / `jsconfig.json` 的 `compilerOptions.paths`
- `.github/workflows/blueprint-ci.yml` —— 以程式碼檢查與架構檢測作為持續整合的檢核關卡

框架種類由 `package.json` **自動偵測**（`--framework vue|react` 僅在無法判定時使用）；既有的 ESLint 組態**一律不覆蓋**（init 會改為提供合併指引）；重複執行 init 的結果具冪等性。

## 既有專案 —— `blueprint inspect`

```bash
npx @kekkai/blueprint inspect
```

唯讀指令。掃描 `src/`、對照 Blueprint 組態，輸出架構報告與遷移建議。凡存在錯誤等級的檢測項目，即以狀態碼 1 結束。

歷史較久的專案首次執行時，通常會出現大量檢測項目 —— **基準棘輪機制**正是為此設計：

```bash
npx @kekkai/blueprint inspect --update-baseline   # 將既有債務記錄為基準
npx @kekkai/blueprint inspect --baseline          # 持續整合：僅攔截「新增」的違規
```

自建立基準當日起，架構品質不再惡化；既有債務清償後，過時的基準條目會被明確列出，檢核範圍隨之逐步收緊。檢測項目為零的專案不需要基準檔案，`--baseline` 在無基準檔時視同空基準執行。

## 影響範圍 —— `blueprint deps`

```bash
npx @kekkai/blueprint deps hooks/useCart   # 查詢該模組被誰匯入、又匯入了誰
npx @kekkai/blueprint deps                 # 全模組排行：依被引用數排序
```

## Blueprint 組態

```js
// blueprint.config.mjs
import { defineBlueprint } from '@kekkai/blueprint';

export default defineBlueprint({
  framework: 'vue',
  architecture: {
    alias: '~app',
    layers: [
      { name: 'components', does: '可重用的使用者介面元件', mustNot: ['呼叫 services'] },
      { name: 'hooks', does: '加工伺服器資料與共享狀態' },
      {
        name: 'services',
        does: '網路存取原語',
        owns: ['axios', { global: 'fetch' }],
        allowedImporters: ['hooks'],
      },
    ],
    flow: 'one-way',
    module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
  },
});
```

亦可直接採用內建的預設藍圖 —— `vuePreset()` 與 `reactPreset()` 完整編碼了治理手冊的內容：六個分層、十條核心信念、七條元件形狀軸線、十八條作業守則。所有匯出項目請參閱 [API 文件](/zh-TW/api/)。
