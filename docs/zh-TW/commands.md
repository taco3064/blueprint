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

### `init` 何時算完成導入

Blueprint 會把「已經寫入專案、可以證明由 Blueprint 擁有的內容」和「這次導入是否真的完成」分開記錄。

如果 `init` 執行到一半失敗，已經落地的 Blueprint 內容仍會保留所有權紀錄，但不會因此建立已完成的生命週期檢查點。

以下情況也還不算完成導入：

- 使用 `--no-install` 跳過了目前仍需要安裝的 Blueprint 或相關工具相依套件；
- brownfield authoring 目前只建立了 `blueprint-authoring.md` 與 Agent 交接內容，還沒產生並採用最後的 `blueprint.config.mjs`。

等缺少的工作補完後，再次執行 `init`。Blueprint 會保留前一次已記錄的所有權事實，並在這次導入真正完成時建立生命週期檢查點。

brownfield authoring 中，當 Agent 已經完成設定檔，而後續的 `init` 成功採用這份設定時，就代表 Blueprint 的導入已完成，可以建立檢查點。`blueprint-authoring.md` 可能仍會暫時保留到 Agent 執行最後的清理步驟；只要這類尚未完成的 workflow 檔案仍存在，`upgrade` 仍會拒絕開始新的升級。

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

`upgrade` 負責把已導入 Blueprint 的專案升級到較新的版本。

要升級到哪一版，就用那一版的 Blueprint 執行：

```bash
npx @kekkai/blueprint@latest upgrade --dry-run
npx @kekkai/blueprint@latest upgrade
npx @kekkai/blueprint@4.1.0 upgrade
```

正在執行的 `@kekkai/blueprint` 套件就是唯一的目標版本來源，因此沒有另外的 `--to` 旗標。

`upgrade` 不會用來降版。它也會同時確認專案目前實際安裝的 Blueprint 版本與生命週期檢查點；只有兩者都已經位於正確的目標狀態時，才會回報目前不需要升級。

如果只是要重新產生 Blueprint 管理的內容，請使用 `blueprint init`；如果只是要確認目前狀態，請使用 `blueprint doctor`。

### 為什麼只執行 `npm update` 不夠

Blueprint 的版本升級不只包含 npm 套件本身。

新版本可能同時需要：

- 更新專案中的 `@kekkai/blueprint` 相依套件；
- 執行 Blueprint 可以安全確定的設定或整合遷移；
- 重新產生 Blueprint 管理的輸出；
- 執行需要人或程式撰寫 Agent 判斷的語意工作；
- 驗證所有已導入的應用程式是否真的完成升級。

因此，單獨執行 `npm update`、`pnpm update` 或 `yarn upgrade` 並不等於完成 Blueprint 的升級生命週期。

`upgrade` 會依序處理完整流程：

1. **確認起始狀態並產生計畫。**
   讀取 `.blueprint-lifecycle.json` 中已完成的生命週期版本與升級紀錄。
   如果專案是在生命週期狀態功能加入之前就已經導入 Blueprint，只能使用受支援且可證明的套件與設定事實建立起始檢查點。
   接著一次收集 `(source, target]` 區間內所有版本的結構化升級操作，先處理 `requires`、`cancels`、`supersedes` 與適用條件，算出最終有效計畫，之後才開始修改專案。

2. **記錄尚未完成的升級。**
   在執行其他修改之前，先把本次升級的來源版本、目標版本與有效計畫寫進生命週期狀態。
   如果流程中斷，之後可以從同一份 pending state 接續，不會重複已完成的操作。

3. **把專案相依套件更新到目標版本。**
   Blueprint 會使用偵測到的 npm、pnpm 或 Yarn，更新真正宣告 `@kekkai/blueprint` 的 `package.json` 與 lockfile。
   更新完成後，後續流程會改由專案剛安裝好的 Blueprint 執行，確保設定檔載入、遷移與產出全部使用目標版本。

4. **執行可由程式確定完成的遷移。**
   Blueprint 會透過既有的 `init` 與其他既有 owner，執行可以安全自動完成的設定與整合遷移，不把可確定的工作丟給 Agent 判斷。

5. **處理仍需要語意判斷的工作。**
   如果最終有效計畫還有語意操作，Blueprint 會產生一份 `blueprint-upgrade.md`。
   Agent 只執行這份已解析完成的計畫，不直接執行歷史 CHANGELOG 或 release note。
   每完成一項操作後，使用：

   ```bash
   npx blueprint upgrade --complete <operation-id>
   ```

   Blueprint 會先執行該操作可以量測的驗證，再記錄完成狀態。

6. **完成最後驗證。**
   所有語意操作完成後，再執行：

   ```bash
   npx blueprint upgrade
   ```

   Blueprint 會重新對齊每個已導入的應用程式，並執行 `blueprint inspect --baseline` 與 `blueprint doctor`。
   只有所有必要驗證都成功，生命週期檢查點才會移到目標版本。

   最後仍應執行專案自己的 lint、typecheck、test 與 build 指令。

### 套件更新途中中斷

升級開始前，Blueprint 會先記錄這次 pending upgrade，再更新各個已導入應用程式實際使用的 Blueprint 套件。

