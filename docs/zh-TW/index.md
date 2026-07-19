---
layout: home

hero:
  name: '@kekkai/blueprint'
  text: Architecture as Code
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
