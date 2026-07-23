<script setup>
import { computed } from 'vue';
import { useData } from 'vitepress';

// The four facets of the philosophy, as cards. Copy lives here (both locales)
// so each index.md just mounts <PhilosophyFacets />. Titles are spans, not
// headings — they should not land in the page outline.
const COPY = {
  en: [
    { n: '01', title: 'Layer architecture', desc: 'Where code lives, what may import what.' },
    { n: '02', title: 'Component shape', desc: 'How a unit is sized and split.' },
    { n: '03', title: 'Core beliefs', desc: 'One source of truth, cost, dead code, and more.' },
    { n: '04', title: 'Working discipline', desc: 'Runtime load, dead code, refactor moves.' },
  ],
  'zh-TW': [
    { n: '01', title: '分層架構', desc: '程式放哪、誰可以 import 誰。' },
    { n: '02', title: '元件設計', desc: '一個單元怎麼切、多大。' },
    { n: '03', title: '核心信念', desc: '單一事實來源、成本、死碼⋯⋯' },
    { n: '04', title: '工作紀律', desc: '執行期負載、死碼、重構手法。' },
  ],
};

const { lang } = useData();
const facets = computed(() => (lang.value.startsWith('zh') ? COPY['zh-TW'] : COPY.en));
</script>

<template>
  <div class="facets">
    <div v-for="f in facets" :key="f.n" class="facet">
      <span class="facet-n">{{ f.n }}</span>
      <span class="facet-title">{{ f.title }}</span>
      <span class="facet-desc">{{ f.desc }}</span>
    </div>
  </div>
</template>

<style scoped>
.facets {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  max-width: 760px;
  margin: 1.5rem auto 0.5rem;
}

.facet {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1.2rem 1.3rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}

.facet-n {
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

.facet-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.facet-desc {
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

@media (max-width: 640px) {
  .facets {
    grid-template-columns: 1fr;
  }
}
</style>
