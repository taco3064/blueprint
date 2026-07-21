# 快速上手

## 全新專案 —— `blueprint init`

```bash
npx @kekkai/blueprint init
```

單一指令即可完成設計理念的開發護欄導入：

- 為每個宣告的分層建立 `src/<layer>/` 資料夾 —— 只在 source tree 是空的時候；已經有 code 的 repo，還沒長出來的 layer「不存在」就是它的真實狀態，不會硬造 `.gitkeep` 空殼
- `blueprint.config.mjs` —— 架構的唯一真實來源
- `eslint.config.mjs` —— 結構規則與第三方基礎規則
- `docs/architecture-handbook.md` 與 AI Agent 守則（`CLAUDE.md`、`AGENTS.md`）
- 將匯入別名寫入 `tsconfig.json` / `jsconfig.json` 的 `compilerOptions.paths`
- `.github/workflows/blueprint-ci.yml` —— 以 lint 與架構檢測作為 CI 的檢核關卡

框架種類由 `package.json` **自動偵測**（`--framework vue|react` 只在判不出來時才需要）；既有的 ESLint config **一律不覆蓋**（init 會改為提供合併指引；只有 init 自己生成、帶第一行 banner 的那份會就地重生成）；重複執行 init 的結果具冪等性。

## 既有專案 —— `blueprint inspect`

```bash
npx @kekkai/blueprint inspect
```

唯讀指令。掃描 `src/`、對照 blueprint config，列出所有違規與遷移建議；只要有 error 等級的違規，就以 exit code 1 結束。

歷史較久的專案第一次跑，通常會噴出一大片違規 —— **baseline 棘輪**正是為此設計：

```bash
npx @kekkai/blueprint inspect --update-baseline   # 把今天的債務記錄成 baseline
npx @kekkai/blueprint inspect --baseline          # CI：只攔「新增」的違規
```

從導入完成的那一刻起，AI 協作的產出就變得可控、可讀 —— 架構不再繼續惡化。債務清償之後，baseline 裡已經用不到的紀錄會被列出來提醒移除，檢核範圍隨之逐步收緊。零違規的專案不需要 baseline 檔案，`--baseline` 在沒有檔案時視同空 baseline 執行。

## 影響範圍 —— `blueprint deps`

```bash
npx @kekkai/blueprint deps hooks/useCart   # 查詢該模組被誰匯入、又匯入了誰
npx @kekkai/blueprint deps                 # 全模組排行：依被引用數排序
```

唯讀指令，逐模組回答「改動它會波及誰」。輸出長怎樣、查詢粒度、相依圖的邊界，見[影響範圍 —— deps](/zh-TW/guide/deps)。

## Blueprint config

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

亦可直接採用內建的預設藍圖 —— `vuePreset()` 與 `reactPreset()` 完整編碼了治理手冊的內容：六個分層、十條核心信念、七條元件形狀軸線、十八條作業守則。上述內容於[工程理念](/zh-TW/philosophy/)章節逐頁記載；所有匯出項目請參閱 [API 文件](/zh-TW/api/)。

preset 直接收 `emit`，並且會 merge 到它的 day-1 預設（`ci: 'github'`）之上 —— 宣告自己用的 agent 工具，不用犧牲「一行 preset」的形式：

```js
import { reactPreset } from '@kekkai/blueprint';

export default reactPreset({ name: 'my-app', alias: '@', emit: { agents: ['claude'] } });
```

preset 回傳的是一個普通的 `Blueprint` 物件，其他客製化用 spread 即可 —— 但注意 spread 層級的 `emit` 會**整顆蓋掉** preset 的預設：記得把 `ci: 'github'` 補回去，不然 CI workflow 會默默不產出。
