---
layout: home

hero:
  name: '@kekkai/blueprint'
  text: Architecture as Code
  image:
    src: /logo.png
    alt: blueprint
  tagline: 將前端架構轉譯成 ESLint 規則、架構手冊、AI Agent 契約，以及 CI 檢核流程，讓人、AI 與自動化工具依循同一份架構。
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
---

## 為什麼需要它

<ProblemCards />

## 一份 config，轉譯出全部

<div class="compile-flow">
  <div class="cf-source">blueprint.config.mjs</div>
  <div class="cf-arrow">→</div>
  <div class="cf-outputs">
    <div>eslint.config.mjs <span>強制 —— 結構規則＋內嵌 plugin</span></div>
    <div>docs/architecture-handbook.md <span>說明 —— 給人讀的架構手冊</span></div>
    <div>CLAUDE.md · AGENTS.md · … <span>協作 —— AI Agent 的守則</span></div>
    <div>.github/workflows/blueprint-ci.yml <span>檢核 —— lint ＋ inspect 進 CI</span></div>
    <div>inspect · deps · rules <span>驗證 —— 讀同一份 config 的唯讀指令</span></div>
  </div>
</div>

改 config、重新生成，所有產出物一起動 —— 它們不會漂移，因為全部是同一份來源轉譯出來的。完整長相見 [init 產出物](/zh-TW/guide/generated-artifacts)。

## 直接丟給你的 Agent

既有專案想全自動導入？把這段貼給你的 Agent：

```text
請協助導入 @kekkai/blueprint，並自主完成：
執行 `npx @kekkai/blueprint init --authoring`，
將其產出的 blueprint-authoring.md 全數完整執行完畢
（playbook 自己給的結論就是完整執行 —— 它叫你早退，早退就是做完）。

驗收（`blueprint doctor` 要過）：
- lint、`inspect --baseline`、原有測試都要過（沒有測試＝空泛通過，不用補）
- emitLint 真的接進 ESLint（不留 reference 檔）
- 不改任何 source code —— 既有債鎖進帳本：架構用 `inspect --update-baseline`，
  lint 用 `eslint --suppress-all`（都只在有債時跑 —— 空帳本是儀式，不是交付物）
```

每條驗收在防什麼、流程長怎樣，見 [AI 協助導入](/zh-TW/guide/ai-adoption)。

## 建議搭配使用的資源

Blueprint 負責 AI Agent 協作裡的「架構」層面：程式碼該放哪、哪些分層可以互相匯入、Agent 要守住哪些判斷。以下兩項資源補足 blueprint 刻意不涉入的層面：

| 搭配資源 | 補足的層面 |
|---|---|
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 為 AI Agent 精選、可直接安裝的技能包，涵蓋各框架與工具鏈的最佳實務。與 blueprint 守則一同載入後，Agent 同時拿到專案的結構規範與生態圈的慣用寫法。 |
| [vuejs/docs](https://github.com/vuejs/docs) | Vue 官方文件的原始碼 repo。提供給 Agent（clone 到本機，或設定為參考來源）作為 API 的權威依據，跟 Vue 預設藍圖搭配使用尤其合適。 |

一份守則管「程式碼放哪」（blueprint）、一組技能包管「框架怎麼用得對」（agent-skills）、一份權威文件回答「API 實際長怎樣」（官方文件）。三項輸入幾乎不重疊，合起來可以大幅縮短「能跑」跟「寫得對」之間的距離。
