# 快速上手

## 全新專案 —— `blueprint init`

```bash
npx @kekkai/blueprint init
```

單一指令即可完成設計理念的開發護欄導入：

- `src/<layer>/` 資料夾 —— **只在 source tree 全空時**建立；<br>
  已經有 code 的 repo，還沒長出來的 layer「不存在」就是它的真實狀態，不會硬造 `.gitkeep` 空殼
- `blueprint.config.mjs` —— 架構的唯一真實來源
- `eslint.config.mjs` —— 結構規則與第三方基礎規則
- `docs/architecture-handbook.md` 與 AI Agent 守則（`CLAUDE.md`、`AGENTS.md`）
- 將匯入別名寫入 `tsconfig.json` / `jsconfig.json` 的 `compilerOptions.paths`

框架種類由 `package.json` **自動偵測**（`--framework vue|react` 只在判不出來時才需要）；<br>
既有的 ESLint config **一律不覆蓋**（init 會改為提供合併指引；只有 init 自己生成、帶第一行 banner 的那份會就地重生成）；<br>
重複執行 init 的結果具冪等性。

## 既有專案 —— `blueprint inspect`

```bash
npx @kekkai/blueprint inspect
```

唯讀指令。<br>
掃描 `src/`、對照 blueprint config，列出所有違規與遷移建議；<br>
只要有 error 等級的違規，就以 exit code 1 結束。

歷史較久的專案第一次跑，通常會噴出一大片違規 ——<br>
**baseline 棘輪**正是為此設計：

```bash
npx @kekkai/blueprint inspect --update-baseline   # 把今天的債務記錄成 baseline
npx @kekkai/blueprint inspect --baseline          # gate：只攔「新增」的違規
```

從導入完成的那一刻起，AI 協作的產出就變得可控、可讀 —— 架構不再繼續惡化。<br>
債務清償之後，baseline 裡已經用不到的紀錄會被列出來提醒移除，檢核範圍隨之逐步收緊。<br>
零違規的專案不需要 baseline 檔案，`--baseline` 在沒有檔案時視同空 baseline 執行。

### 升級時已經有 baseline 檔

**升級後第一次執行會拒收既有的 `.blueprint-baseline.json`，並印出一行指令** —— 重記一次，只需要這一次：

```bash
npx @kekkai/blueprint inspect --update-baseline
```

重記之後記錄的是同一批債務：原本被抑制的，沒有任何一項會變成不抑制。<br>
變的是「拿什麼來辨識一筆紀錄」。<br>
以前它包含違規的**訊息文字**，而訊息正是「違規本身沒變、它卻會變」的那一部分 ——<br>
所以只要改寫任何一則訊息，那條規則底下的 baseline 紀錄就會靜悄悄全部失效：舊債以 `fresh` 的身分回來、原本記下的紀錄被算成 `stale`，一次沒改任何 code 的升級就讓既有專案的 CI 變紅。<br>
現在的識別方式是規則、路徑，以及 **subject**（匯入的 specifier、循環依賴的成員）。

舊檔是被拒收，而不是拿新規則去重新解讀它 ——<br>
因為用新的識別方式去讀，它會一項都對不上，那正是棘輪存在的目的所要防止的滿江紅，而且來得沒有任何說明。<br>
`--json` 的使用者這邊同時多了兩件事：每一筆檢測項目都帶 `subject`，檔案本身標記 `"version": 2`。

## 影響範圍 —— `blueprint deps`

```bash
npx @kekkai/blueprint deps hooks/useCart   # 查詢該模組被誰匯入、又匯入了誰
npx @kekkai/blueprint deps                 # 全模組排行：依被引用數排序
```

唯讀指令，逐模組回答「改動它會波及誰」。<br>
輸出長怎樣、查詢粒度、相依圖的邊界，見[影響範圍 —— deps](/zh-TW/guide/deps)。

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
    module: { layout: 'folder', entry: 'index', private: ['hooks', 'styles', 'types'] },
  },
});
```

亦可直接採用內建的 preset ——<br>
`vuePreset()` 與 `reactPreset()` 完整編碼了治理手冊的內容：分層架構、核心信念、元件設計軸線與作業守則。<br>
上述內容於[工程理念](/zh-TW/philosophy/)章節逐頁記載；所有匯出項目請參閱 [API 文件](/zh-TW/api/)。

preset 直接收 `emit` ——<br>
宣告自己用的 agent 工具，不用犧牲「一行 preset」的形式：

```js
import { reactPreset } from '@kekkai/blueprint';

export default reactPreset({ name: 'my-app', alias: '@', emit: { agents: ['claude'] } });
```

preset 回傳的是一個普通的 `Blueprint` 物件，<br>
其他客製化用 spread 即可。
