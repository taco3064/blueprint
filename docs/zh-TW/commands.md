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

1. **建置或修復**：替規模小或全新的 layer-first 專案建立預設設定，或依既有有效設定檔
   更新產生的整合內容。
2. **架構編寫指南**：適用於尚無有效設定檔的既有專案，以及所有首次 module-first 導入。
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

- **`--topology layer-first|module-first`** — 第一次導入專案時必填。已導入的專案若指定相同目標，會修復現有拓樸；指定相反目標，則啟動全專案轉換。
- **`--preset`** — 跳過架構編寫，使用偵測到的 Vue、React 或 Next 預設設定。這只適用 layer-first；module-first 專案與已有自訂設定檔的應用程式會拒絕執行。
- **`--authoring`** — 即使少於 10 個原始碼檔案，也強制產生架構編寫指南。不能與 `--preset` 並用。
- **`--agent claude|codex`** — 編寫或轉換流程會在指南安全寫入後啟動指定的本機 Agent CLI；預設設定流程不啟動 Agent，只縮小要產生的 Agent 守則目標。
- **`--framework vue|react`** — 框架證據不明確時指定。一般 Vue、React 會自動偵測；Next.js 會使用能辨識路由器的預設設定。
- **`--no-install`** — 不執行偵測到的套件管理工具，並在計畫裡列出待安裝內容。
- **`--dry-run`** — 只顯示計畫，不修改檔案，也不啟動 Agent。
- **`--recover-transformation`** — 從 Git 保留的權威記錄還原遺失的 LF→MF 待完成證據與復原指南，保留既有決策與指南；不執行導入、產生架構檔案或完成轉換。請單獨使用，或搭配 `--dry-run`。復原要求目前 `HEAD` 與原始記錄一致，且應用程式與來源範圍安全。若決策檔曾遭刪除，必須重新審查並記錄遺失的決策，才能驗證完成。詳見[產出檔案](./generated-files.md)。

### 可能修改的內容

完成建置時，可能建立 `blueprint.config.mjs`、Blueprint 管理的 ESLint 設定或參考設定、
指定路徑的架構手冊、所選 Agent 守則，以及全新 layer-first 預設設定缺少的分層資料夾。
它也可能更新別名接線、一般 `lint` 指令、`.gitignore`，並透過偵測到的套件管理工具更新
相依套件。完整清單與管理權責見[產出檔案](/zh-TW/generated-files)。

既有 ESLint 設定絕不會被覆寫。除非 Blueprint 能辨識出自己產生並管理的設定檔，否則
只會建立 `eslint.config.blueprint.mjs` 供你整合。重複執行 `init` 應得到相同結果。

### 重要邊界

- 原始碼形狀只是證據，不是拓樸權威。同一個專案內的有效設定檔必須解析成同一種拓樸。
- 多應用程式範圍未確定時，任何寫入前就會停止；編寫階段必須明確選擇應用程式的原始碼根目錄。
- Layer-first 可使用預設設定建置；module-first 一定要先由人或 Agent 決定模組圖。
- 拓樸轉換要求 Git 專案、乾淨工作目錄與可復原的已提交 `HEAD`。Blueprint 會記錄量測到的
  搬移證據，但領域命名、擺放位置、衝突處理與匯入改寫仍由 Agent 判斷，並以 `git mv` 執行。
- Next.js App Router 會保留。遇到不支援的 Pages Router 或不明確路由器轉換時，流程會停止，
  不會暗中改變路由架構。
- Nuxt 的自動匯入讓 Blueprint 無法提出可信的靜態分析結果，因此目前不支援。

遭拒或執行失敗時會以非零狀態結束。若明確要求的 Agent 啟動失敗，先前產生的指南與檔案
仍已保存在磁碟上，可改走手動流程。

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
