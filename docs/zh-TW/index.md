---
layout: home

hero:
  name: '@kekkai/blueprint'
  text: Architecture as Code
  image:
    src: /logo.png
    alt: blueprint
  tagline: 將前端設計理念，轉譯成 ESLint 規則、供人閱讀的架構手冊、AI Agent 的守則，以及 CI 檢核流程。
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
    details: emitLint 將分層依賴方向、模組邊界與套件歸屬轉譯為 ESLint flat config；自訂規則以內嵌 plugin 提供，不用額外安裝任何套件。
    link: /zh-TW/guide/generated-artifacts#eslint-config-mjs-——-強制-enforce
    linkText: 檢視生成的 config
  - icon: 📖
    title: Explain（說明）
    details: emitHandbook 產出給人閱讀的架構手冊（markdown 與 mermaid 圖）。手冊與規則出自同一份來源，不會發生「文件講一套、lint 擋另一套」的落差。
    link: /zh-TW/guide/generated-artifacts#docs-architecture-handbook-md-——-說明-explain
    linkText: 檢視手冊樣貌
  - icon: 🤖
    title: Collaborate（協作）
    details: emitAgentFiles 將同一份 AI Agent 守則發佈至 CLAUDE.md、AGENTS.md，以及 Cursor、Windsurf 的規則檔。
    link: /zh-TW/guide/generated-artifacts#claude-md-agents-md-——-協作-collaborate
    linkText: 檢視守則樣貌
  - icon: 🚦
    title: Gate（檢核）
    details: emitCi 產出 GitHub Actions workflow，讓 lint 與唯讀架構報告從第一個 commit 就開始把關；發現違規就以 exit code 1 直接擋下。
    link: /zh-TW/guide/generated-artifacts#github-workflows-blueprint-ci-yml-——-檢核-gate
    linkText: 檢視工作流程
  - icon: 🧭
    title: Adopt（導入）
    details: 既有專案的導入流 —— survey 蒐證、你自己的 Agent 編寫 config、baseline 棘輪把今日債務鎖住，之後只會更緊。
    link: /zh-TW/guide/ai-adoption
    linkText: 看導入流程
  - icon: 🔎
    title: Verify（驗證）
    details: 讀同一份 config 的唯讀指令 —— inspect 裁決架構（九種檢測、可進 CI），deps 回答「改這個模組會波及誰」。
    link: /zh-TW/guide/features#檢測-——-會被攔下的
    linkText: 看會攔下什麼
---

## 一份 config，轉譯出全部

<div class="compile-flow">
  <div class="cf-source">blueprint.config.mjs</div>
  <div class="cf-arrow">→</div>
  <div class="cf-outputs">
    <div>eslint.config.mjs <span>Enforce —— 結構規則＋內嵌 plugin</span></div>
    <div>docs/architecture-handbook.md <span>Explain —— 給人讀的架構手冊</span></div>
    <div>CLAUDE.md · AGENTS.md · … <span>Collaborate —— AI Agent 的守則</span></div>
    <div>.github/workflows/blueprint-ci.yml <span>Gate —— lint ＋ inspect 進 CI</span></div>
    <div>inspect · deps <span>Verify —— 讀同一份 config 的唯讀指令</span></div>
  </div>
</div>

改 config、重新生成，所有產出物一起動 —— 它們不會漂移，因為全部是同一份來源轉譯出來的。完整長相見 [init 產出物](/zh-TW/guide/generated-artifacts)。

## 為什麼需要它

AI Agent 寫 code 又快又多，但檔案要放哪、誰可以 import 誰，全看它當下 context 裡有什麼。而架構文件、ESLint 設定、CLAUDE.md 是三份各自手動維護的東西 —— 遲早講的不是同一套。

blueprint 把它們收斂成一份 config：規範怎麼寫，lint 就怎麼擋、手冊就怎麼講、Agent 就怎麼守。

## 直接丟給你的 Agent

既有專案想全自動導入？把這段貼給你的 Agent：

```text
請協助導入 @kekkai/blueprint，並自主完成：
執行 `npx @kekkai/blueprint init`，
將其產出的 blueprint-authoring.md 全數完整執行完畢。

驗收：
- lint、`inspect --baseline`、原有測試都要過
- emitLint 真的接進 ESLint（不留 reference 檔）
- 不改任何 source code —— 違規鎖 baseline，不用 eslint suppressions
```

每條驗收在防什麼、流程長怎樣，見 [AI 協助導入](/zh-TW/guide/ai-adoption)。

## 建議搭配使用的資源

Blueprint 負責 AI Agent 協作裡的「架構」層面：程式碼該放哪、哪些分層可以互相匯入、Agent 要守住哪些判斷。以下兩項資源補足 blueprint 刻意不涉入的層面：

| 搭配資源 | 補足的層面 |
|---|---|
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 為 AI Agent 精選、可直接安裝的技能包，涵蓋各框架與工具鏈的最佳實務。與 blueprint 守則一同載入後，Agent 同時拿到專案的結構規範與生態圈的慣用寫法。 |
| [vuejs/docs](https://github.com/vuejs/docs) | Vue 官方文件的原始碼 repo。提供給 Agent（clone 到本機，或設定為參考來源）作為 API 的權威依據，跟 Vue 預設藍圖搭配使用尤其合適。 |

一份守則管「程式碼放哪」（blueprint）、一組技能包管「框架怎麼用得對」（agent-skills）、一份權威文件回答「API 實際長怎樣」（官方文件）。三項輸入幾乎不重疊，合起來可以大幅縮短「能跑」跟「寫得對」之間的距離。
