# 快速上手

## 全新專案 —— `blueprint init`

```bash
npx @kekkai/blueprint init --structure flat
```

**這裡有一個旗標不是選填的**，而且就只有這一個。<br>
在低於既有專案門檻（10 個原始碼檔）的樹上，根本沒東西可量，所以 `init` 選擇拒絕而不是替你挑，並把兩個選項連同取捨一起印出來：

```
✗ blueprint init needs --structure here: 0 source files, below the brownfield threshold (10) — there is nothing here to measure, so this is your call, not a detection failure.
```

`flat` 是把分層擺在原始碼根目錄；<br>
`modular` 是把功能模組擺在那裡，每個模組裡面各有一份那些分層。<br>
兩者之間 config 的遷移不用錢、檔案的遷移要 —— 所以這是第一天就得決定的事，也是沒有任何東西會替你猜的原因。<br>
**[扁平還是模組化](/zh-TW/guide/structure)把兩棵樹都畫出來了。**<br>
超過門檻時 `init` 根本不會問：它讀你已經有的佈局。

這一題答完之後，一個指令就替你的設計理念裝好護欄：

- `src/<layer>/` 資料夾 —— **只在 source tree 全空時**建立；<br>
  已經有 code 的 repo，還沒長出來的 layer「不存在」就是它的真實狀態，不會硬造 `.gitkeep` 空殼。<br>
  在 `--structure modular` 之下，被建出來的改成模組資料夾與它們的入口檔 —— 因為那裡的分層是模組**裡面**的資料夾
- `blueprint.config.mjs` —— 架構的唯一真實來源
- `eslint.config.mjs` —— 結構規則與第三方基礎規則
- `docs/architecture-handbook.md` 與 AI Agent 守則（`CLAUDE.md`、`AGENTS.md`）
- 將匯入別名寫入 `tsconfig.json` / `jsconfig.json` 的 `compilerOptions.paths`

框架種類由 `package.json` **自動偵測**（`--framework vue|react` 只在判不出來時才需要）；<br>
既有的 ESLint config **一律不覆蓋**（init 會改為提供合併指引；只有 init 自己生成、帶第一行 banner 的那份會就地重生成）；<br>
重複執行 init 的結果具冪等性 —— 而且 config 已經存在時，再帶 `--structure` 跑一次什麼都不會變，因為那份 config 本身就是答案。

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
變的是「拿什麼來辨識一筆紀錄」——<br>
而拒收訊息講的是「你手上這個版本」發生了什麼事，不是拿別人的升級來搪塞你：

- **版本 2 → 3**，也就是 `4.0.0` 這一次。<br>
  `relative-escape` 原本是一個檢測項目識別碼，卻蓋住三種不同的相對路徑匯入問題，害得一則遷移建議得同時回答三件事。<br>
  現在拆成 `src-escape`、`entry-bypass`、`layer-escape`，各自點名「對它而言合法的那個動作」。<br>
  識別碼是紀錄鍵的一部分，所以用舊識別碼記下來的項目一項都對不上
- **版本 1 → 2**，更早以前那一次。<br>
  以前識別方式包含違規的**訊息文字**，而訊息正是「違規本身沒變、它卻會變」的那一部分 ——<br>
  所以只要改寫任何一則訊息，那條規則底下的 baseline 紀錄就會靜悄悄全部失效：舊債以 `fresh` 的身分回來、原本記下的紀錄被算成 `stale`，一次沒改任何 code 的升級就讓既有專案的 CI 變紅。<br>
  現在的識別方式是規則、路徑，以及 **subject**（匯入的 specifier、循環依賴的成員）

舊檔是被拒收，而不是拿新規則去重新解讀它 ——<br>
因為用新的識別方式去讀，它會一項都對不上，那正是棘輪存在的目的所要防止的滿江紅，而且來得沒有任何說明。<br>
現在寫出來的檔案標記的是 `"version": 3`；`--json` 的使用者這邊，每一筆檢測項目都帶 `subject`。

`4.0.0` 其他會壞掉的東西，照你撞到的順序整理在這裡：<br>
[升級到 4.0.0](/zh-TW/guide/upgrading)。

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
      { name: 'components', does: '可重用的使用者介面元件', mustNot: ['呼叫 services'], layout: 'folder' },
      { name: 'hooks', does: '加工伺服器資料與共享狀態', layout: 'folder' },
      {
        name: 'services',
        does: '網路存取原語',
        owns: ['axios', { global: 'fetch' }],
        allowedImporters: ['hooks'],
        layout: 'folder',
      },
    ],
  },
});
```

`layout` 是單元形狀，寫在真正有這個形狀的那一層上：<br>
`folder` 代表一個單元一個資料夾、外面只看得到 `index`；不寫這個鍵就等於 `file`。<br>
想改用手寫的方式宣告模組化結構，就加上 `architecture.modules` ——<br>
[扁平還是模組化](/zh-TW/guide/structure)把兩種形狀並排放在一起。

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
