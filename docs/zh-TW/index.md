---
layout: home

hero:
  name: '@kekkai/blueprint'
  text: Architecture as Code
  image:
    src: /logo.png
    alt: blueprint
  tagline: 以單一 Blueprint 組態，編譯出 ESLint 規則、供人閱讀的架構手冊、AI 代理契約，以及 CI 檢核流程。
  actions:
    - theme: brand
      text: 快速上手
      link: /zh-TW/guide/getting-started
    - theme: alt
      text: 功能總覽
      link: /zh-TW/guide/features
    - theme: alt
      text: 工程理念
      link: /zh-TW/philosophy/
    - theme: alt
      text: API 文件
      link: /zh-TW/api/
features:
  - icon: 🧱
    title: Enforce（強制）
    details: emitLint 將分層依賴方向、模組邊界與套件歸屬編譯為 ESLint flat config；自訂規則以內嵌外掛提供，無須額外安裝任何套件。
    link: /zh-TW/guide/generated-artifacts#eslint-config-mjs-——-強制-enforce
    linkText: 檢視生成的組態
  - icon: 📖
    title: Explain（說明）
    details: emitHandbook 產出供人閱讀的架構手冊（markdown 與 mermaid 圖）。手冊與規則由同一來源編譯而成，內容不會與規則產生落差。
    link: /zh-TW/guide/generated-artifacts#docs-architecture-handbook-md-——-說明-explain
    linkText: 檢視手冊樣貌
  - icon: 🤖
    title: Collaborate（協作）
    details: emitAgentFiles 將同一份 AI 代理契約分發至 CLAUDE.md、AGENTS.md 以及 Cursor、Windsurf 的規則檔。
    link: /zh-TW/guide/generated-artifacts#claude-md-agents-md-——-協作-collaborate
    linkText: 檢視契約樣貌
  - icon: 🚦
    title: Gate（檢核）
    details: emitCi 產出 GitHub Actions 工作流程，將程式碼檢查與唯讀架構報告納入持續整合；發現違規即以狀態碼 1 結束。
    link: /zh-TW/guide/generated-artifacts#github-workflows-blueprint-ci-yml-——-檢核-gate
    linkText: 檢視工作流程
---

## 建議搭配使用的資源

Blueprint 負責 AI 代理情境中的「架構」層面：程式碼應放置於何處、哪些分層可以相互匯入、代理應遵守哪些判斷規範。以下兩項資源補足 Blueprint 刻意不涉入的層面：

| 搭配資源 | 補足的層面 |
|---|---|
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 為程式開發代理精選、可直接安裝的技能包，涵蓋各框架與工具鏈的最佳實務。與 Blueprint 契約一同載入情境後，代理同時獲得專案的結構規範與生態圈的慣用寫法。 |
| [vuejs/docs](https://github.com/vuejs/docs) | Vue 官方文件的原始碼儲存庫。將其提供給代理（複製至本機，或設定為參考來源）作為 API 的權威依據，與 Vue 預設藍圖搭配使用尤為合適。 |

一份契約規範「程式碼放置於何處」（Blueprint）、一組技能包規範「框架如何正確使用」（agent-skills）、一份權威文件回答「API 的實際定義」（官方文件）。三項輸入幾乎不重疊，合併使用可大幅縮短「能夠執行」與「寫得正確」之間的距離。
