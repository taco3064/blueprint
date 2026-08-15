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

除此之外沒有別的 —— 套件本身零執行期依賴。

## `inspect` 回報的檢測項目

只要有 `error` 等級的違規，就以 exit code 1 結束；`warn` 與 `info` 只提示、不影響檢核結果。<br>
測試檔案（`architecture.testFiles`）一律豁免。

其中有幾項只在某一種[根結構](/zh-TW/guide/structure)下才會出現，下面會標上 **僅扁平** 或 **僅模組化**。<br>
在 `modules` 之下，分層是模組**裡面**的資料夾，所以兩套詞彙不重疊 —— 沒有任何一個 repo 會二十項全碰到。

- **`structure-mismatch`** · error —— 磁碟上的樹是一種結構模型，config 宣告的卻是另一種。<br>它在任何單筆宣告被判斷之前就先報，因為照著磁碟現況把資料夾宣告一遍會直接變綠，把問題蓋掉
- **`undeclared-folder`** · error · 僅扁平 —— 原始碼根目錄下存在未宣告為分層的資料夾
- **`undeclared-module`** · error · 僅模組化 —— 原始碼根目錄下的資料夾不在 `architecture.modules` 裡。<br>裡面的東西完全不受治理：分層的 glob 是從宣告清單展開的，所以那個資料夾裡沒有任何 glob 命中，每一條結構禁令都是空的 —— 而 lint 全程是綠的
- **`flow-violation`** · error —— 逆向匯入，或透過別名進行的同層匯入
- **`deep-import`** · error —— 別名匯入直接觸及單元的**內部**，未經公開入口。<br>在 `modules` 之下，同一個 id 也回答上面一層 —— 伸進模組內部而非走 `~app/<Module>` —— 每則訊息會講明自己指的是哪一層
- **`src-escape`** · error —— 相對路徑爬到原始碼根目錄之上。改用專案別名
- **`entry-bypass`** · error —— 相對路徑伸進鄰居單元的入口之後。<br>`../Sibling` 是同層邊唯一合法的寫法；別名寫法（`~app/{自己這層}/Sibling`）仍然被擋 —— 所以鄰居**是**碰得到的，而且只有這一種碰法
- **`layer-escape`** · error —— 相對路徑越出所屬分層。改用別名，或把共用的部分下沉到更低的分層
- **`root-import`** · error · 僅模組化 —— 分層往上碰到自己的模組根，不論是相對路徑還是任何一種別名寫法。<br>模組根負責組裝各分層，所以流量只能往下走
- **`module-escape`** · error · 僅模組化 —— 用相對路徑跨越模組邊界。<br>跨模組邊界只能走別名，沒有第二種寫法
- **`undeclared-dependency`** · error · 僅模組化 —— 跨模組匯入，但匯入方從沒在自己的 `imports` 裡指名對方。<br>模組碰不到任何它沒宣告過的東西，而且只能指名宣告在自己後面的模組
- **`package-ownership`** · error —— 從非擁有者匯入被獨佔的套件（或受限的具名匯入）。<br>這個 id 扛兩個層級：分層的 `owns` 擋掉其他所有分層，在 `modules` 之下模組的 `owns` 擋掉其他所有模組
- **`selfonly-reexport`** · error —— 再匯出標記為 `selfOnly` 的依賴 —— 僅可依賴，不可轉手輸出
- **`module-reexport`** · error · 僅模組化 —— 把別的模組的公開介面透過自己這一個轉出去，任何寫法都算。<br>需要它的消費端自己去宣告那個模組。<br>包一層來表達自己模組的責任是可以的；純粹為了過規則而包的那種會變綠，但什麼也沒建起來
- **`cycle`** · error —— 模組層級的循環匯入，並列出整條環路。<br>每一組獨立的循環都會回報，一組互相依賴的模組算一筆 —— 所以數量就是工作量，不是「先找到的那一個」。<br>它印出來的位址是**模組鍵**（`components/A`），其他檢測項目的路徑則是相對於專案根目錄（`src/components/A`）；<br>模組鍵正是 [`blueprint deps`](/zh-TW/guide/deps) 吃的寫法，報告上的位址可以直接貼過去查
- **`no-entry`** · warn —— 資料夾式單元缺少公開入口檔 —— 外部無從匯入。<br>在 `modules` 之下，同一個 id 也回答上面一層：已宣告的模組資料夾裡有 code，卻沒有自己的入口檔。<br>每則訊息會講明是哪一層
- **`missing-layer`** · info —— 已宣告的分層尚無對應資料夾；在 `modules` 之下則是「還沒有任何模組裡放了它的 code」。<br>這是跑道不是待辦：規則會在 code 進來時自動啟用，留著才是預設
- **`missing-module`** · info · 僅模組化 —— 已宣告的模組尚無對應資料夾。<br>它的 glob 與禁令都已經產生、內容也正確，只是暫時還碰不到任何東西。<br>把它建起來，或是把宣告拿掉，兩種都算解法
- **`owns-not-installed`** · info —— `owns` 指名的套件不在 `package.json` 裡。<br>禁令已經產生、內容也正確，只是暫時還碰不到任何東西。<br>把套件裝起來，或是把這筆宣告拿掉，兩種都算解法。<br>這則提示掛在「是誰宣告的」那一層上 —— 分層或模組都可能
- **`declaratory-self-only`** · info —— `selfOnly` 保護的分層還沒有任何檔案 —— 再匯出禁令是宣告性的，要等 code 進來才會真正生效

