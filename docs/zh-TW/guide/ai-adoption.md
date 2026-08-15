# AI 協助導入

在既有專案導入 blueprint 是判斷性工作，不是初始化工作：<br>
分層結構早就存在，必須先有人「讀懂」它，規則才有辦法把它編碼下來。<br>
blueprint 把這件事切成三個階段，只有中間那段需要智慧判斷：

**蒐證** —— 資料夾結構、匯入關係矩陣、模組形狀、套件集中度
- 執行者 — 決定性程序
- 工具 — `blueprint survey`

**判斷** —— 哪些資料夾是分層、依賴方向往哪、哪些是債務、哪些是設計意圖
- 執行者 — AI Agent（或開發者本人）
- 工具 — 導入作業手冊

**驗證** —— 每項違規都要能解釋為真實債務，而不是 config 譯錯
- 執行者 — 決定性程序
- 工具 — `blueprint inspect` 與 baseline 棘輪

## 蒐證步驟的必要性

讓 AI Agent 自己從零翻整個專案，又慢又不可靠。<br>
`survey` 直接把決定性的事實餵給 Agent：

```bash
npx @kekkai/blueprint survey          # 供人閱讀的報告
npx @kekkai/blueprint survey --json   # 供工具或 Agent 讀取
```

- 頂層資料夾清單與**模組形狀證據**（`index` 檔覆蓋率、巢狀深度 —— 作為判斷資料夾式或扁平式模組的依據）
- **資料夾之間的匯入關係矩陣**，依匯入次數由高至低排列 ——<br>
  呈現設計意圖中的依賴方向，以及屬於債務的逆向依賴（矩陣含測試檔；`inspect` 不含，所以 inspect 的數字會較低）
- **套件集中度** —— 作為 `owns`（套件歸屬）宣告的候選依據
- **只出現在一個資料夾的具名匯入**，而它所屬的套件散在好幾個資料夾<br>
  —— 這是「單一具名匯入歸屬」（`owns: [{ package, imports: […] }]`）唯一能對照的證據。<br>
  只讀大括號裡的名字，所以透過 `import * as` 取用的成員不會被算進去
- 測試檔慣例統計 —— 應歸入 `testFiles` 而非 `layers` 的項目

## 導入流程

於「已有程式碼、尚無 `blueprint.config.mjs`」的專案執行 init：

```bash
npx @kekkai/blueprint init
```

init 不會硬套 preset，而是掃描程式碼後產出：

- **`blueprint-authoring.md`** —— 可執行的導入作業手冊：<br>
  蒐證數據、推導方法、規則語意（扁平／資料夾式模組的判定、接線後會咬到什麼）、config 結構速覽與驗收條件
- **`.claude/commands/blueprint-author.md`** —— Claude Code 使用者可直接輸入 `/blueprint-author` 啟動

接著交給 AI Agent 執行：

```bash
claude "Read blueprint-authoring.md at the repository root and execute it end to end."
# codex 亦使用相同的提示語
# 或以單一指令完成：
npx @kekkai/blueprint init --agent claude
```

Agent 依蒐證數據推導 config，反覆對照 `blueprint inspect` 直到每項違規都能解釋為真實債務，<br>
再重新執行 `init` 產出各項成品並鎖定 baseline。<br>
開發者只需要審閱最終結果。

`--agent` 是刻意設計得最薄的一層：<br>
它在前景以互動模式執行**畫面上已印出的那行指令**，且跑在你自己 Agent CLI 的權限之下。<br>
確切的安全邊界見[安全與信任](/zh-TW/guide/security)。

若欲完全跳過編寫流程、即使在既有專案上也直接以框架 preset 建置，可改用 `init --preset` ——<br>
這是已確認 preset 適用時的快捷途徑。<br>
它並不豁免[結構那一題](/zh-TW/guide/structure)：檔數低於門檻時，`--preset` 一樣會先要 `--structure` —— 因為 preset 兩種形狀都出得來，而那麼小的樹裡沒有任何東西分辨得出該用哪一種。

## 建議的提示詞

方法不用寫進 prompt —— 蒐證、推導、驗收都在 `blueprint-authoring.md` 裡。<br>
prompt 只要釘住「怎樣算完成」：

