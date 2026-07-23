<script setup>
import { computed, ref } from "vue";
import { useData } from "vitepress";

// Copy lives here (both locales) so each index.md only writes <ProblemCards />
// and the flip markup stays in one place. Proof lines stay English in both
// locales — they are illustrative tool output, which is English regardless of
// the page language.
const COPY = {
  en: {
    lead: "What letting an AI write your code quietly costs — and what blueprint does about each.",
    flip: "See how →",
    back: "← Back",
    cards: [
      {
        kicker: "Placement",
        pain: "The AI ships a working feature — and drops the new files wherever was convenient. A few sessions later, nothing lives where it should.",
        tag: "blueprint pins where each layer’s code belongs — and lint blocks the crossing",
        mechanism:
          "Your layers and module shape become import-boundary rules the AI reads up front (agent contract) and can’t cross (lint). New code lands in the right folder, or the build goes red.",
        proof: "✗ services/ may not import from pages/",
      },
      {
        kicker: "Single responsibility",
        pain: "“Just make it work” — so the AI keeps piling responsibilities into one file until it does five jobs and owns none.",
        tag: "blueprint writes single-responsibility into the contract, and lint enforces the mechanical minimum",
        mechanism:
          "SRP is a judgment call, so it lives in the agent contract the AI works against — backed by the mechanical proxies lint can prove. A green lint never means “well-factored”; the contract says what lint can’t.",
        proof:
          "agent-contract: one module, one reason to change · maxLines caps the size",
      },
      {
        kicker: "File size",
        pain: "Every AI edit grows the file. Three months in, one module is 6,000 lines — and every future agent has to load all of it to touch one function.",
        tag: "blueprint caps file size before it starts costing you tokens",
        mechanism:
          "A bloated file isn’t just unreadable — it’s the tax every future agent pays in context. maxLines keeps modules small enough that an agent loads what it needs, not the whole history.",
        proof: "✗ maxLines: order.service.ts 6,000 / 300 — split it",
      },
      {
        kicker: "Readability",
        pain: "The feature passes. But the AI optimized for done, not for the next reader — and the next reader is another agent that now can’t navigate it.",
        tag: "blueprint briefs every session on the same readability bar",
        mechanism:
          "The handbook and agent contract state the bar — naming, module shape, ownership — so every session writes to one standard instead of its own taste.",
        proof:
          "docs/architecture-handbook.md + CLAUDE.md ← one source, every agent",
      },
      {
        kicker: "Consistency",
        pain: "Every session, the AI re-derives your architecture from scratch — and each one guesses differently.",
        tag: "blueprint gives every session the same written contract",
        mechanism:
          "survey emits deterministic facts; the agent contract fixes the rules once. The AI stops guessing your architecture and starts working against a written one.",
        proof: "$ blueprint survey → facts, not a blind grep",
      },
      {
        kicker: "Adoption",
        pain: "Point this at a 3-year repo and you’d expect 4,000 errors — so the team disables it on day one.",
        tag: "blueprint locks today’s debt, gates only what’s new",
        mechanism:
          "Existing violations go into a baseline; your gate blocks only new debt. The AI is held to the standard on new code without drowning you in the old.",
        proof: ".blueprint-baseline.json → new debt fails, existing doesn’t",
      },
    ],
  },
  "zh-TW": {
    lead: "放手讓 AI 寫程式，你會悄悄付出哪些代價？Blueprint 又如何逐一解決。",
    flip: "看解法 →",
    back: "← 返回",
    cards: [
      {
        kicker: "程式分層",
        pain: "AI 交出一個能正常運作的功能，卻把新檔案隨手放在方便的位置。幾個 session 之後，每個檔案都偏離了它原本該待的地方。",
        tag: "blueprint 定義每一層程式的歸屬，跨越邊界就交給 lint 擋下",
        mechanism:
          "你的分層與模組結構會編譯成 import 邊界規則。AI 一開始就能從 agent contract 讀到這些規則，而 lint 則負責阻止它跨越邊界。新程式不是落在正確的位置，就是讓 build 直接失敗。",
        proof: "✗ services/ may not import from pages/",
      },
      {
        kicker: "單一職責",
        pain: "「先能動就好。」於是 AI 不斷把更多職責塞進同一個檔案，最後一個模組做了五件事，卻沒有一件真正屬於它。",
        tag: "blueprint 把單一職責寫進契約，並由 lint 守住最基本的機械底線",
        mechanism:
          "單一職責本質上是判斷題，因此它存在於 AI 遵循的 agent contract；而 lint 則負責那些可以被機械驗證的代理規則。lint 全綠，從來不代表設計就足夠乾淨；契約負責補上 lint 無法判斷的部分。",
        proof:
          "agent-contract: one module, one reason to change · maxLines 限制模組大小",
      },
      {
        kicker: "檔案大小",
        pain: "每一次 AI 修改，都讓檔案再膨脹一點。三個月後，一個模組已經長到 6,000 行，而之後每個 agent 只是想改一個 function，都得先載入整個檔案。",
        tag: "blueprint 在檔案開始消耗大量 token 前，先替它設下上限",
        mechanism:
          "肥大的檔案不只是難以閱讀，更是每個後續 agent 都必須付出的 context 成本。maxLines 讓模組維持在合理大小，讓 agent 只需要載入真正相關的內容，而不是整段歷史。",
        proof: "✗ maxLines: order.service.ts 6,000 / 300 — split it",
      },
      {
        kicker: "可讀性",
        pain: "功能通過了。但 AI 最佳化的是「完成」，不是「讓下一個人容易理解」。而下一個閱讀的人，很可能就是另一個 AI agent。",
        tag: "blueprint 讓每個 session 都依循同一套可讀性標準",
        mechanism:
          "handbook 與 agent contract 明確定義共同標準，包括命名、模組結構與責任歸屬，讓每個 session 都朝著同一個方向撰寫程式，而不是各自憑感覺。",
        proof:
          "docs/architecture-handbook.md + CLAUDE.md ← one source, every agent",
      },
      {
        kicker: "一致性",
        pain: "每一次 session，AI 都重新推導一次你的架構，而且每次推導出的結果都不太一樣。",
        tag: "blueprint 給每個 session 同一份寫下來的架構契約",
        mechanism:
          "survey 提供確定性的事實；agent contract 則一次把規則固定下來。AI 不再重新猜測你的架構，而是直接依照一份明確寫好的架構工作。",
        proof: "$ blueprint survey → facts, not a blind grep",
      },
      {
        kicker: "導入",
        pain: "把它套到一個三年的舊專案，你大概會看到四千個錯誤。於是團隊第一天就把它關掉。",
        tag: "blueprint 鎖住今天的技術債，只阻擋新增的問題",
        mechanism:
          "既有違規會寫入 baseline；你的 gate 只攔截新的技術債。AI 從今天開始遵守標準，但不會因為歷史包袱而寸步難行。",
        proof: ".blueprint-baseline.json → new debt fails, existing doesn’t",
      },
    ],
  },
};