既有專案可透過 [baseline 棘輪](/zh-TW/guide/getting-started#既有專案-——-blueprint-inspect)，把這份清單轉成「只攔新增的違規」。<br>
被 baseline 記錄的違規，是用「規則 + 路徑 + **subject**」來識別的 —— subject 指的是 import specifier、循環的成員這類東西，**不是**訊息文字。<br>
所以某次改版把訊息改得更好懂，不會害你的 gate 變紅。<br>
baseline 檔本身帶著這套識別方式的 `"version"`；<br>
在識別方式改變之前寫下的檔案會[被拒收，並附上重記的指令](/zh-TW/guide/getting-started#升級時已經有-baseline-檔)，而不是被拿去重新解讀。

### import graph 是怎麼讀出來的

上面每一條跟 import 有關的檢測，都是從一張圖上讀出來的，而那張圖是**從原始碼文字掃出來的，不是解析 AST**。<br>
算出來的 specifier（`import(path)`、`require(name)`）、`import * as` 背後的個別名稱、字串裡長得像 import 的文字，都在它看不到的範圍內。<br>
`inspect` 跟 `deps` 的輸出都會以這段說明收尾 —— 因為報告乾淨的時候，才是它最要緊的時候。

**硬性 gate 沒有這個限制**：它們跑在 ESLint 上、走 AST。<br>
所以 `inspect` 是盤點，你的 lint 才是單一 import 的判決 —— 這也正是「`blueprint inspect` 本身不等於 gate」的原因。

## 內嵌 ESLint 外掛

`emitLint` 在生成的 config 裡內建自訂規則 —— 不用額外安裝。<br>
其中三條是結構規則，沒有任何 `blueprint.rules` 識別碼可以開關它們；其餘由 `blueprint.rules` 的規則識別碼控制。<br>
plugin 物件本身也有匯出（`import { plugin } from '@kekkai/blueprint'`）—— 這是給「不 spread `emitLint`、想手動掛某條 `blueprint/*` 規則」的逃生口，其他人永遠用不到它：

- **`blueprint/relative-escape`** · 恆常啟用（結構規則）—— inspect 那一整組相對路徑檢測（`src-escape`、`entry-bypass`、`layer-escape`、`module-escape`，以及 `root-import` 的相對路徑寫法）的「看得懂深度」孿生版：<br>兩者呼叫同一個 `relativeVerdict`，所以任一方都不可能得出另一方不會同意的結論
- **`blueprint/no-module-root-import`** · 結構規則，只在有 `architecture.modules` 時產生 —— 分層用任何一種別名寫法往上碰自己的模組根。<br>其中兩種寫法由入口的 `paths` 清單擋掉，這條負責剩下的，包含根單元自己的檔名 —— 那是任何 pattern 都列舉不完的
- **`blueprint/no-module-reexport`** · 結構規則，只在有 `architecture.modules` 時產生 —— 把別的模組的公開介面透過自己這一個轉出去。<br>它跟的是本地的 **binding**，所以拆成兩句寫、以及任何改名，都算同一種違規
- **`blueprint/no-deep-watch`** · `rules.deepWatch` —— 禁用 `deep: true` 的監聽 —— 每次變更都會遍歷整個資料來源（Vue preset：`error`）
- **`blueprint/use-prefix`** · `rules.usePrefix` —— hook 分層匯出的函式必須帶 `use` 前綴（分層與前綴皆可設定）
- **`blueprint/use-prefix-needs-reactivity`** · `rules.usePrefixReactivity` —— 帶 `use` 前綴的檔案必須實際呼叫 reactive 或生命週期 API
- **`blueprint/test-filename-matches-source`** · `rules.testFilename` —— 測試檔必須有同目錄、同名的原始碼檔案
- **`blueprint/no-typedef-only-file`** · `rules.typedefOnlyFile` —— JS 檔案不得僅含 `@typedef` 宣告（僅套用於 `.js`）

另有三條**受管規則** —— 由 `layers` / `owns` / `alias` 轉譯而成、歸生成器管：`no-restricted-imports`、`no-restricted-syntax`、`no-restricted-globals`。<br>
這三條沒辦法透過 `lintOverrides` 設定；要調整就改 blueprint config 本身。

### 把受管規則併進自己的規則設定

flat config 是**取代**不是合併 —— 但只發生在「兩筆都命中的檔案」上 ——<br>
所以本來就有設 `no-restricted-syntax` 的 repo，在那些檔案上不能放著讓後面那筆贏：兩邊的選項必須併成同一筆。<br>
不過也就只有那些檔案。<br>
一筆設定對「不在自己 `files` 範圍內」的檔案什麼都不做，所以你的設定沒伸到的地方，spread 仍然在替 blueprint 執行它那一筆；<br>
兩邊範圍不一致時，要做的是把合併後的那一筆縮到重疊區，而不是把任一邊放寬去湊另一邊。<br>
你原本那一筆留在原處、繼續守 blueprint 從來沒管過的檔案 —— 而且不用搬。<br>
把合併後那一筆放在陣列**最後**就好：最後就同時在 spread 之後、也在你原本那筆之後，因為兩筆都命中的地方仍然是後面的贏。

合併那一筆需要的 `selfOnly` selector，`npx blueprint rules --json` 會一列一列帶出來 —— 一列對應一筆實際輸出的設定 —— 而且有兩種寫法，只有一種撐得過「貼上」這個動作：

- **`zone` 講的是這一列在管什麼，而它不一定是某一層。**<br>
  flat config 下是一層一列，每一列都帶 `layer`。<br>
  宣告 [`modules`](/zh-TW/guide/structure) 之後，變成一組（`module`、`layer`）一列，<br>
  再加上每個模組自己的 zone 各一列 —— 有分層的模組是它自己的根（`zone: "root"`），`layers: false` 的模組則是整包（`zone: "module"`）。<br>
  這兩種都不帶 `layer`，也沒有 selector，因為 `allowedImporters` 是「層」的欄位。<br>
  要拿的是「你真正要合併的那一筆」所對應的那一列：模組預設彼此隔離，所以隔壁模組的 selector 是另一個字串，<br>
  貼錯列就會裝上一條什麼都擋不到的規則，而 lint 照樣是綠的。
- **要複製的是 `jsLiteral`** —— 這是 selector 的 JS 原始碼形式，連引號一起給。
- **`selectors` 是 ESLint 實際解析的那個值。**<br>
  對「用程式**組**設定」的情境是對的，對「用貼的」則是陷阱：<br>
  路徑分隔符在裡面是 `/` 的跳脫寫法（直接放裸 `/` 會讓 esquery 的正規式提早結束），<br>
  而 JavaScript 解析字串常值時會把同一個跳脫吃掉一層 —— 於是貼進去的 selector 在那個裸 `/` 就結束了。<br>
  不會有語法錯誤、lint 照樣是綠的，禁令則靜靜地什麼都沒擋到。
- **`testExemptions` 是一起附著的，得跟著搬過去。**<br>
  只靠 selector 重組一筆設定會安靜地把它弄丟，而且是最糟的那種安靜：合併後的那筆照跑，於是禁令開始伸進你的測試檔。

禁令的**訊息文字**是你自己寫的 —— `doctor` 驗的是 selector，從來不驗訊息。

還有一條作用範圍要記著，它講的是這條檢查本身、跟你的 config 無關，所以併完之後仍然成立：<br>
**doctor 的合併存活檢查比對的是匯入禁令、全域物件、module-root 禁令與 selfOnly selector，外加內嵌的 `blueprint/*` 規則 —— 那幾條在 `rules` 的輸出裡根本不是一欄 —— 不含套件歸屬。**<br>
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
- **`cycles`** → inspect 的 `cycle` 檢測（模組層級；生成 config 已不再帶 `import/no-cycle` —— 它逐檔重查同一張圖，850 檔實測要 92 秒）· error
- **`deepWatch` / `usePrefix` / `usePrefixReactivity` / `testFilename` / `typedefOnlyFile`** → 上面外掛那節的規則（見上）

其餘任何識別碼（例如 `deadCode`）都屬於文件性質：會寫進手冊與 AI Agent 守則，作為 Agent 必須持守的判斷，但不會被說成硬性關卡。<br>
這個劃分就是[三種級別落點](/zh-TW/philosophy/#三種級別落點)的機制。

這整份對照隨時問得到工具本人：<br>
`npx blueprint rules` 會印出 catalog，有 config 時還會標註實際宣告的 tier。<br>
**這套技術棧開不起來的關卡，那一列會留著、並且附上原因** —— 例如 JS 專案上的 `explicitAny`、`testFiles: []` 旁邊的 `testFilename` —— 而不是連個交代都沒有就被拿掉。<br>
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

一個實戰會咬人的範圍細節：**`emit.lint.severity` 只蓋結構家族** ——<br>
`no-restricted-imports` / `-syntax` / `-globals`、`blueprint/relative-escape`，以及有 `architecture.modules` 時才產生的那兩條（`blueprint/no-module-root-import`、`blueprint/no-module-reexport`）。<br>
上面每條規則都吃自己的 `blueprint.rules` tier —— severity 設 `warn` **不會**讓 `maxLines` 或 `unusedVars` 變安靜。

## 快速上手範例以外的 config 欄位

[快速上手](/zh-TW/guide/getting-started#blueprint-config)的 `defineBlueprint` 範例涵蓋核心欄位。<br>
其餘欄位一覽如下 —— 完整結構見 [API 文件](/zh-TW/api/)：

### 承重的那一塊

結構規則全部從這裡編出來。<br>
這些鍵比上面那份關卡目錄更早存在，也因此一直只在範例裡露臉 —— 定義該有個家。

- **`architecture.alias`** —— 專案的匯入根，例如 `~app`。<br>必填、沒有預設值：猜錯的別名會讓非法匯入靜靜通過，因為每一條結構禁令的樣式都是拿這個字串組出來的
- **`architecture.layers`** —— 有順序的分層清單。<br>**順序就是流向**：一個分層只能匯入排在它後面的分層。<br>把方向寫成「順序」而不是「一條條的邊」，單向與無環就是結構本身保證的 —— 環不是「你被擋著不准寫」，是這個形狀根本說不出那句話
- **`layer.does`** —— 一句話說明這層的程式碼是幹嘛的。<br>寫進手冊與 Agent 守則；沒有規則會強制它
- **`layer.mustNot`** —— 這層不該做的事，用白話寫。<br>去處相同、同樣不強制：規則判斷不了的時候，審查者與 Agent 讀的就是這幾句
- **`layer.allowedImporters`** —— 收窄「誰可以匯入這一層」。<br>不寫的話，排在前面的分層都可以；寫了就只有清單上的可以，而且每一個都必須是更早宣告的分層 —— 所以收窄永遠不可能生出一條回頭的邊。<br>條目可帶 `selfOnly`（可以依賴這層，但不得再往外轉出）與 `description`（手冊關係圖上那條邊的標籤）
- **`layer.owns`** —— 這層獨佔的基元，其他分層一律被擋。<br>直接給字串代表整個套件（`'axios'`）；物件形式可帶 `imports`（只鎖特定具名匯入，如 `['createContext']`）、`pattern`（把名稱當成 glob 群組）、`exempt`（豁免的檔案樣式）。<br>`{ global: 'fetch' }` 則是獨佔一個全域變數而不是套件
- **`layer.layout` / `layer.entry`** —— 單元形狀，寫在真正有這個形狀的那一層上。<br>`layout` 是 `folder`（一個單元一個資料夾、外面只看得到公開入口）或 `file`（一個單元一個檔）；不寫等於 `file`。<br>`entry` 是入口檔名，預設 `index`。<br>`folder` 之下，鄰居單元只能透過它的入口碰到（`../Sibling`），其餘皆不可 —— 伸進入口後面不行，走別名也不行
- **`architecture.modules`** —— 位於原始碼根目錄的功能模組，上面那份分層清單描述的則是「每一個模組裡面」長什麼樣。<br>不寫就是扁平模型 —— `src/` 本身是那個唯一的隱含模組。<br>一旦宣告，整份 config 的詞彙就換掉了，所以這是[第一天就要做的選擇](/zh-TW/guide/structure)。<br>每一筆可以帶 `does`（一句話講責任）、`imports`（這個模組碰得到哪些模組，而且只碰得到對方的入口 —— 不寫代表一個都碰不到，且每個名字都必須是宣告在自己**後面**的模組）、`owns`（這個模組對其他所有模組獨佔的基元），以及 `layers: false`（放棄裡面那層分層詞彙 —— 路由型模組就是這樣表達的 —— 它只拿掉內部流向，其餘治理照舊）

### 調校


- **`architecture.sourceRoot`** —— 分層所在目錄（相對於專案根目錄）。預設 `src`；根目錄式佈局（如無 `src/` 的 Next.js）設為 `.`
- **`architecture.additionalAliases`** —— `alias` 以外、同樣納入所有結構禁令的額外匯入根
- **`architecture.testFiles`** —— 豁免於結構規則與度量關卡的測試檔樣式（預設 `*.test.*` / `*.spec.*`）。<br>
  填 `[]` 代表不豁免任何檔 —— 測試檔跟著它那層的規則走 —— 同時也把 `testFilename` 這個關卡關掉：<br>
  那條規則的範圍就是這些測試檔樣式，空清單等於沒有檔可以讓它檢查。`blueprint rules` 會在該關卡旁邊講明。
- **`architecture.layerFiles` / `layerFilesIgnore`** —— 框架預設樣式不適用時，逐層指定檔案樣式
- **`architecture.naming`** —— 依概念設定的命名慣例（如 `{ hook: 'useX + reactivity' }`）—— 寫入手冊與守則
- **`layer.lintOverrides`** —— 逐層的 ESLint 調整（三條受管規則除外）
- **`emit.agents`** —— Agent 守則的發佈目標：`claude`、`agents`、`gemini`、`copilot`、`cursor`、`windsurf`（可逐目標指定 `path`）。預設 `['claude', 'agents']`；空陣列就不產出。縮窄清單後，下一次 init 會自動移除「整份都是自己產出」的過期守則檔（被人手改過的只提醒、不動手）
- **`emit.handbook` / `emit.lint`** —— 手冊輸出路徑 · **結構規則**的等級（度量規則吃自己的 `rules` tier）

## 命令列旗標

- **`init`** —— `--agent claude|codex`（啟動編寫用的 Agent CLI）· `--preset`（強制建 preset）· `--authoring`（即使小 repo 也強制產 playbook；與 `--preset` 相反）· `--framework vue|react` · **`--structure flat|modular`**（init 自己產的 config 要用哪種[根結構](/zh-TW/guide/structure) —— 在低於 10 個原始碼檔的樹上**必填**，已經有 `blueprint.config.mjs` 時會被忽略，Next.js 專案則直接拒收）· `--no-install` · `--dry-run`
- **`survey`** —— `--alias <name>`（tsconfig paths 偵測不到別名時指定）· `--json`
- **`inspect`** —— `--baseline` · `--update-baseline` · `--framework vue|react` · `--json`
- **`impact`** —— `--json`
- **`deps [module]`** —— `--framework vue|react` · `--json`
- **`rules`** —— `--json`
- **`doctor`** —— `--json`

所有指令都支援 `--help`；CLI 本身支援 `--version`。