```text
請協助導入 @kekkai/blueprint，並自主完成：
執行 `npx @kekkai/blueprint init --authoring`，
將其產出的 blueprint-authoring.md 全數完整執行完畢
（playbook 自己給的結論就是完整執行 —— 它叫你早退，早退就是做完）。

驗收 —— `blueprint doctor` 要過，另外：
- lint、`inspect --baseline`、原有測試都要過（沒有測試＝空泛通過，不用補）
- emitLint 真的接進 ESLint（不留 reference 檔）
- 不改任何 source code —— 既有債（如果有）各自鎖進原生帳本：架構用
  `inspect --update-baseline`、lint 用 `eslint --suppress-all`（都只在有債時跑 —— 空帳本是儀式）；
  零違規就代表完成、帳本留空 —— 那就是成功，不要為了有東西可鎖去製造債
```

`--authoring` 保證即使在小 repo 上也會產出 playbook（純 `init` 在檔數低於門檻時會改建 preset、不產 playbook，而且要先問 [`--structure`](/zh-TW/guide/structure) 才肯建；`--authoring` 是唯一能在小 repo 上繞過那一題的路徑 —— playbook 會從證據裡把它答出來）。<br>
三條驗收各自對應實測中出現過的未完成狀態：整合只做一半、檢核沒跑完、把還債混進導入。<br>
有兩條在特定 repo 上會「空泛地成立」而且這樣就對了：<br>
沒有測試的 repo，「原有測試都過」直接成立、不用去補 test runner；<br>
零債的 repo，鎖帳指令直接跳過、不用為了儀式跑一遍。<br>
全新專案不需要這段 —— `init` 一個指令就完成；`init` 跑過之後也可以在 Claude Code 直接輸入 `/blueprint-author`。

## 用數字決定規則衝突 —— `blueprint impact`

實測中最花時間的編寫步驟，是接線前的 rule 衝突判斷：「每條 emitted rule 在這個 repo 會中幾發？」<br>
以前只能把 emitted config dump 出來、自己對著程式碼讀。<br>
`impact` 直接回答這題：

```bash
npx @kekkai/blueprint impact          # 接線下去會有多紅？
npx @kekkai/blueprint impact --json   # 把數字餵給工具或 Agent
```

它用 `emitLint` 編譯已寫好的 config，再用**專案自己的** ESLint、只掛這份 config 去 lint layer 檔案，回報每條 rule 的命中數與最重的檔案。<br>
純資訊、不是關卡 —— 不管中幾發都 exit 0，而且 total **只計**接線會真正引入的違規。<br>
隔離環境的 artifact 全部另列、不灌水：<br>
`parse-error`（檔案解析不了、數字不可信）跟 `unused-disable-directive`（這個 disable 在**隔離環境**壓不到東西 —— 指向你自己 config 規則的那種 merge 後就消失，真正過期的才會留下）歸在「Isolation caveats」；<br>
blueprint 沒 emit 的 rule id 另列成「這些名字是你自己 config 的」——<br>
那是你的 code 寫在 `eslint-disable` 註解裡、而這次隔離執行解析不了的名字，**回報在那句註解的位置上**。<br>
所以那區的數字數的是「被提到幾次」，不是違規幾次，對註解底下那段 code 什麼都沒說；<br>
其中跟上面 blueprint 命中同檔同行的 row，是同一個點透過你家 rule 的名字再看一次，不是第二筆違規。<br>
報告收尾也講明白：命中數是拿來**決定 tier** 的，不是只拿來壓 suppressions ——<br>
一條你想整片壓掉的 rule，通常該在 blueprint 的 `rules` 直接宣告 `warn`/`off`，suppressions 只鎖剩下的。

## 驗證有沒有做完 —— `blueprint doctor`

「導入到底做完了沒？」這問題以前只能靠人記 prompt 的驗收條款。<br>
`blueprint doctor` 把它變成一份唯讀 checklist ——<br>
可以直接塞進 Agent 的驗證迴圈或 CI：

```bash
npx @kekkai/blueprint doctor
```

