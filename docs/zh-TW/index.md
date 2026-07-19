---
layout: home

hero:
  name: '@kekkai/blueprint'
  text: Architecture as Code
  image:
    src: /logo.png
    alt: blueprint
  tagline: 一份 Blueprint，編譯出 ESLint 規則、給人讀的手冊、AI agent 契約、CI gate。
  actions:
    - theme: brand
      text: 快速上手
      link: /zh-TW/guide/getting-started
    - theme: alt
      text: 工程理念
      link: /zh-TW/philosophy/
    - theme: alt
      text: API Reference
      link: /api/

features:
  - icon: 🧱
    title: Enforce
    details: emitLint 把分層流向、模組邊界、套件歸屬編譯成 ESLint flat config —— plugin 內嵌，不用多裝任何東西。
  - icon: 📖
    title: Explain
    details: emitHandbook 產出給人讀的手冊（markdown + mermaid）—— 跟規則同源編譯，想漂移也漂移不了。
  - icon: 🤖
    title: Collaborate
    details: emitAgentFiles 把同一份 agent 契約分發到 CLAUDE.md、AGENTS.md、Cursor、Windsurf。
  - icon: 🚦
    title: Gate
    details: emitCi 產出 GitHub Actions workflow —— lint + 唯讀架構報告，違規 exit 1。
---

## 搭配使用，產出更好

Blueprint 管的是 agent context 裡的**架構**層 —— code 該放哪、誰能 import 誰、agent 該守哪些判斷。這兩個夥伴補的是它刻意留給別人的層：

| 搭配 | 補什麼 |
|---|---|
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 給 coding agent 的精選可安裝 **skills** —— 框架與工具鏈的 best practices，跟 blueprint 契約並肩放進 context：agent 同時拿到你的結構規則*和*生態圈的慣用寫法。 |
| [vuejs/docs](https://github.com/vuejs/docs) | Vue 官方文件的 source repo。把它餵給 agent（clone 到本地、或接成 reference source）當 **API ground truth** —— 跟 Vue preset 搭配尤其對味。 |

一份契約管「code 放哪」（blueprint）、一包 skills 管「框架怎麼寫得好」（agent-skills）、一份權威文件管「API 到底長怎樣」（官方 docs）—— 三個輸入幾乎不重疊，合起來把「能跑」到「寫得好」的距離補掉大半。