如果 repository 有多個套件宣告位置，而更新途中只有部分應用程式成功到達目標版本，下一次執行 `upgrade` 會從已記錄的 pending upgrade 接續：

- 已經位於目標版本的應用程式不會重複安裝；
- 還停在這次升級起始版本的應用程式會繼續更新到目標版本；
- 如果出現不屬於這次升級起始版本或目標版本的其他版本，Blueprint 會停止，不會猜測如何修正這個狀態。

因此，由 Blueprint 自己造成的「部分套件已更新」狀態是可接續的升級中間態，而不是要求使用者自行修復的混合版本錯誤。

### 跨版本的累積升級計畫

一個 Blueprint 版本可以新增零到多項結構化升級操作。

每項操作都有固定 id、加入它的版本、適用條件與驗證方式，也可以宣告與較早操作的關係：

- **`requires`**：這項操作必須排在另一項操作之後。
- **`cancels`**：如果較舊的操作在這個 repository 還沒執行過，就從本次直接升級的有效計畫中移除。取消不等於還原；已經執行過的歷史不會被假裝成沒發生過。
- **`supersedes`**：由新的操作接手最終狀態。無論舊操作以前已經執行過，還是直接跨版本而從未執行，新操作都必須把專案收斂到同一個受支援的目標狀態。

因此：

```text
3.2 → 4.1
```

直接升級，和：

```text
3.2 → 4.0 → 4.1
```

分段升級，可以有不同的歷史執行紀錄，但最後必須收斂到同一個 Blueprint 目標狀態。

Agent 不會自行重播每一版的 CHANGELOG 或 release note，只會收到 Blueprint 已經解析完成的最終有效計畫。

### 選項

- **`--dry-run`** — 顯示起始版本、起始版本的證據、目標版本、所有已導入的應用程式與實際安裝版本、套件更新指令、確定性遷移、最終有效的語意計畫，以及開始升級前必須滿足的安全條件。完全不修改專案。
- **`--complete <operation-id>`** — 在某項待完成的語意操作通過自己的驗證後，記錄這項操作已完成。不能與 `--dry-run` 同時使用。

### 升級邊界

支援的升級起點目前從 3.2.0 開始。更早的 Blueprint 導入，必須先依該版本原本支援的方式到達 3.2.0，再進入目前的 upgrade lifecycle。

目前執行的目的版本只負責自己宣告的升級支援範圍，也就是 `supportedFrom` 到目前版本。

已經完成、而且隨著支援範圍前移而退出可執行範圍的舊升級操作，可以只保留辨識歷史所需的最小紀錄；它們不會重新進入新的 pending upgrade，也不需要永久保留舊版的執行指示、適用條件或驗證方式。

換句話說，最新版 Blueprint 不需要理解所有歷史版本彼此之間的升級路徑。已完成的生命週期檢查點會結束它之前的可執行升級義務，之後的 resolver 只處理目前檢查點到目的版本之間仍受支援的區間。

開始新的升級之前，必須位於 Git repository，而且工作目錄不能有未提交的變更，讓整次升級可以完整檢視與還原。已經有 pending upgrade 時，則依既有紀錄接續，不要求把升級本身造成的修改先清掉。

Blueprint 的 lifecycle 是 repository-wide。所有已導入的應用程式都必須維持一致且可證明的 Blueprint 套件狀態；只有每個必要應用程式都完成驗證，repository 的生命週期才能推進。

如果還有未完成的架構編寫或拓樸轉換流程，必須先完成或明確處理，不能同時開始新的 upgrade lifecycle。

如果 `.blueprint-lifecycle.json` 損壞、內容無法驗證，或 Git 歷史能證明它曾經存在但目前檔案已遺失，`upgrade` 會停止，不會依目前的設定或已安裝套件自行重建 lifecycle history。若不在 Git repository 內，或 shallow clone 無法提供完整歷史，也同樣停止。請先從版本控制或其他可信來源還原 lifecycle state；無法還原時，交由 owner 決定後續處理。

如果 `.blueprint-lifecycle.json` 目前不存在，而且完整 Git 歷史中所有目前可追溯的 ref 都找不到曾包含這個檔案的 commit，Blueprint 不會把它視為「遺失的 lifecycle state」，因為現有版本控制證據無法證明 lifecycle 曾經成立。常見情況是 Renovate、Dependabot 或 `npm update` 在執行 `upgrade` 之前，就先把 4.0 專案的套件升到 4.1。這種 repository 會和 lifecycle 功能出現以前就已導入 Blueprint 的專案一樣，從目前可證明的套件與設定事實建立起始檢查點。Git 無法區分這種情況，和「使用 4.1 之後的版本導入、但從未提交 lifecycle state，之後又把檔案刪掉」；兩者會走同一條 bootstrap 路徑。請把 `.blueprint-lifecycle.json` 提交進版本控制，讓後續遺失時有可恢復的歷史依據。

## `remove`

`remove` 用來安全地把 Blueprint 從專案中移除。

請在解除安裝 `@kekkai/blueprint` 之前執行：

```bash
npx blueprint remove --dry-run
npx blueprint remove
```