- **blueprint.config.mjs 存在**
- **沒有殘留的 reference 檔、authoring 產出物或過期的 contract 檔** ——<br>
  `*.blueprint.*` reference 還在就代表 merge 沒做完（最常漏的一步）；<br>
  `blueprint-authoring.md` 與它的 `/blueprint-author` 指令檔是作業手冊自己最後一步要刪掉的東西，所以在**編寫途中**跑 doctor，這條紅是預期內的；<br>
  帶著 BLUEPRINT 標記、卻不在 `emit.agents` 宣告範圍內的 contract 檔，是沒人維護的孤兒，不准躲在綠燈後面
- **eslint 真的接上 emitLint** ——<br>
  legacy `.eslintrc` 會被標記為「先遷移」，不會無聲留半套
- **宣告的 alias 接得上 toolchain** ——<br>
  alias 宣告了卻沒有任何工具（tsconfig `paths`，或 vite / webpack / vue-cli / next / rsbuild 的 bundler config）解析得到，agent contract 就會把 agent 指向解析不了的匯入；<br>
  失敗訊息直接附上 wiring 片段
- **emitted rules 在合併後的 config 裡活著** ——<br>
  flat config 對同一條 rule 從不合併：後面的 entry 會「靜靜地」整包取代 blueprint 的結構禁令，lint 還是綠的。<br>
  doctor 用一個真實 layer 檔解析最終 config，點名弄丟了什麼。<br>
  它的 ✓ 也會說出自己的作用範圍：比對的是 config **文字**，從不執行 ESLint —— 涵蓋結構禁令、module-root 禁令、內嵌的 plugin 規則，以及每個有開的關卡的承載規則；<br>
  一筆實際輸出的設定一個探點<br>
  （flat config 是一層一個；宣告 [`modules`](/zh-TW/guide/structure) 之後是每組（`module`、`layer`）一個，再加上每個模組的 zone 各一個）。<br>
  門檻值、套件歸屬的條目，以及只蓋到某一筆設定一部分檔案的合併條目，都不在比對範圍內。<br>
  config 解析不開的時候，這條檢查是**跳過**而不是失敗（見下），並把 loader 的原話引出來 —— 讓缺的套件直接出現在螢幕上，而不是隔著一次 `npm run lint`
- **架構乾淨** ——<br>
  沒有 baseline 以外的違規；detail 會標明 coverage：幾個 source 檔在 layer 網內，而**網外的那些會被點名列出來**（有上限），因為「40 個裡面 12 個」是一個讀的人查不了的數字；<br>
  再加上幾條 optional gate 有開，以及結構規則本來就永遠開著。<br>
  這樣「空網子的綠燈」看得見，不會安靜地騙過你；<br>
  空網的 callout 還會照**你這份 config 實際的位址**點名下一步：扁平是 `src/<layer>/`，[`modules`](/zh-TW/guide/structure) 之下則是 `src/<module>/<layer>/` —— 在那裡分層是模組裡面的資料夾，擺在原始碼根目錄的那種是 `undeclared-module` 錯誤，不是解法
- **lint suppressions 帳本沒過期** ——<br>
  `eslint-suppressions.json` 裡指向已不存在檔案的條目會讓檢查失敗

### 三種結果，不是兩種

**跑不起來的檢查，不等於通過的檢查。**<br>
合併存活那條檢查在 config 解析不開時是跳過、不是失敗 —— 一個你怎麼弄都消不掉的紅，比沒有這條檢查更糟。<br>
但那個「跳過」以前還是算在通過數裡面，於是輸出會變成 `✓ …（skipped）` 疊在 `✓ Adoption complete — all 7 checks passed` 上面。<br>
現在你看到的是：

```
⊘ emitted rules survive the merged eslint config (skipped — could not resolve …)
⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run (⊘ above). Nothing failed, and nothing here proves what those checks cover.
```

（banner 是單一行字串，上面看到的換行是終端機折的。）

**exit code 沒有變 —— 跳過不是失敗，所以這次執行照樣 exit 0。**<br>
這正是「該用 `--json` 當 gate、不要用 exit code」的理由：

```json
{ "ok": true, "verdict": "unverified",
  "summary": "⊘ Adoption unverified — 6 of 7 checks passed, 1 could not run …",
  "counts": { "total": 7, "passed": 6, "failed": 0, "skipped": 1 },
  "checks": [ { "label": "…", "ok": true, "skipped": "why it could not run" } ] }
```

