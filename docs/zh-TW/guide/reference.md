# 檢測與 config 總表

本頁彙整 blueprint 所有查得到的東西，以及指南各頁沒逐一說明的 config 欄位。<br>
完整型別簽名見 [API 文件](/zh-TW/api/)；本頁的定位是索引地圖。

## 執行環境需求

- **Node —— 最低 `^18.18.0 || ^20.9.0 || >=21.1.0`。**<br>
  這個下限是被跑出來的，不是從原始碼讀出來宣稱的：CI 用當前版本的 Node 建置，再把建置產物拿到 `18.18.0` 上執行 —— 因為被宣稱的就是這個版本。<br>
  **建議版本：本專案自己拿來建置與測試的那一版**，記在 [`.nvmrc`](https://github.com/taco3064/blueprint/blob/main/.nvmrc)，這裡刻意不抄一份 —— 抄進正文的版本號會在沒人發現的情況下過期。<br>
  高於下限的版本都能跑，那一版只是走得最熟的路。
- **ESLint 9 或 10，flat config** —— 兩個大版本都在每個承載外掛的 peer 範圍內，<br>
  所以 `init` 安裝 `eslint` 時不鎖版本，讓它解析到支援範圍內最新的那個。<br>
  CI 會拿整套測試在[兩個大版本上各跑一次](/zh-TW/guide/field-tested#這一頁背後有什麼)，所以你解析到的那一版是本專案實際執行過的，不只是宣告允許的。<br>
  舊制的 `.eslintrc` 是一次[遷移決策](/zh-TW/guide/field-tested#框架注意事項)，不會變成默默導入到一半的狀態。

Blueprint 會安裝已宣告的 JavaScript、TypeScript 與 Vue parser 依賴，確保安裝後也能一致地解析動態匯入目標。

## `inspect` 回報的檢測項目

只要有 `error` 等級的違規，就以 exit code 1 結束；`warn` 與 `info` 只提示、不影響檢核結果。<br>
測試檔案（`architecture.testFiles`）在這些項目上都豁免，但只豁免到 glob 掃得到的範圍 ——<br>
掃到、而且沒有一條 glob 對得上的檔案，會被當成一般原始碼檢查。

- **`undeclared-folder`** · error —— 原始碼資料夾落在宣告的拓撲之外：layer-first 模式是未宣告的頂層 layer；module-first 模式則是未宣告的外層 module 或 module 內層 layer
- **`flow-violation`** · error —— module 可達性或內層 flow 未通過，包括逆向匯入，或同一 module 內透過別名進行的同層匯入。可達 modules 之間的同 layer 匯入仍然合法
- **`canonical-alias`** · error —— 跨 layer 或 module 的匯入使用 `additionalAliases` 拼法，而不是 `architecture.alias`
- **`deep-import`** · error —— 別名匯入直接觸及資料夾 unit 的**內部**，未經公開入口
- **`relative-escape`** · error —— 相對路徑匯入越出所屬分層、逃逸出原始碼根目錄，或伸進鄰居 unit 的入口之後。<br>在 `folder` 佈局下，鄰居 unit **是**碰得到的 —— `../Sibling` 就是同層 unit 互相使用的方式，而且是唯一的方式，因為別名寫法（`~app/{自己這層}/Sibling`）仍然被擋
- **`package-ownership`** · error —— 從非擁有者分層匯入某分層專屬的套件（或受限的具名匯入）
- **`selfonly-reexport`** · error —— 再匯出標記為 `selfOnly` 的依賴 —— 僅可依賴，不可轉手輸出
- **`cycle`** · error —— unit 層級的循環匯入，並列出完整路徑。<br>每一組獨立的循環都會回報，一組互相依賴的 unit 算一筆 —— 所以數量就是工作量，不是「先找到的那一個」
- **`no-entry`** · warn —— 資料夾 unit 缺少公開入口檔 —— 外部無從匯入
- **`missing-module`** · info —— 已宣告的 module 尚無對應資料夾（僅 module-first）
- **`missing-layer`** · info —— 已宣告的 layer 尚無對應資料夾（僅 layer-first）。module-first 不要求先建立每個共享 layer 位置；位置在程式碼落地前都只是 runway
- **`owns-not-installed`** · info —— 某分層 `owns` 的套件不在 `package.json` 裡。<br>禁令已經產生、內容也正確，只是暫時還碰不到任何東西。<br>把套件裝起來，或是把這筆宣告拿掉，兩種都算解法
- **`declaratory-self-only`** · info —— `selfOnly` 保護的分層還沒有任何檔案 —— 再匯出禁令是宣告性的，要等 code 進來才會真正生效

既有專案可透過 [baseline 棘輪](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect)，把這份清單轉成「只攔新增的違規」。<br>
被 baseline 記錄的違規，是用「規則 + 路徑 + **subject**」來識別的 —— subject 指的是 import specifier、循環的成員這類東西，**不是**訊息文字。<br>
所以某次改版把訊息改得更好懂，不會害你的 gate 變紅。<br>
baseline 檔本身帶著這套識別方式的 `"version"`；<br>
在識別方式改變之前寫下的檔案會[被拒收，並附上重記的指令](/zh-TW/guide/getting-started#升級時已經有-baseline-檔)，而不是被拿去重新解讀。

### import graph 是怎麼讀出來的

靜態 import 與 re-export 從原始碼文字讀取；動態 `import()` 則解析 AST。<br>
字面值、不可變常數，以及可化約成確定字串的串接與 template 都會加入同一張圖。重新賦值、被遮蔽的 binding 與執行期才知道的表達式會刻意省略；`inspect` 與 `deps` 會明列其確切數量（以及 parse failure），不會把它們誤報成合法。

## 內嵌 ESLint 外掛

`emitLint` 在生成的 config 裡內建自訂規則 —— 不用額外安裝。<br>
其中兩條是結構規則、永遠開著；其餘由 `blueprint.rules` 的規則識別碼控制。<br>
plugin 物件本身也有匯出（`import { plugin } from '@kekkai/blueprint'`）—— 這是給「不 spread `emitLint`、想手動掛某條 `blueprint/*` 規則」的逃生口，其他人永遠用不到它：

- **`blueprint/relative-escape`** · 恆常啟用（結構規則）—— inspect 同名檢測的「看得懂深度」孿生版：<br>兩者呼叫同一個 `relativeVerdict`，所以任一方都不可能得出另一方不會同意的結論
- **`blueprint/import-boundary`** · 恆常啟用（結構規則）—— 跨 layer/module 強制使用 `architecture.alias`，並對可靜態求值的 dynamic import 套用相同 module、layer 與 folder-entry 判定
- **`blueprint/no-deep-watch`** · `rules.deepWatch` —— 禁用 `deep: true` 的監聽 —— 每次變更都會遍歷整個資料來源（Vue preset：`error`）
- **`blueprint/use-prefix`** · `rules.usePrefix` —— hook 分層匯出的函式必須帶 `use` 前綴（分層與前綴皆可設定）
- **`blueprint/use-prefix-needs-reactivity`** · `rules.usePrefixReactivity` —— 帶 `use` 前綴的檔案必須實際呼叫 reactive 或生命週期 API
- **`blueprint/test-filename-matches-source`** · `rules.testFilename` —— 測試檔必須有同目錄、同名的原始碼檔案
- **`blueprint/no-typedef-only-file`** · `rules.typedefOnlyFile` —— JS 檔案不得僅含 `@typedef` 宣告（僅套用於 `.js`）

另有三條**受管規則** —— 由 `layers` / `owns` / `alias` 轉譯而成、歸生成器管：`no-restricted-imports`、`no-restricted-syntax`、`no-restricted-globals`。<br>
這三條沒辦法透過 `lintOverrides` 設定；要調整就改 blueprint config 本身。<br>
dependency-flow 禁令、同層禁令與 `selfOnly` 再匯出 selector 都會透過每個已宣告別名，同時涵蓋裸的分層入口與其下所有路徑。<br>
這不會放寬資料夾 unit 的公開面：獲准的匯入者仍可使用 unit 入口，但不能伸進入口後方。

### 把受管規則併進自己的規則設定

flat config 是**取代**不是合併 —— 但只發生在「兩筆都命中的檔案」上 ——<br>
所以本來就有設 `no-restricted-syntax` 的 repo，在那些檔案上不能放著讓後面那筆贏：兩邊的選項必須併成同一筆。<br>
不過也就只有那些檔案。<br>
一筆設定對「不在自己 `files` 範圍內」的檔案什麼都不做，所以你的設定沒伸到的地方，spread 仍然在替 blueprint 執行它那一筆；<br>
兩邊範圍不一致時，要做的是把合併後的那一筆縮到重疊區，而不是把任一邊放寬去湊另一邊。<br>
你原本那一筆留在原處、繼續守 blueprint 從來沒管過的檔案 —— 而且不用搬。<br>
把合併後那一筆放在陣列**最後**就好：最後就同時在 spread 之後、也在你原本那筆之後，因為兩筆都命中的地方仍然是後面的贏。

合併那一筆需要的 `selfOnly` selector，`npx blueprint rules --json` 會照層帶出來，而且有兩種寫法，只有一種撐得過「貼上」這個動作：

- **要複製的是 `jsLiteral`** —— 這是 selector 的 JS 原始碼形式，連引號一起給。
- **`selectors` 是 ESLint 實際解析的那個值。**<br>
  對「用程式**組**設定」的情境是對的，對「用貼的」則是陷阱：<br>
  路徑分隔符在裡面是 `/` 的跳脫寫法（直接放裸 `/` 會讓 esquery 的正規式提早結束），<br>
  而 JavaScript 解析字串常值時會把同一個跳脫吃掉一層 —— 於是貼進去的 selector 在那個裸 `/` 就結束了。<br>
  不會有語法錯誤、lint 照樣是綠的，禁令則靜靜地什麼都沒擋到。
- **`testExemptions` 是一起附著的，得跟著搬過去。**<br>
  只靠 selector 重組一筆設定會安靜地把它弄丟，而且是最糟的那種安靜：合併後的那筆照跑，於是禁令開始伸進 glob 掃得到的那些測試檔。

禁令的**訊息文字**是你自己寫的 —— `doctor` 驗的是 selector，從來不驗訊息。

還有一條作用範圍要記著，它講的是這條檢查本身、跟你的 config 無關，所以併完之後仍然成立：<br>
**doctor 的合併存活檢查比對的是匯入禁令、全域物件與 selfOnly selector —— 不含套件歸屬。**<br>
所以一次弄丟套件禁令的合併，在那裡照樣是綠的，那一欄要你自己驗。<br>
`blueprint rules` 會在「你真的有分層持有套件」的情況下，把該跑的指令講出來。

## `blueprint.rules` —— 哪些識別碼會成為檢核關卡

`blueprint.rules` 裡的識別碼，只有機器查得動的才會轉譯成 lint 關卡。<br>
查得動的集合如下：

- **`maxLines`** → `max-lines` · error · 400
- **`maxLinesPerFunction`** → `max-lines-per-function` · warn · 100
- **`maxParams`** → `max-params` · warn · 3
- **`maxStatements`** → `max-statements` · warn · 15
- **`complexity`** → `complexity` · warn · 12
- **`unusedVars`** → `no-unused-vars`（TypeScript 專案自動改用 TS 感知版本）· error
- **`explicitAny`** → `@typescript-eslint/no-explicit-any` · error
- **`codeStyle`** → `@stylistic` 的 `customize()` 整組，加上 `max-len`、`linebreak-style` 與原生 `curly` —— 約 68 條 · error
- **`statementsPerLine`** → `@stylistic/max-statements-per-line`，寫死 `{ max: 1 }` · error
- **`statementPadding`** → `@stylistic/padding-line-between-statements`，帶固定的 17 條設定 · error
- **`importBlock`** → `import-x/first` + `import-x/no-duplicates` · error
- **`fixtureImports`** → 禁止產品程式碼匯入 fixture 目錄 · error（Vue preset）
- **`cycles`** → inspect 的 `cycle` 檢測（unit 層級，只在 inspect 執行時診斷；baseline 會保留已記錄的 finding）。生成 config 預設不做持續預防；能接受逐檔重查圖的成本時，可[選擇啟用 `import-x/no-cycle`](/zh-TW/guide/generated-artifacts#claude-md-agents-md-——-協作) · error
- **`deepWatch` / `usePrefix` / `usePrefixReactivity` / `testFilename` / `typedefOnlyFile`** → 上面外掛那節的規則（見上）

其餘任何識別碼（例如 `deadCode`）都屬於文件性質：會寫進手冊與 AI Agent 守則，作為 Agent 必須持守的判斷，但不會被說成硬性關卡。<br>
這個劃分就是[三種級別落點](/zh-TW/philosophy/#三種級別落點)的機制。

這整份對照隨時問得到工具本人：<br>
`npx blueprint rules` 會印出 catalog，有 config 時還會標註實際宣告的 tier。<br>
**在這裡開不起來的關卡，那一列會留著、標記 `unavailable here`，原因則單獨列在關卡列表上方** —— 例如 JS 專案上的 `explicitAny`、`testFiles: []` 旁邊的 `testFilename` —— 而不是連個交代都沒有就被拿掉。<br>
這也是為什麼這份 catalog 的列數會比 `inspect` 與 `doctor` 印的 `N/M 個選用關卡` 分母來得多：<br>
那個分母數的是「有東西開得起來」的關卡，而拿兩個數字對照的人會被告知差額落在哪一列，不用自己猜。

### 有五個關卡靠注入的外掛才活著

這個套件**沒有任何 runtime 依賴**，<br>
所以上面每一條會 emit 第三方規則的識別碼，都得由你把外掛交給 `emitLint`。<br>
而外掛缺席的關卡會**完全不 emit，同時 lint 照樣是綠的** —— 讀起來跟一次乾淨的合併一模一樣。<br>
生成的 config 三個外掛都接好了，`init` 也會裝；<br>
手動合併的 config 要自己把參數帶過去：

```js
import stylistic from '@stylistic/eslint-plugin';
import imports from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

export default [
  /* …你原本的設定 */
  ...emitLint(blueprint, { typescript: tseslint.plugin, stylistic, imports }),
];
```

- **`explicitAny`** 要 `typescript`。<br>
  跟 `unusedVars` 不一樣，這條沒有原生規則可以退回去 —— `any` 是 TypeScript 才有的東西，<br>
  所以在 JS 專案裡這個關卡沒有意義，`inspect` 會直接把它從涵蓋率的分母移掉，<br>
  而不是回報一個沒人開得起來的關卡。
- **`codeStyle`**、**`statementsPerLine`**、**`statementPadding`** 要 `stylistic`。<br>
  ESLint 自己的排版規則，在它把排版交給 `@stylistic` 那次就被標為 deprecated 並凍結了，<br>
  照原本的識別碼 emit 等於塞一批隨時會被移除的規則給使用者。<br>
  `codeStyle` 還會去讀外掛的 `configs.customize()` factory，讀不到就**直接拋錯**，<br>
  而不是安靜地什麼都不管。
- **`importBlock`** 要 `imports`。<br>
  ESLint 原生和 `@stylistic` 都沒有任何規則會合併重複的 import。

### 這裡是 ESLint 在管排版

`codeStyle` 不是包在 formatter 外面的便利層 —— **它就是 formatter**。<br>
兩個後果值得直說：

- **紅字本身就是完整的執行機制。**<br>
  不需要編輯器整合、不需要存檔掛鉤、也不假設誰用哪個編輯器：<br>
  agent 跑 lint、讀到紅字、自己修好。<br>
  約 68 條裡只有 5 條沒有自動修正，所以 `eslint --fix` 會清掉第一輪的絕大部分，<br>
  剩下的才是真的需要判斷的部分。
- **本來就有自己 formatter 的 repo，屬於「工具重疊」那一類。**<br>
  排版的所有權留一個，並把選了哪個記錄下來。<br>
  兩邊設在同一個 key 上的規則是機械性衝突 —— flat config 是取代而不是合併。

`codeStyle` 裡面有三個細節是刻意的，不是順手加的：

- **`statementsPerLine` 是讓 `maxLines` 有意義的那條。**<br>
  `maxLines` 數的是程式行（空行與註解跳過），<br>
  所以一個沒有限制「一行能裝多少」的行數預算，把敘述壓成一行就過得去 —— 根本不用拆檔案。<br>
  `{ max: 1 }` 寫死就是為了這件事：這個關卡的旋鈕是 tier。<br>
  `curly` 堵的是同一條路的下一層：沒有它，`if (x) return;` 會被算成一個敘述而溜過去。
- **`max-len` 不放過純字串，而且沒有自動修正。**<br>
  一個「行裡有字串就豁免」的長度上限不是上限；<br>
  而過長的行要的是重構，不是重排。
- **`linebreak-style` 是 `unix`，而它的紅字通常不是在講那個檔案。**<br>
  會炸的是混用換行，所以立場是全部 LF ——<br>
  但違規的成因通常在 git 的 `autocrlf` 或缺少 `.gitattributes`。<br>
  去那邊修，不然下次 checkout 就把自動修正蓋回去了。

可調參數：`indent`（2）、`quotes`（`single`）、`semi`（`true`）、`maxLen`（90），<br>
寫在 gate 上，例如 `codeStyle: { tier: 'error', indent: 4, maxLen: 120 }`。<br>
其餘都是固定的 —— 想要不一樣的括號風格就把這個關卡關掉，自己宣告一套。

一個實戰會咬人的範圍細節：**`emit.lint.severity` 只蓋結構家族**（`no-restricted-imports` / `-syntax` / `-globals`、`blueprint/relative-escape` 與 `blueprint/import-boundary`）。<br>
上面每條規則都吃自己的 `blueprint.rules` tier —— severity 設 `warn` **不會**讓 `maxLines` 或 `unusedVars` 變安靜。

## 快速上手範例以外的 config 欄位

[快速上手](/zh-TW/guide/getting-started#blueprint-config)的 `defineBlueprint` 範例涵蓋核心欄位。<br>
其餘欄位一覽如下 —— 完整結構見 [API 文件](/zh-TW/api/)：

### 承重的那一塊

結構規則全部從這裡編出來。<br>
這些鍵比上面那份關卡目錄更早存在，也因此一直只在範例裡露臉 —— 定義該有個家。

- **`architecture.alias`** —— 唯一 canonical 的原始碼根匯入拼法，例如 `~app`。<br>必填、沒有預設值；跨 layer/module 必須使用它
- **`architecture.modules`** —— 可選的外層應用模組；每個名稱對應 `sourceRoot` 的直屬子目錄。設定後，完整的 `layers` 清單會在每個一般模組內重複，不支援再混用全域 layer 資料夾。可選且保留的模組名稱 `app` 則跨 routing framework 代表遞迴的 router composition，使用既有 container position，不會重複共用 layers。模組可用 `dependsOn` 列出直接依賴；權限依 DAG 的遞移可達性判定，與宣告順序無關。未知模組、自我依賴、重複邊與 cycle 都是無效設定
- **`architecture.layers`** —— 有順序、由所有模組共用的分層清單。<br>**順序就是流向**：一個分層只能匯入排在它後面的分層。<br>因此宣告本身說不出回頭邊；unit 匯入 cycle 則只在 `blueprint inspect` 執行時診斷
- **`layer.does`** —— 一句話說明這層的程式碼是幹嘛的。<br>寫進手冊與 Agent 守則；沒有規則會強制它
- **`layer.mustNot`** —— 這層不該做的事，用白話寫。<br>去處相同、同樣不強制：規則判斷不了的時候，審查者與 Agent 讀的就是這幾句
- **`layer.allowedImporters`** —— 收窄「誰可以匯入這一層」。<br>不寫的話，排在前面的分層都可以；寫了就只有清單上的可以，而且每一個都必須是更早宣告的分層 —— 所以收窄永遠不可能生出一條回頭的邊。<br>條目可帶 `selfOnly`（可以依賴這層，但不得再往外轉出）與 `description`（手冊關係圖上那條邊的標籤）
- **`layer.owns`** —— 這層獨佔的基元，其他分層一律被擋。<br>直接給字串代表整個套件（`'axios'`）；物件形式可帶 `imports`（只鎖特定具名匯入，如 `['createContext']`）、`pattern`（把名稱當成 glob 群組）、`exempt`（豁免的檔案樣式）。<br>`{ global: 'fetch' }` 則是獨佔一個全域變數而不是套件
- **`layer.layout`** —— 此 layer 的 unit 佈局：`folder` 讓每個 unit 藏在公開入口後；`file` 保留原 flat 佈局以整層為依賴與相對匯入邊界的相容語意
- **`layer.entry`** —— folder unit 的公開入口檔名（預設 `index`）。鄰居 folder unit 只能透過入口（`../Sibling`）碰到

### 調校


- **`architecture.sourceRoot`** —— 分層所在目錄（相對於專案根目錄）。預設 `src`；根目錄式佈局（如無 `src/` 的 Next.js）設為 `.`。Lint、inspect、init scaffold、deps target 與產生的 agent placement guidance 都會從此根目錄解析來源路徑。Config 尚未建立時，survey 可由 TypeScript includes 推導根目錄式佈局；若 workspace 有多個 application root，則會要求明確選擇此欄位。
- **`architecture.additionalAliases`** —— 用於解析既有匯入、診斷與 dependency graph 的額外根。可指向 source root、其上層、module、layer 或 unit；但跨 layer/module 時不能當成替代拼法，必須改用 `architecture.alias`。

未設定 `architecture.modules` 時，blueprint 維持傳統 layer-first 軸；設定後則採 Module → Layer → Unit 拓撲，在每個已宣告的一般模組內重複相同 layer 契約。已宣告的 `app` 模組是可選且保留的 router composition module；其下所有受治理的原始碼都使用 container position，不會被解讀為內層 layer。受治理的匯入必須同時通過 module DAG 與共用的內層 layer flow。可達模組之間的同 layer 匯入仍然合法；相對路徑則依舊不能跨 module 或 layer 邊界。
- **`architecture.testFiles`** —— 豁免於結構規則與度量關卡的測試檔樣式（預設 `*.test.*` / `*.spec.*`）。<br>
  填 `[]` 代表不豁免任何檔 —— 測試檔跟著它那層的規則走 —— 同時也把 `testFilename` 這個關卡關掉：<br>
  那條規則的範圍就是這些測試檔樣式，空清單等於沒有檔可以讓它檢查。`blueprint rules` 會在該關卡旁邊講明。<br>
  宣告了、卻對不上任何檔的 glob，賠掉的是豁免、不是關卡 ——<br>
  這一輪讀到的檔案沒有一個因它而豁免。
- **`architecture.layerFiles`** —— 框架預設樣式不適用時，逐層指定檔案樣式
- **`architecture.layerFilesIgnore`** —— 從產出的 lint 與由 lint 執行的 `inspect` findings 中全域排除的檔案樣式。這些檔案仍會接受 undeclared folder、cycle 等只由 `inspect` 執行的檢查；coverage 會將它們列為刻意忽略，而不會宣稱 lint 已涵蓋

lint 與 inspect 共通的可攜 glob 語法，是以 `/` 分隔的路徑搭配 `**`、`*`、`?`，
以及 `*.{ts,tsx}` 這類單層 brace alternatives；`layerFiles` 另會把 `{layer}`
替換成每個已宣告的分層名稱。Module-first 自訂樣式還必須包含 `{module}`，
並展開 module × layer 的完整組合。Negation、character classes、extglobs 與巢狀 braces
不在共通語法內。維持在這個可攜子集合，lint 與 inspect 才會選到同一批檔案。
- **`architecture.naming`** —— 依概念設定的命名慣例（如 `{ hook: 'useX + reactivity' }`）—— 寫入手冊與守則
- **`layer.lintOverrides`** —— 逐層的 ESLint 調整（三條受管規則除外）
- **`emit.agents`** —— Agent 守則的發佈目標：`claude`、`agents`、`gemini`、`copilot`、`cursor`、`windsurf`（可逐目標指定 `path`）。預設 `['claude', 'agents']`；空陣列就不產出。縮窄清單後，下一次 init 會自動移除「整份都是自己產出」的過期守則檔（被人手改過的只提醒、不動手）
- **`emit.handbook` / `emit.lint`** —— 手冊輸出路徑 · **結構規則**的等級（度量規則吃自己的 `rules` tier）

## 命令列旗標

- **`init`** —— `--agent claude|codex`（啟動編寫／轉換用的 Agent CLI）· `--topology layer-first|module-first`（拓樸無法可靠判定時明確選擇；新目錄的 module-first target 進入 authoring，任何已確認的拓樸切換則進入受 Git preflight 保護的 Agent transformation；module-first 不可搭配 `--preset`，反向轉換需要現行 config，兩個方向都不會自動命名或搬移 source）· `--preset`（強制建立 layer-first preset）· `--authoring`（即使小 repo 也強制產 playbook；與 `--preset` 相反）· `--framework vue|react` · `--no-install` · `--dry-run`

layer-first → module-first 轉換要求：只選定一個 application、Git worktree 乾淨、存在可復原的 committed `HEAD`，且轉換前 inspection 能提供可靠證據。產出的 playbook 會分開帶入 container／page domain 候選 closure 與 page／App Router composition closure，並列出使用 inspect／deps canonical identity 的 edge、無法匹配的 alias-like import、有限的 relative path 結構證據、Git 搬移規則、cutover gate 與 baseline review；精確 relative file resolution 與 runtime-dependent import 仍是明確限制。domain 命名、ownership、merge／split、中立模組抽取、cycle 與 collision 則由 Agent 判斷，再以 `git mv` 搬移並改寫 import。Next.js App Router 保留原本的實體 `app/**`；Pages Router 因為需要框架 router migration，會在寫入前拒絕。

module-first → layer-first 以現行 config 為權威，並在搬移前列出完整的逐檔 mapping。一般 module 根層/container source 會對應至 `containers/<module>`；已宣告的內層 unit 依原有 folder/file layout 攤回全域 layer。所有 destination collision、orphan、cycle、無法匹配的 alias-like import、有限的 relative path target 與 import-analysis 限制都會列出。Agent 負責 collision 命名、模糊語意位置與 React/Vue router 判斷，再使用 `git mv`，同步切換 source、config、emitted rules 與 generated guidance。最終 config 移除 modules 與 `dependsOn`；Next.js App Router 保留實體 `app/**`，無法解析、混用或只有 Pages Router 的 Next 證據會在 mutation 前終止。
- **`survey`** —— `--alias <name>`（tsconfig paths 偵測不到別名時指定）· `--source-root <path>`（在 workspace 中選擇一個 application）· `--json`
- **`inspect`** —— `--baseline` · `--update-baseline` · `--framework vue|react` · `--json`
- **`impact`** —— `--json`
- **`deps [unit]`** —— `--framework vue|react` · `--json`
- **`rules`** —— `--json`
- **`doctor`** —— `--json`

所有指令都支援 `--help`；CLI 本身支援 `--version`。
