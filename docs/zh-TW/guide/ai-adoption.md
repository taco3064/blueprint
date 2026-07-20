# AI 協助導入

在 **brownfield** repo 上導入 blueprint 是判斷題，不是 scaffold 題：層次早就存在，得先有人「讀懂」它們，規則才能編碼它們。Blueprint 把這件事切成三段 —— 只有中間那段需要智慧：

| 段 | 誰做 | 工具 |
|---|---|---|
| **蒐證** —— 資料夾、import 矩陣、模組形狀、套件集中度 | 決定論 | `blueprint survey` |
| **判斷** —— 哪些資料夾是層、流向往哪、什麼是債什麼是意圖 | agent（或你） | authoring 劇本 |
| **驗證** —— findings 必須能解釋成真債，而不是誤譯 | 決定論 | `blueprint inspect` + baseline ratchet |

## 流程

在「有程式碼、沒有 `blueprint.config.mjs`」的 repo 上跑 init：

```bash
npx @kekkai/blueprint init
```

init 不會瞎猜 preset，而是掃描程式碼後寫出：

- **`blueprint-authoring.md`** —— 可執行的劇本：survey 證據、authoring 方法、config schema 速寫、驗收條件
- **`.claude/commands/blueprint-author.md`** —— Claude Code 使用者直接打 `/blueprint-author`

然後交給你的 agent：

```bash
claude "Read blueprint-authoring.md at the repository root and execute it end to end."
# 或 codex 同一句 prompt
# 或一步到位：
npx @kekkai/blueprint init --agent claude
```

agent 從證據推導 config、對著 `blueprint inspect` 迭代到每條 finding 都能解釋成真債、重跑 `init` 生成產物、鎖 baseline。你只需要 review 結果。

`--agent` 是最薄的一層：它在前景、互動式地執行**印出來的那行指令**，跑在你自己 agent CLI 的權限之下 —— 確切邊界見 [Security & Trust](/zh-TW/guide/security)。

## 為什麼 survey 重要

讓 agent 自己從零 grep 一個 repo 又慢又不可靠。`survey` 直接把決定論的事實遞給它：

```bash
npx @kekkai/blueprint survey          # 人讀版
npx @kekkai/blueprint survey --json   # 給工具 / agent
```

- 頂層資料夾 + **模組形狀證據**（index 覆蓋率、巢狀深度 —— folder vs flat 的判斷素材）
- **資料夾對資料夾 import 矩陣**，重邊在前 —— 意圖中的流向，以及屬於債的逆向邊
- **套件集中度** —— `owns` 候選
- test 慣例命中 —— 該進 `testFiles` 而不是 `layers` 的東西

## 失敗語意

所有產物在任何 agent 啟動**之前**就已落盤。啟動失敗、或 agent 中途放棄，就退回手動路徑 —— 同一份劇本，換你自己走。`inspect` 唯讀、`init` 冪等、baseline 只在最後一步才寫，不存在「導入到一半的髒狀態」要收拾。

## 誠實的範圍

劇本只承諾「寫出 config + 鎖 baseline」，**不承諾**把債重構掉。既有違規記進 baseline、之後靠 [baseline ratchet](/zh-TW/guide/getting-started#brownfield-blueprint-inspect) 逐步清償 —— 導入跟還債是兩件事。
