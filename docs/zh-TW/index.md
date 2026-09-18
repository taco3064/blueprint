---
layout: home

hero:
  name: "@kekkai/blueprint"
  text: Architecture as Code
  image:
    src: /logo.png
    alt: blueprint
  tagline: 一份架構定義，同時供可執行檢查、人類文件與程式撰寫 Agent 使用。
  actions:
    - theme: brand
      text: 用 AI 導入
      link: "#用-ai-導入"
    - theme: alt
      text: 定義架構
      link: "/zh-TW/configuration"
---

## 讓架構可以被執行

架構規則常散落在圖表、程式碼審查留言與成員記憶裡。程式碼、文件與交給程式撰寫
Agent 的指示各自演進，最後自然會走向不同版本。

Blueprint 把長期有效的架構模型放進 `blueprint.config.mjs`。同一份定義可產生結構性
ESLint 檢查、給人閱讀的架構手冊，以及程式撰寫 Agent 的工作守則；`inspect`、`doctor`、
`deps` 等指令則會拿真實專案回頭驗證這份模型。

## 用 AI 導入

先選擇這個專案要遵循的架構規則。Blueprint 不會根據目前的資料夾結構替你推斷
這項決定。

<AdoptWithAI />

想先理解差異或自行操作 CLI，可閱讀[指令中的 `init`](/zh-TW/commands#init)。

## 用 AI 升級或移除 Blueprint

導入 Blueprint 之後，你可以直接用平常的方式告訴程式撰寫 Agent 你要做什麼。

Blueprint 產生的 Agent 守則會把升級與移除需求導向 Blueprint 自己的生命週期指令，避免 Agent 自行從 CHANGELOG、release note 或套件版本差異拼湊遷移步驟，也避免在清理完成之前先把 Blueprint 套件解除安裝。

```text
把 Blueprint 升級到最新版。
```

Agent 會執行：

```bash
npx @kekkai/blueprint@latest upgrade
```

如果升級仍有需要語意判斷的工作，Blueprint 會產生 `blueprint-upgrade.md`。Agent 只執行這份已解析完成的有效升級計畫，逐項記錄完成狀態，直到 Blueprint 驗證整個升級完成為止。

如果專案是在 `upgrade` / `remove` 生命週期指令加入之前就已經導入 Blueprint，既有 Agent 守則還不知道這套流程。第一次升級時，請直接把指令一起告訴 Agent：

```text
用 npx @kekkai/blueprint@latest upgrade 把 Blueprint 升級到最新版。
```

要移除 Blueprint 時則可以說：

```text
把 Blueprint 從這個專案移除。
```

Agent 會先執行：

```bash
npx blueprint remove --dry-run
```

確認完整的移除計畫並處理所有權衝突後，再執行：

```bash
npx blueprint remove
```

Blueprint 會先清理自己能證明擁有的檔案、區塊與接線，最後才解除安裝 `@kekkai/blueprint`。

完整的升級與移除規則請見 [`upgrade`](/zh-TW/commands#upgrade) 與 [`remove`](/zh-TW/commands#remove)。

## 深入了解

- [指令](/zh-TW/commands) — 所有公開指令、旗標、輸出與拒絕條件，包含升級與移除。
- [設定](/zh-TW/configuration) — 完整的 `blueprint.config.mjs` 模型。
- [產出檔案](/zh-TW/generated-files) — Blueprint 會建立或修改哪些內容、由誰管理，以及什麼時候可以安全移除。
- [工程理念](/zh-TW/philosophy/) — 這份運作契約背後的工程原則。
- [API 參考](/zh-TW/api/) — 給套件使用者的自動產生型別文件。

安全性回報方式與支援政策以專案的
[Security policy](https://github.com/taco3064/blueprint/security/policy) 為準；版本沿革則以
專案的 [Changelog](https://github.com/taco3064/blueprint/blob/main/CHANGELOG.md) 為準。
