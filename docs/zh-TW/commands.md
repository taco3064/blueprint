# 指令

Blueprint 支援 Node `^18.18.0 || ^20.9.0 || >=21.1.0`。不必安裝全域指令，直接透過套件
執行：

```bash
npx @kekkai/blueprint <command>
```

根指令與每個子指令都支援 `--help`；`--version` 會顯示套件版本。支援 `--json` 的指令會
保留與文字報告相同的事實，讓自動化程式與程式撰寫 Agent 不必解析說明文字。

## `init`

`init` 用來導入 Blueprint、修復既有整合，或啟動受保護的拓樸轉換。它會根據專案證據與
明確指定的目標，選擇三種流程之一：

1. **建置或修復**：替經量測確認沒有原始碼的應用程式建立框架預設設定（layer-first，<br>
   或沒有任何模組的 module-first 起點）、替規模小的 layer-first 專案建立預設設定，<br>
   或依既有有效設定檔更新產生的整合內容。
2. **架構編寫指南**：適用於尚無有效設定檔的既有原始碼，包含以 module-first 導入既有原始碼。
3. **拓樸轉換指南**：既有有效設定檔已確立另一種專案拓樸時使用。

第一次導入一定要明確選擇拓樸：

```bash
npx @kekkai/blueprint init --topology layer-first
npx @kekkai/blueprint init --topology module-first
```

先預覽完整動作，不寫檔、不安裝、不啟動 Agent：

```bash
npx @kekkai/blueprint init --topology layer-first --dry-run
```

### 旗標

- **`--topology layer-first|module-first`** — 第一次導入專案時必填。<br>在沒有原始碼的 React 或 Vue 應用程式上，`module-first` 會以預設設定建立空的模組起點；已有原始碼時則產生架構編寫指南。<br>已導入的專案若指定相同目標，會修復現有拓樸；指定相反目標，則啟動全專案轉換。
- **`--preset`** — 跳過架構編寫，使用偵測到的 Vue、React 或 Next 預設設定。<br>這只是 layer-first 的導入方式；指定 module-first、已是 module-first 的專案，以及已有自訂設定檔的應用程式都會拒絕執行。<br>沒有原始碼的 module-first 應用程式不需要這個旗標，只下 `--topology module-first` 就會建立起點。
- **`--authoring`** — 即使少於 10 個原始碼檔案，或是沒有原始碼的 module-first 應用程式，也強制產生架構編寫指南；後者的指南結論會帶你回到模組起點。不能與 `--preset` 並用。
- **`--agent claude|codex`** — 編寫或轉換流程會在指南安全寫入後啟動指定的本機 Agent CLI；預設設定流程不啟動 Agent，只縮小要產生的 Agent 守則目標。
- **`--framework vue|react`** — 框架證據不明確時指定。一般 Vue、React 會自動偵測；Next.js 會使用能辨識路由器的預設設定。
- **`--no-install`** — 不執行偵測到的套件管理工具，並在計畫裡列出待安裝內容。
- **`--dry-run`** — 只顯示計畫，不修改檔案，也不啟動 Agent。
- **`--recover-transformation`** — 從 Git 保留的權威記錄還原遺失的 LF→MF 待完成證據與復原指南，保留既有決策與指南；不執行導入、產生架構檔案或完成轉換。請單獨使用，或搭配 `--dry-run`。復原要求目前 `HEAD` 與原始記錄一致，且應用程式與來源範圍安全。若決策檔曾遭刪除，必須重新審查並記錄遺失的決策，才能驗證完成。詳見[產出檔案](./generated-files.md)。

### 可能修改的內容

完成建置時，可能建立 `blueprint.config.mjs`、Blueprint 管理的 ESLint 設定或參考設定、
指定路徑的架構手冊、所選 Agent 守則，以及全新 layer-first 預設設定缺少的分層資料夾；<br>
module-first 起點不會建立任何模組資料夾。
它也可能更新別名接線、一般 `lint` 指令、`.gitignore`，並透過偵測到的套件管理工具更新
相依套件。完整清單與管理權責見[產出檔案](/zh-TW/generated-files)。

既有 ESLint 設定絕不會被覆寫。除非 Blueprint 能辨識出自己產生並管理的設定檔，否則
只會建立 `eslint.config.blueprint.mjs` 供你整合。重複執行 `init` 應得到相同結果。

### 重要邊界