const { lang } = useData();
const t = computed(() =>
  lang.value.startsWith("zh") ? COPY["zh-TW"] : COPY.en,
);
const flipped = ref(t.value.cards.map(() => false));

function toggle(i) {
  flipped.value[i] = !flipped.value[i];
}
</script>

<template>
  <section class="problem-cards">
    <p class="pc-lead">{{ t.lead }}</p>
    <div class="pc-grid">
      <div
        v-for="(c, i) in t.cards"
        :key="i"
        class="pc-card"
        :class="{ 'is-flipped': flipped[i] }"
        role="button"
        tabindex="0"
        :aria-pressed="flipped[i]"
        @click="toggle(i)"
        @keydown.enter.prevent="toggle(i)"
        @keydown.space.prevent="toggle(i)"
      >
        <div class="pc-inner">
          <div class="pc-face pc-front" :aria-hidden="flipped[i]">
            <span class="pc-kicker">{{ c.kicker }}</span>
            <p class="pc-pain">{{ c.pain }}</p>
            <p class="pc-tag">→ {{ c.tag }}</p>
            <span class="pc-hint">{{ t.flip }}</span>
          </div>
          <div class="pc-face pc-back" :aria-hidden="!flipped[i]">
            <span class="pc-kicker">{{ c.kicker }}</span>
            <p class="pc-mech">{{ c.mechanism }}</p>
            <code class="pc-proof">{{ c.proof }}</code>
            <span class="pc-hint">{{ t.back }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.problem-cards {
  margin: 3rem 0;
}

.pc-lead {
  max-width: 54ch;
  margin: 0 auto 2.5rem;
  text-align: center;
  font-size: 1.05rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.pc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 1.25rem;
  max-width: 1152px;
  margin: 0 auto;
}

.pc-card {
  perspective: 1200px;
  cursor: pointer;
  outline: none;
}

.pc-inner {
  display: grid;
  height: 100%;
  min-height: 260px;
  transition: transform 0.55s cubic-bezier(0.4, 0.2, 0.2, 1);
  transform-style: preserve-3d;
}

.pc-card.is-flipped .pc-inner {
  transform: rotateY(180deg);
}

.pc-face {
  grid-area: 1 / 1;
  display: flex;
  flex-direction: column;
  padding: 1.6rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* Front = the problem, in a red scheme; back = blueprint's answer, in the
   brand's yellow. The rest-state border carries the scheme so the grid reads
   red at rest and a flipped card turns yellow. */
.pc-front {
  border-color: var(--vp-c-red-3);
}

.pc-back {
  transform: rotateY(180deg);
  border-color: var(--vp-c-brand-3);
}

.pc-card:hover .pc-front,
.pc-card:focus-visible .pc-front {
  border-color: var(--vp-c-red-1);
}

.pc-card:focus-visible .pc-front {
  box-shadow: 0 0 0 1px var(--vp-c-red-1);
}

.pc-card:hover .pc-back,
.pc-card:focus-visible .pc-back {
  border-color: var(--vp-c-brand-1);
}

.pc-card:focus-visible .pc-back {
  box-shadow: 0 0 0 1px var(--vp-c-brand-1);
}

/* Accent colours follow the same split: red on the problem face, brand on the
   answer face — overriding the shared base colour below. */
.pc-front .pc-kicker,
.pc-front .pc-hint {
  color: var(--vp-c-red-1);
}

.pc-back .pc-kicker,
.pc-back .pc-hint {
  color: var(--vp-c-brand-1);
}

.pc-kicker {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  margin-bottom: 0.85rem;
}

.pc-pain {
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1.5;
  color: var(--vp-c-text-1);
  margin: 0 0 1rem;
}

.pc-tag {
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--vp-c-text-2);
  margin: 0;
}

.pc-mech {
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--vp-c-text-1);
  margin: 0 0 1rem;
}

.pc-proof {
  font-family: var(--vp-font-family-mono);
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  padding: 0.55rem 0.7rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.pc-hint {
  margin-top: auto;
  padding-top: 1.1rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}

@media (prefers-reduced-motion: reduce) {
  .pc-inner {
    transition: none;
  }
}
</style>
