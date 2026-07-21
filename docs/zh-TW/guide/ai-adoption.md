# AI 協助導入

在既有專案導入 blueprint 是判斷性工作，不是初始化工作：分層結構早就存在，必須先有人「讀懂」它，規則才有辦法把它編碼下來。blueprint 把這件事切成三個階段，只有中間那段需要智慧判斷：

| 階段 | 執行者 | 工具 |
|---|---|---|
| **蒐證** —— 資料夾結構、匯入關係矩陣、模組形狀、套件集中度 | 決定性程序 | `blueprint survey` |
| **判斷** —— 哪些資料夾是分層、依賴方向往哪、哪些是債務、哪些是設計意圖 | AI Agent（或開發者本人） | 導入作業手冊 |
| **驗證** —— 每項違規都要能解釋為真實債務，而不是 config 譯錯 | 決定性程序 | `blueprint inspect` 與 baseline 棘輪 |

## 導入流程

於「已有程式碼、尚無 `blueprint.config.mjs`」的專案執行 init：

```bash
npx @kekkai/blueprint init
```

init 不會硬套預設藍圖，而是掃描程式碼後產出：

- **`blueprint-authoring.md`** —— 可執行的導入作業手冊：蒐證數據、推導方法、config 結構速覽與驗收條件
- **`.claude/commands/blueprint-author.md`** —— Claude Code 使用者可直接輸入 `/blueprint-author` 啟動

接著交給 AI Agent 執行：

```bash
claude "Read blueprint-authoring.md at the repository root and execute it end to end."
# codex 亦使用相同的提示語
# 或以單一指令完成：
npx @kekkai/blueprint init --agent claude
```

Agent 依蒐證數據推導 config，反覆對照 `blueprint inspect` 直到每項違規都能解釋為真實債務，再重新執行 `init` 產出各項成品並鎖定 baseline。開發者只需要審閱最終結果。

`--agent` 是刻意設計得最薄的一層：它在前景以互動模式執行**畫面上已印出的那行指令**，且跑在你自己 Agent CLI 的權限之下。確切的安全邊界見[安全與信任](/zh-TW/guide/security)。

若欲完全跳過編寫流程、即使在既有專案上也直接以框架預設藍圖建置，可改用 `init --preset` —— 這是已確認預設藍圖適用時的快捷途徑。

## 建議的提示詞

方法不用寫進 prompt —— 蒐證、推導、驗收都在 `blueprint-authoring.md` 裡。prompt 只要釘住「怎樣算完成」：

```text
請協助導入 @kekkai/blueprint，並自主完成：
執行 `npx @kekkai/blueprint init --authoring`，
將其產出的 blueprint-authoring.md 全數完整執行完畢。

驗收 —— `blueprint doctor` 要過，另外：
- lint、`inspect --baseline`、原有測試都要過
- emitLint 真的接進 ESLint（不留 reference 檔）
- 不改任何 source code —— 違規鎖 baseline，不用 eslint suppressions
```

`--authoring` 保證即使在小 repo 上也會產出 playbook（純 `init` 在檔數低於門檻時會改建 preset、不產 playbook）。三條驗收各自對應實測中出現過的未完成狀態：整合只做一半、檢核沒跑完、把還債混進導入。全新專案不需要這段 —— `init` 一個指令就完成；`init` 跑過之後也可以在 Claude Code 直接輸入 `/blueprint-author`。

## 驗證有沒有做完 —— `blueprint doctor`

「導入到底做完了沒？」這問題以前只能靠人記 prompt 的驗收條款。`blueprint doctor` 把它變成唯讀 checklist，四項全過才 exit 0 —— 可以直接塞進 Agent 的驗證迴圈或 CI：

```bash
npx @kekkai/blueprint doctor
```

- **blueprint.config.mjs 存在**
- **沒有殘留的 `*.blueprint.*` reference 檔** —— reference 還在磁碟上就代表 merge 沒做完（最常漏的一步）
- **eslint 真的接上 emitLint** —— legacy `.eslintrc` 會被標記為「先遷移」，不會無聲留半套
- **架構乾淨** —— 沒有 baseline 以外的違規

`--json` 輸出同一份 checklist 給工具用。

## 蒐證步驟的必要性

讓 AI Agent 自己從零翻整個專案，又慢又不可靠。`survey` 直接把決定性的事實餵給 Agent：

```bash
npx @kekkai/blueprint survey          # 供人閱讀的報告
npx @kekkai/blueprint survey --json   # 供工具或 Agent 讀取
```

- 頂層資料夾清單與**模組形狀證據**（`index` 檔覆蓋率、巢狀深度 —— 作為判斷資料夾式或扁平式模組的依據）
- **資料夾之間的匯入關係矩陣**，依匯入次數由高至低排列 —— 呈現設計意圖中的依賴方向，以及屬於債務的逆向依賴
- **套件集中度** —— 作為 `owns`（套件歸屬）宣告的候選依據
- 測試檔慣例統計 —— 應歸入 `testFiles` 而非 `layers` 的項目

## 失敗情境的處理原則

所有產出物都在任何 AI Agent 啟動**之前**就寫入磁碟。啟動失敗、或 Agent 中途放棄，流程就回到手動路徑 —— 同一份作業手冊，改由開發者親自執行。`inspect` 唯讀、`init` 冪等、baseline 只在最後一步寫入，所以不存在「導入到一半」的中間狀態要清理。

## 既有 ESLint —— 一本帳，不要兩本

`emitLint` 產出的是 error 等級的 flat config。碰上已經有結構違規的 repo —— 更麻煩的是還停在 ESLint 8 / `.eslintrc` 的 —— 「真的接上＋全綠＋不改 source」三件事沒辦法同時成立。正規的坡道是：

- 設 `emit: { lint: { severity: 'warn' } }` —— 結構規則進編輯器變警告，不會弄紅任何東西
- 讓 `inspect --baseline` 當**唯一的債務帳本** —— 一種格式、一個棘輪、CI 裡唯一的硬關卡
- baseline 歸零時，再把 severity 切回 `'error'`

同一批債務不要鎖兩次（eslint suppressions 跟 blueprint baseline 會各自漂移）。至於 legacy 格式的 flat-config 遷移，永遠是留給你的決策事項，playbook 不會擅自動手。

## 範圍的誠實界定

作業手冊只承諾「產出 config 並鎖定 baseline」，**不承諾**幫你清償既有債務。既有違規會記錄進 baseline，後續透過 [baseline 棘輪](/zh-TW/guide/getting-started)逐步清償 —— 導入跟債務清償是兩件獨立的事。