- 原始碼形狀只是證據，不是拓樸權威。同一個專案內的有效設定檔必須解析成同一種拓樸。
- 多應用程式範圍未確定時，任何寫入前就會停止；編寫階段必須明確選擇應用程式的原始碼根目錄。
- Blueprint 絕不自行發明領域模組。沒有原始碼的 React 或 Vue 應用程式，<br>
  可以從預設設定的空模組起點開始 module-first；已有原始碼時，模組圖一定要先由人或 Agent 編寫。
- 拓樸轉換要求 Git 專案、乾淨工作目錄與可復原的已提交 `HEAD`。Blueprint 會記錄量測到的
  搬移證據，但領域命名、擺放位置、衝突處理與匯入改寫仍由 Agent 判斷，並以 `git mv` 執行。
- Next.js App Router 會保留。遇到不支援的 Pages Router 或不明確路由器轉換時，流程會停止，
  不會暗中改變路由架構。
- Nuxt 的自動匯入讓 Blueprint 無法提出可信的靜態分析結果，因此目前不支援。

遭拒或執行失敗時會以非零狀態結束。若明確要求的 Agent 啟動失敗，先前產生的指南與檔案
仍已保存在磁碟上，可改走手動流程。

### 全新專案與既有專案的導入姿態

第一次導入時，空的應用程式跟已有原始碼的應用程式走不同路線。<br>
決定路線的是量測到的原始碼，不是旗標。

- **全新專案（經量測確認為空）** — survey 在 React 或 Vue 應用程式裡數到 0 個原始碼檔案。<br>
  `init` 會直接建立框架預設設定的完整標準治理：分層職責、框架所有權、命名、核心信念、<br>
  元件形狀軸線、工作指南，以及各規則的等級。
  - `--topology layer-first` 寫出 `reactPreset()` 或 `vuePreset()`。
  - `--topology module-first` 寫出同一份預設設定，再加上 `modules: []`。<br>
    這個起點已經宣告了拓樸、套用同一套治理，<br>
    但不建立任何模組資料夾，也不發明任何領域模組 —— 沒有 `shared`、`core`、`app`，什麼都沒有。<br>
    模組根目錄佔 container 的位置，重複的內部分層保留各自的框架職責，<br>
    路由組合等實際出現路由後，再交給保留的 `app` 模組。
  - Next.js 應用程式不走 module-first 起點：<br>
    即使專案是空的，`--topology module-first` 也會進入架構編寫指南。
- **既有專案（已有原始碼）** — `init` 產生架構編寫指南。<br>
  Agent 會轉譯專案原有的意圖與門檻、先量測影響，<br>
  再把已理解的既有債務記進各自的帳本：架構問題記進 Blueprint 基準線，lint 命中記進 ESLint suppressions。<br>
  它不會替專案打開原本沒有的選用檢查。

Layer-first 在原始碼少於 10 個檔案時，也會直接建立預設設定。<br>
既有專案產出的設定檔是真實、安全的導入結果 —— 是下限，不是 Blueprint 建議的上限。

### 讓 module-first 起點長出模組

Module-first 設定產出的架構手冊與 Agent 守則，都帶有一份**模組成長流程**。<br>
當 owner 要求的產品功能需要一個現有模組都不擁有的邊界時，Agent 會先用暫時的 layer-first 投影來推理：<br>
先看路由／頁面怎麼組合，再找出它組合的 container／use case 職責，最後找出每項職責需要的單元。<br>
這些職責就是模組的種子：相關的種子合併、只有真正獨立的才拆開，<br>
有明確領域擁有者的程式碼就留在擁有者身上。<br>
決定好擁有權之後，才建立 `Module → Layer → Unit`，並依實際匯入推出 `dependsOn`。<br>
它絕不會一個畫面、hook／composable、service、entity 或需求名詞就開一個模組，也絕不會開一個什麼都塞的 `shared`。

這個投影只是分析。<br>
它不會把專案說成 layer-first、不會寫出 layer-first 設定檔，也不會啟動拓樸轉換。

### 收緊既有專案的設定檔

要不要把既有專案的設定往標準預設設定收緊，是 owner 在導入之後的決定。<br>
動手之前先量測，一次只恢復一項更嚴格的守則，<br>
每一步只記錄「在那一步之前就存在」的債務。<br>
絕不為了變綠而降低目標。

決定收緊時，把下面這段 prompt 交給你的程式撰寫 Agent：