Blueprint 會先算出完整的 repository-wide 移除計畫，確認每一項內容的所有權證據與可逆性。只要有任何共用內容無法安全判定，整次移除都會在實際修改之前停止。

### Blueprint 可以移除哪些內容

- **Blueprint 自己的檔案**
  例如 `blueprint.config.mjs`、`.blueprint-lifecycle.json`、`.blueprint-baseline.json`、受支援的設定備份，以及未完成的 Blueprint workflow 檔案。

- **Blueprint 產生的輸出**
  例如架構手冊、Blueprint 完整管理的 Agent 規則檔與 Blueprint 產生的 ESLint 設定。
  要刪除整個檔案，必須有足夠證據證明整份檔案都由 Blueprint 擁有；如果檔案後來已改由專案自行管理，就會保留並回報。

- **共用 Agent 文件中的 Blueprint 區塊**
  `CLAUDE.md`、`AGENTS.md` 等共用文件只會移除 `<!-- BLUEPRINT:START -->` 到 `<!-- BLUEPRINT:END -->` 之間的 Blueprint-managed section。
  只有能證明整個檔案原本就是 Blueprint 建立時，才可以在移除區塊後刪除整個檔案；原本就存在的 user-owned file 必須保留。

- **Blueprint 對共用檔案做過的修改**
  `.gitignore`、`package.json` scripts、TypeScript / JavaScript `paths`、Vite alias 等內容，只有在 lifecycle provenance 與目前檔案內容能共同證明「這一段就是 Blueprint 當初做的修改」時才會自動還原。
  如果 Blueprint 插入的內容已經不在檔案裡，或 script 已經變回原本的值，就視為已經還原，不會擋下移除。
  如果應用程式原始碼仍需要某段一般性接線，例如 import alias，該接線會保留。

- **Blueprint 建立的資料夾**
  Blueprint 能證明由自己建立，而且目前沒有專案內容的資料夾可以移除。若資料夾已經放入實際專案檔案，就會保留並回報。

- **相依套件**
  `@kekkai/blueprint` 一定最後才解除安裝。Blueprint 有完整 provenance 證明由自己加入的相關工具套件，也只會在其餘專案內容不再使用時一起移除。

### 有衝突時，整次移除會先停止

以下情況不能直接進行破壞性清理：

- `package.json` script 目前的值既不是 Blueprint 寫入的，也不是原本的值；
- 同一段曾由 Blueprint 插入的內容現在出現多次，無法判斷哪一段才是原本的修改；
- lifecycle 雖然記得 Blueprint 做過修改，但目前證據不足以精確還原；
- Blueprint-managed section 的 marker 已損壞或不完整；
- 會留下來的設定、script 或其他檔案仍引用 `@kekkai/blueprint`、Blueprint CLI，或即將刪除的 `blueprint.config.mjs`。

這些情況都會在任何刪除或改寫之前停止，並指出衝突的位置。處理完之後，再重新執行：

```bash
npx blueprint remove --dry-run
```

確認新的完整計畫。

### 多應用程式 repository

從 repository root 執行 `remove`，會移除範圍內所有已導入的應用程式。

如果只在其中一個應用程式範圍執行，Blueprint 可以只移除該應用程式，但必須保持 repository-wide lifecycle 一致。其他仍採用 Blueprint 的 sibling application，其 lifecycle/provenance 與共用 Blueprint 套件都必須保留。

如果 repository 目前還有尚未完成的 upgrade lifecycle，而只移除其中部分應用程式會讓 pending plan 失效，Blueprint 必須先停止，而不是留下仍引用已移除應用程式的 stale upgrade plan。

### 在生命週期紀錄出現之前就已導入的專案

較舊的 Blueprint 導入沒有完整 provenance 可以證明所有共用檔案修改。

這種情況下，`remove` 只會自動刪除能從檔名、Blueprint marker 或其他可靠內容證據證明屬於 Blueprint 的項目。

無法證明的內容會保留並明確列出，例如可能由 Blueprint 加入的 alias wiring、lint script、只剩 `.gitkeep` 的舊分層資料夾，或無法證明由 Blueprint 安裝的工具套件。

對於生命週期紀錄出現之前就已經導入 Blueprint 的共用 Agent 文件，Blueprint 可能可以從 `BLUEPRINT:START` / `BLUEPRINT:END` marker 證明其中一個區塊屬於 Blueprint，但沒有足夠證據證明整份檔案都是由 Blueprint 建立。

這種情況下，`remove` 只會移除可證明由 Blueprint 管理的區塊。即使移除後整份檔案變成空檔，也會保留該檔案，並列在需要使用者確認的保留項目中；是否刪除整份檔案由使用者自行決定。

Blueprint 不會因為某個值「看起來很像預設值」就把它當成自己的修改。

移除完成後，範圍內不應再留下任何能證明仍由 Blueprint 擁有或管理的設定、生命週期狀態、產出、managed section 或相依套件。

`remove` 的目標是乾淨地移除 Blueprint 的 ownership 與 tooling footprint，不是為了追求位元組層級的回復，而去改寫仍由應用程式本身需要的程式碼或設定。
