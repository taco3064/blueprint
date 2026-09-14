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

## 深入了解

- [指令](/zh-TW/commands) — 所有公開指令、旗標、輸出與拒絕條件。
- [設定](/zh-TW/configuration) — 完整的 `blueprint.config.mjs` 模型。
- [產出檔案](/zh-TW/generated-files) — `init` 會建立或修改什麼、由誰管理、保留多久。
- [工程理念](/zh-TW/philosophy/) — 這份運作契約背後的工程原則。
- [API 參考](/zh-TW/api/) — 給套件使用者的自動產生型別文件。

安全性回報方式與支援政策以專案的
[Security policy](https://github.com/taco3064/blueprint/security/policy) 為準；版本沿革則以
專案的 [Changelog](https://github.com/taco3064/blueprint/blob/main/CHANGELOG.md) 為準。