```text
請把這個專案的 Blueprint 治理，往標準 <React|Vue> 預設設定收緊。

1. 比對 blueprint.config.mjs 與標準預設設定。用下面這行印出標準預設設定：
   `node --input-type=module -e "import { reactPreset } from '@kekkai/blueprint'; console.log(JSON.stringify(reactPreset(), null, 2))"`
   （Vue 專案改用 `vuePreset`；設定檔是 module-first 時傳入 `{ modules: [] }`）。
   執行 `npx blueprint rules --json` 看設定檔宣告了哪些檢查，
   再列出分層、所有權、命名、核心信念與規則等級的每一項差異。
2. 動手之前先量測：執行 `npx blueprint inspect --json` 與 `npx blueprint impact --json`，
   把兩份輸出留作起始證據。
3. 一次只恢復一項更嚴格的守則：一項分層職責、一條所有權規則，或一個規則等級。
   每一步之後執行 `npx blueprint init`、`npx blueprint impact --json` 與
   `npx blueprint inspect --json`，並把每個新結果分類為「這一步揭露的既有債務」或「退步」。
4. 先修好退步，再把已理解的既有債務記進各自的帳本：
   架構問題用 `npx blueprint inspect --update-baseline`，lint 命中用 `npx eslint . --suppress-all`
   （ESLint 的 suppressions 檔；只有專案自己的 lint 指令已經通過時才跳過這一步，
   因為 `impact` 只計算架構 glob 涵蓋到的檔案，範圍外的測試檔和其他檢查的檔案都不會算進去）。
5. 絕不為了變綠而降低目標規則、門檻或邊界。某一步的代價若大於價值，
   停下來把量測到的影響回報給 owner，而不是把它放寬。
6. 最後執行 `npx blueprint inspect --baseline`、`npx blueprint doctor`，以及專案自己的
   lint、typecheck、test、build 指令。回報每一項恢復的守則、每一步記錄的債務，
   以及所有留給 owner 決定的事項。
```

## `survey`

`survey` 在設定檔建立前蒐集可重現的客觀證據，包括原始碼資料夾與形狀、重複子資料夾
模式、資料夾匯入矩陣、同資料夾別名匯入、測試命名慣例、原始碼根目錄接線檔案，以及套件
使用集中度。

```bash
npx @kekkai/blueprint survey
npx @kekkai/blueprint survey --source-root apps/web/src --json
```

- **`--alias <name>`** — TypeScript／JavaScript 設定找不到別名時，由使用者提供。
- **`--source-root <path>`** — 在多應用程式工作區中選擇一個原始碼根目錄。
- **`--json`** — 輸出機器可讀的證據。

這是唯讀指令，只回報事實，不替你決定分層、模組、所有權或依賴方向。

## `inspect`

`inspect` 會拿設定過的原始碼樹與架構比對，找出未宣告資料夾、模組或分層流向違規、非
標準別名、深入匯入、相對路徑逃逸、套件所有權違規、`selfOnly` 再匯出、單元循環、缺少
公開入口，以及尚未落地的模組／分層提示。

```bash
npx @kekkai/blueprint inspect
npx @kekkai/blueprint inspect --update-baseline
npx @kekkai/blueprint inspect --baseline --json
```

- **`--framework vue|react`** — 框架證據不明確時指定。
- **`--json`** — 輸出結構化報告。
- **`--update-baseline`** — 將目前 error／warn 記錄進 `.blueprint-baseline.json`；info 不會列入，沒有債務時不建立檔案。匯入分析若為降級或失敗，會拒絕更新並以 `1` 結束，避免把不完整的相依圖寫成基準線。
- **`--baseline`** — 只讓基準線以外的新問題造成失敗，形成既有專案的棘輪。

任何未列入基準線的 error 都會讓指令以 `1` 結束；warn 與 info 不會。解析失敗也會以 `1`
結束：只要有一個檔案解析失敗，匯入分析就是降級；若所有掃描檔案都解析失敗，則是失敗。
報告會把解析狀態與架構規則涵蓋的原始碼檔案數、已啟用的選用關卡數分開呈現，避免把結構
涵蓋率誤當成相依圖完整性的證明。

`architecture.testFiles` 是唯一的結構性測試檔豁免來源。靜態匯入與再匯出會進入相依圖；
動態匯入只有在目標可化約成確定字串時才會納入。無法判定的動態目標會揭露但不造成失敗；
解析失敗則會 fail closed，因為它可能隱藏相依邊。

`inspect` 不接受位置參數路徑。請在應用程式根目錄執行，掃描範圍由
`architecture.sourceRoot` 決定；額外傳入路徑會被拒絕，不會默默忽略。

## `impact`

