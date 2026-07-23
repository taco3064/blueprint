---
layout: home

hero:
  name: "@kekkai/blueprint"
  text: Architecture as Code
  image:
    src: /logo.png
    alt: blueprint
  tagline: 將前端架構轉化為 ESLint 規則與 AI Agent 守則
  actions:
    - theme: brand
      text: 快速上手
      link: "#quick-start"
    - theme: alt
      text: 工程理念
      link: "#philosophy"
---

## 為什麼需要它

<ProblemCards />

## 一份設定，全面落地

<CompileFlow />

改設定、重新生成，所有產出結果一起變更 —— 它們不會漂移，因為全部是同一份來源轉譯出來的。詳細內容見 [init 產出結果](/zh-TW/guide/generated-artifacts)。

## 快速上手 {#quick-start}

既有專案導入，兩種方式。<br>
你幾乎不用貼什麼 —— `init --authoring` 會寫出 playbook，其餘的（跑到底、什麼叫做完）它自己交代給 agent。

<QuickStart />

每個驗收步驟在防什麼、完整流程，見 [AI 協助導入](/zh-TW/guide/ai-adoption)。

## 工程理念 {#philosophy}

Blueprint 的工程理念涵蓋以下面向 —— 全都會編進你的 repo，成為 lint 規則與 agent 守則：

<PhilosophyFacets />

它對「你的框架怎麼用得好」「它的 API 實際長怎樣」**刻意不表態** —— 依專案的技術選型，挑對應的搭配資源：

- **React & Next.js** —— [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)：<br>
  Vercel Engineering 的最佳實務 skill 包，與 blueprint 守則並用，<br>
  讓 Agent 同時拿到你的結構規範與框架慣用寫法。
- **Vue** —— [vuejs/docs](https://github.com/vuejs/docs)：<br>
  官方文件原始碼，提供給 Agent 作為 API 權威依據，搭配 Vue preset。

Blueprint 管「程式碼放哪」，框架資源管「怎麼寫得道地」 —— 兩者一起，縮短「能跑」跟「寫得對」的距離。完整理念見 [工程理念](/zh-TW/philosophy/)。
