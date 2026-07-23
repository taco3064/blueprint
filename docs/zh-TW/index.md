---
layout: home

hero:
  name: "@kekkai/blueprint"
  text: Architecture as Code
  image:
    src: /logo.png
    alt: blueprint
  tagline: 將前端架構轉譯成 ESLint 規則、架構手冊、AI Agent 契約，讓人與 AI 依循同一份架構。
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

## 一份設定，全面落地

<CompileFlow />

改設定、重新生成，所有產出物一起變更 —— 它們不會漂移，因為全部是同一份來源轉譯出來的。完整長相見 [init 產出物](/zh-TW/guide/generated-artifacts)。

## 快速上手

既有專案導入，兩種方式。你幾乎不用貼什麼 —— `init --authoring` 會寫出 playbook，其餘的（跑到底、什麼叫做完）它自己交代給 agent。

<QuickStart />

每個驗收步驟在防什麼、完整流程，見 [AI 協助導入](/zh-TW/guide/ai-adoption)。

## 建議搭配使用的資源

Blueprint 負責 AI Agent 協作裡的「架構」層面：程式碼該放哪、哪些分層可以互相匯入、Agent 要守住哪些判斷。以下兩項資源補足 blueprint 刻意不涉入的層面：

| 搭配資源                                                                | 補足的層面                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 為 AI Agent 精選、可直接安裝的技能包，涵蓋各框架與工具鏈的最佳實務。與 blueprint 守則一同載入後，Agent 同時拿到專案的結構規範與生態圈的慣用寫法。 |
| [vuejs/docs](https://github.com/vuejs/docs)                             | Vue 官方文件的原始碼 repo。提供給 Agent（clone 到本機，或設定為參考來源）作為 API 的權威依據，跟 Vue 預設藍圖搭配使用尤其合適。                   |

一份守則管「程式碼放哪」（blueprint）、一組技能包管「框架怎麼用得對」（agent-skills）、一份權威文件回答「API 實際長怎樣」（官方文件）。三項輸入幾乎不重疊，合起來可以大幅縮短「能跑」跟「寫得對」之間的距離。