`impact` 會在正式接線前，只預覽 Blueprint 產生的規則將新增哪些 lint 問題。它使用專案
自己的 ESLint，依規則統計命中次數並列出問題最多的檔案。

```bash
npx @kekkai/blueprint impact
npx @kekkai/blueprint impact --json
```

唯一旗標是 `--json`。執行時需要已編寫的 `blueprint.config.mjs`、ESLint 9 或 10，以及專案
技術組合需要的解析器與外掛；`init` 會安裝支援的相依套件。若專案仍使用 ESLint 8，
`impact` 會明確回報不可用並指向 ESLint 9／10 遷移，不會曝露 flat config API 原始錯誤，
也不會把未量測結果寫成零命中。

這是資訊指令：即使有 lint 命中也維持成功狀態。解析錯誤、未使用的停用註解與非
Blueprint 規則會另外列出，不會灌進 Blueprint 總數；這些仍須回到專案平常的 lint 驗證。
支援 Vue JSX／TSX script 區塊。若有檔案無法解析，JSON 會回報 `status: "partial"`，
文字報告也會說明命中數只是已觀察到的下限，並非完整總數。請先修正來源或解析器設定，
重新執行 Impact，再決定規則層級或記錄 suppressions。

## `deps`

`deps` 讀取與 `inspect` 相同的受管理匯入圖。指定單元時會列出它匯入什麼、哪些單元匯入
它；省略單元則輸出被引用數排行榜。

```bash
npx @kekkai/blueprint deps hooks/useCart
npx @kekkai/blueprint deps src/orders/components/OrderRow.tsx --json
npx @kekkai/blueprint deps
```

- **`--framework vue|react`** — 框架證據不明確時指定。
- **`--json`** — 輸出結構化相依圖結果。

只有架構涵蓋的單元會進圖；被略過的資料夾與匯入分析限制都會明列。Folder layout 以單元
為粒度，file layout 則收斂成分層粒度。設定為測試檔的匯入不會增加影響範圍，且只有別名
與相對匯入會形成邊。

## `rules`

`rules` 說明 `emitLint` 實際能執行什麼。它會區分一定產生的結構性規則、由
`blueprint.rules` 啟用的選用關卡，以及只寫入文件的規則識別碼。有設定檔時，還會顯示每個
關卡的 tier／數值、在目前技術組合是否生效，以及實際結構限制。

```bash
npx @kekkai/blueprint rules
npx @kekkai/blueprint rules --json
```