`ok` 維持 exit code 需要的那個意思 —— 沒有任何一項**失敗**。<br>
`verdict` 是 `complete` / `unverified` / `incomplete` 三選一，也掛在 [`runDoctor`](/zh-TW/api/functions/runDoctor) 的回傳值上，<br>
所以 CI 的 gate 該看的是 `verdict` 或 `counts.skipped`。

還有一件事，綠燈會直接講出來 —— 放在 banner 底下而不是當成第八條檢查（它不可能失敗，列進去只會灌大分母）：<br>
**在沒有版本控制的 repo 上**，每一條檢查都可以過，而導入寫下的東西一個都沒被 commit ——<br>
一副只活在未 commit 工作目錄裡的棘輪等於沒裝，因為下一次 clone 從零開始。<br>
要不要起版控是擁有者的決定，永遠不是導入中的 Agent 的。

## 既有債務 —— 弄紅，然後上棘輪

導入的意義是把債弄成看得見、然後鎖住不准變多 —— 不是把螢幕弄安靜。<br>
碰上已經有違規的 repo，severity 保持 `error`，把兩側的債各自鎖進**原生的帳本**：

- **架構債** → `npx blueprint inspect --update-baseline`（`.blueprint-baseline.json` —— 就是你認識的那個棘輪）
- **lint 債**（maxLines、unusedVars⋯）→ `npx eslint . --suppress-all`（ESLint ≥ 9.24 原生 bulk suppressions —— 按「檔 × 規則 × 數量」記帳，**新增**違規照樣紅）

你的 gate 兩個都跑 —— `eslint` 跟 `blueprint inspect --baseline` —— 各自只擋「新」債。<br>
兩份檔案、一套紀律：`blueprint doctor` 會驗兩本帳都沒過期。

還在 ESLint 8 或 legacy `.eslintrc`？<br>
suppressions 需要 ESLint ≥ 9.24 ＋ flat config，那次遷移由你拍板、playbook 不會擅自動手。<br>
過渡期的替代方案：`emit: { lint: { severity: 'warn' } }` ——<br>
但代價要講明：`severity` 只蓋結構規則（maxLines 這類度量規則吃自己的 tier），而且 warn 期間**新的度量債不會被擋**。

## 失敗情境的處理原則

所有產出結果都在任何 AI Agent 啟動**之前**就寫入磁碟。<br>
啟動失敗、或 Agent 中途放棄，流程就回到手動路徑 —— 同一份作業手冊，改由開發者親自執行。<br>
`inspect` 唯讀、`init` 冪等、baseline 只在最後一步寫入，所以不存在「導入到一半」的中間狀態要清理。

同樣的順序在 `init` 內部又出現一次：**所有檔案寫入都排在依賴安裝之前**，<br>
所以一次被中斷的執行留下的是「一棵完整的樹，只少了 `node_modules`」。<br>
這件事有意義，是因為安裝是唯一一個可能卡上好幾分鐘的步驟 —— 套件管理工具連不到 registry 時會安靜地重試 ——<br>
所以它上面那行會把接下來要跑的指令印出來，說明安靜是正常的、安靜好幾分鐘就代表該把它停掉、自己跑那行（或加 `--no-install` 重跑），<br>
並且點名停掉會少什麼：`package.json` 裡的這幾個套件。<br>
在那行跑完之前，任何指名其中一個套件的失敗都是這個缺口，不是導入壞掉。

## 範圍的誠實界定

作業手冊只承諾「產出 config 並鎖定 baseline」，**不承諾**幫你清償既有債務。<br>
既有違規會記錄進 baseline，後續透過 [baseline 棘輪](/zh-TW/guide/getting-started)逐步清償 ——<br>
導入跟債務清償是兩件獨立的事。

反方向的期望也要講明：在乾淨或剛起步的 repo 上，**零違規才是正常結果** ——<br>
那是 codebase 乾淨，不是 config 太鬆（coverage 那行會告訴你網子有沒有真的罩到檔案）。<br>
此時 blueprint 的即時價值是「往前看」的：把「以後的 code 怎麼算對」先釘死 —— handbook、agent contract、gates —— 而不是馬上抓出一堆既有問題。<br>
「keep a codebase honest」的起點是在違規發生**之前**把誠實的標準寫下來；<br>
牙齒會隨著 code 落進 layer 開始咬。
