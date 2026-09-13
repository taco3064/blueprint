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
      text: 從 init 開始
      link: "/zh-TW/commands#init"
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

## 選擇符合專案的拓樸

- **Layer-first** 採用 `Layer → Unit`：`pages`、`components`、`services` 等全專案共用層
  直接組成原始碼樹。
- **Module-first** 採用 `Module → Layer → Unit`：一般領域模組重複使用同一套內部分層，
  模組間再由 `dependsOn` 建立外層相依邊界。

Blueprint 不會從資料夾名稱猜拓樸。有效設定檔才是權威；需要改變模型時，則交由有保護
機制的轉換流程處理。

## 第一次導入

先預覽 layer-first 導入，不寫入任何檔案：

```bash
npx @kekkai/blueprint init --topology layer-first --dry-run
```

開始編寫 module-first 架構：

```bash
npx @kekkai/blueprint init --topology module-first
```

既有專案會先經過客觀盤點，再由程式撰寫 Agent 編寫或轉換架構；規模小的新專案則可走
Vue、React 或 Next 預設設定流程。

## 深入了解

- [指令](/zh-TW/commands) — 所有公開指令、旗標、輸出與拒絕條件。
- [設定](/zh-TW/configuration) — 完整的 `blueprint.config.mjs` 模型。
- [產出檔案](/zh-TW/generated-files) — `init` 會建立或修改什麼、由誰管理、保留多久。
- [工程理念](/zh-TW/philosophy/) — 這份運作契約背後的工程原則。
- [API 參考](/zh-TW/api/) — 給套件使用者的自動產生型別文件。

安全性回報方式與支援政策以專案的
[Security policy](https://github.com/taco3064/blueprint/security/policy) 為準；版本沿革則以
專案的 [Changelog](https://github.com/taco3064/blueprint/blob/main/CHANGELOG.md) 為準。