唯一旗標是 `--json`。此指令唯讀，也不要求設定檔。需要理解真實結果時，應使用它，而不是
反向推測產生後的 flat config；規則設定總表見[設定](/zh-TW/configuration#rules)。

## `doctor`

若 ESLint 無法為規則存續檢查的探測路徑提供設定，Doctor 會列出路徑並標為未驗證。
應檢查全域忽略規則與檔案匹配，不能據此斷言規則遭到覆蓋；其他位置若確實遺失規則，
仍會判定失敗。Suppressions ledger 會同時檢查應用程式與實際 ESLint 設定所在目錄。

`doctor` 檢查導入是否真的完成，包括設定檔、殘留的暫存／Agent 檔案、ESLint 接線、
`package.json` 一般 lint 入口能否安全到達並實際跑完 ESLint、別名接線、結構性規則在合併後
的 flat config 是否仍存在、架構狀態，以及停用規則帳本。

別名證據會依可辨識的 TypeScript、bundler／runtime、套件 `imports` 子路徑與 test runner
分開回報。單一 consumer 的證據不會產生涵蓋整個工具鏈的綠燈：缺少對應會讓該項失敗；
應適用但無法讀取時會標示為尚未驗證；不存在或不適用的 consumer 也會明確標示。

```bash
npx @kekkai/blueprint doctor
npx @kekkai/blueprint doctor --json
```

唯一旗標是 `--json`。結果分成三種：

- **Complete**：所有檢查通過；exit code 為 `0`。
- **Incomplete**：至少一項失敗；exit code 為 `1`。
- **Unverified**：沒有失敗，但至少一項無法執行而跳過；exit code 仍為 `0`。

若自動化流程要求完整證據，就不能只看 exit code；必須檢查 JSON 的 checks／verdict，並拒絕
`skipped`。不安全或語意不明的 lint 指令列只會標成跳過，Doctor 不會把它丟進 shell 執行。

Doctor 會辨識 `lint` 指令；未宣告 `lint` 時，則辨識 `eslint` 指令。兩者都無法辨識時，
這項檢查會標成未驗證，而不是斷言接線錯誤。對可執行的 JavaScript 別名設定，無法判讀的
運算式或匯入的別名表也會標成未驗證。只有靜態證據足以確認缺少或目標不符時，才會回報
對應的別名有問題；建置成功本身也不能證明每個別名都正確。

## `upgrade`

`upgrade` 會把已導入 Blueprint 的專案升級到較新的版本。<br>
要升到哪個版本，就用那個版本來執行；<br>
正在執行的套件，是決定目標版本的唯一依據：

```bash
npx @kekkai/blueprint@latest upgrade --dry-run
npx @kekkai/blueprint@latest upgrade
npx @kekkai/blueprint@4.1.0 upgrade
```

沒有 `--to` 旗標，`upgrade` 也絕不降版。<br>
用專案已記錄的同一個版本執行時，它只會回報生命週期已是最新；<br>
要修復產生的整合內容請用 `init`，要驗證則用 `doctor`。

### 為什麼 `npm update` 不算升級

只更新相依套件，會漏掉 Blueprint 版本裡落在你專案中的那些部分：<br>
設定檔遷移、重新產生的產出、需要人或程式撰寫 Agent 判斷的語意工作，以及最後的驗證。<br>
`upgrade` 負責整個流程：

1. **規劃**：讀取 `.blueprint-lifecycle.json` 裡的生命週期檢查點。<br>
   生命週期狀態出現之前就導入的專案，只依可證明的事實建立檢查點：<br>
   已安裝的 `@kekkai/blueprint` 版本；<br>
   或是 Blueprint 3.2 的設定檔格式證明導入早於 4.0 時，採用 3.2.0。<br>
   接著在執行任何動作之前，先解析 `(source, target]` 區間（不含起始版本、含目標版本）內，<br>
   每個版本的所有結構化升級操作。
2. **記錄待完成的升級**：先寫進生命週期狀態，執行中斷時才能接續。
3. **更新 `@kekkai/blueprint`**：透過偵測到的 npm、pnpm 或 Yarn，<br>
   把宣告它的 `package.json` 與 lockfile 更新到正在執行的目標版本；<br>
   之後改用這份已安裝的套件繼續，讓設定檔載入的是新版本。
4. **以程式執行確定性遷移**：透過 `blueprint init` 重新對齊每個已導入的應用程式，<br>
   其中包含支援的 3.2 → 4.0 設定檔遷移。
5. **把語意工作交給程式撰寫 Agent**：若還有剩下的工作，會整理成一份解析後的 `blueprint-upgrade.md`。<br>
   每完成一項操作，就用 `npx blueprint upgrade --complete <operation-id>` 記錄。<br>
   Blueprint 會先驗證能量測的部分，才接受這筆紀錄。
6. **驗證並記錄**：重新執行 `npx blueprint upgrade`。<br>
   它會再對齊一次，並在每個已導入的應用程式執行 `blueprint inspect --baseline` 與 `blueprint doctor`；<br>
   全部通過後，才會推進生命週期檢查點。<br>
   專案自己的 lint、typecheck、test、build 指令也要一併執行。

### 跨版本累積的升級操作

一個版本可以新增零到多項升級操作。<br>
每項操作都有穩定的 id、引入它的版本、決定是否適用的專案事實、一項驗證方式，<br>
以及選填、指向較早操作的關係：

- **需要先完成（`requires`）**：讓這項操作排在另一項之後。
- **取消（`cancels`）**：直接跨版本升級時，移除一項尚未在這個專案執行過的較舊操作。<br>
  取消不是回復：已經執行過的操作仍會保留紀錄，要清理它造成的影響，得靠另一項獨立的操作。
- **取代（`supersedes`）**：以新操作取代較舊的操作。<br>
  取代者負責最終狀態；不論專案是否已執行過舊操作，都能收斂到同一個結果。

因此，像 3.2 → 4.1 這樣直接跨版本升級，和分成幾次較小的升級，最後都會抵達同一個受支援的目標。<br>
Agent 永遠不會拿到原始的版本說明或 CHANGELOG 條目，只會拿到解析後的計畫。

### 選項

- **`--dry-run`** — 印出起始版本與 Blueprint 信任它的理由、目標版本、已導入的應用程式與各自安裝的版本、安裝指令、確定性遷移、解析後的語意計畫（包含被移除與不適用的操作），以及安全前提。<br>不做任何修改。
- **`--complete <operation-id>`** — 某項待完成的語意操作通過驗證後，記錄這一項。<br>不能與 `--dry-run` 並用。

### 邊界

- 支援的起始版本從 3.2.0 開始。<br>
  更舊的導入必須先用 3.2.0 自己的工具升到 3.2.0。
- 開始升級時，Git 工作目錄不能有未提交的變更，整次升級才能被審查、也能整個還原。<br>
  已有待完成的升級時，不受這項限制，會直接接續。
- 生命週期以整個專案為單位。<br>
  所有已導入的應用程式必須共用同一個已安裝的 Blueprint 版本；<br>
  每個應用程式都通過驗證，升級才算完成。
- 尚未完成的架構編寫指南或拓樸轉換，必須先完成。
- `.blueprint-lifecycle.json` 無法讀取，或在已安裝版本一定會記錄它的情況下卻不存在時，`upgrade` 會停止。<br>
  請從版本控制還原；若從未提交過，就執行 `npx blueprint init`，依已安裝的套件重新建立檢查點。

## `remove`

`remove` 用來解除 Blueprint 的導入。<br>
請在解除安裝套件之前執行：

```bash
npx blueprint remove --dry-run
npx blueprint remove
```

它會先規劃完整的清理，<br>
並依「這項內容屬於 Blueprint」的證據，替每個動作分類：

- **Blueprint 檔案** — `blueprint.config.mjs`、`.blueprint-lifecycle.json`、`.blueprint-baseline.json`、<br>
  設定檔備份、未完成的架構編寫／轉換／升級工作檔，以及 `*.blueprint.*` 合併參考檔，都會刪除。
- **產出** — 架構手冊、Blueprint 完整管理的 Agent 規則檔，以及產生的 ESLint 設定，<br>
  只要仍帶有 Blueprint 的產生標記就會刪除。<br>
  一旦有人移除了這個標記，檔案就歸專案所有。
- **標記區塊** — `CLAUDE.md`、`AGENTS.md` 等共用的 Agent 文件，<br>
  只會移除 `<!-- BLUEPRINT:START -->` 與 `<!-- BLUEPRINT:END -->` 之間的內容。<br>
  檔案若除此之外沒有其他內容，就整個刪除。
- **共用檔案的修改** — `.gitignore` 例外、`package.json` 的 scripts、TypeScript 或 JavaScript 的 `paths`，以及 Vite 別名，<br>
  只有在生命週期記錄了確切的修改、而目前檔案仍包含這項修改時才會還原。<br>
  應用程式原始碼仍在匯入的別名接線會保留。
- **資料夾** — Blueprint 建立的分層資料夾，只有在裡面除了 `.gitkeep` 之外什麼都沒有時才會移除；<br>
  因移除而變空的資料夾也會一併清掉。
- **相依套件** — 最後才透過偵測到的套件管理工具解除安裝 `@kekkai/blueprint`。<br>
  Blueprint 記錄為自己安裝的 ESLint 套件也會解除安裝，除非專案留下的檔案仍在使用。

### 有衝突就在修改前停止

下列情況下，`remove` 會拒絕整次移除，什麼都不改：

- 記錄過的共用檔案修改已經與現況不符，或現在出現不只一次；
- 標記區塊的標記已經損壞；
- 會保留下來的檔案（例如手寫的 ESLint 設定或 `package.json` script）<br>
  仍匯入 `@kekkai/blueprint`、執行 Blueprint CLI，或載入即將刪除的 `blueprint.config.mjs`。

每個衝突都會指出檔案與修正方式。<br>
處理完之後，重新執行 `--dry-run`。

### 範圍與較舊的導入

在專案根目錄執行，會移除所有已導入的應用程式。<br>
在多應用程式專案裡，從其中一個應用程式執行，只會解除那個應用程式的導入：<br>
生命週期狀態會保留其他應用程式的紀錄；<br>
套件若宣告在其他應用程式仍會解析到的位置，也不會被解除安裝。

在生命週期紀錄出現之前導入的專案，沒有共用檔案修改的證明。<br>
`remove` 只會刪除能以名稱或內容證明屬於 Blueprint 的檔案，<br>
並把無法證明的部分回報給你檢查，例如別名接線、lint script 裡串接的 ESLint 指令，或 ESLint 套件。<br>
之後才補建生命週期檢查點的專案，在檢查點建立之前做的修改也一樣處理。

移除後的專案，不再留有任何可證明屬於 Blueprint 的設定、生命週期、產出、標記區塊或相依套件痕跡。<br>
`remove` 不會為了讓應用程式原始碼跟導入前一天逐位元組相同而改寫它。
