<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useData } from 'vitepress';
import {
  DISCUSSIONS_URL,
  feedUrl,
  formatDate,
  loadEvidence,
  type EvidenceState,
} from './evidence-feed';

const copy = {
  en: {
    dateLocale: 'en-US',
    loading: 'Loading evidence articles from GitHub Discussions.',
    empty: 'No evidence articles are published yet.',
    unavailable: 'Live evidence is unavailable right now.',
    published: 'Published',
    all: 'All Blueprint Discussions on GitHub',
  },
  'zh-TW': {
    dateLocale: 'zh-TW',
    loading: '正在從 GitHub Discussions 載入實證文章。',
    empty: '目前還沒有發表任何實證文章。',
    unavailable: '即時實證暫時無法載入。',
    published: '發表於',
    all: '到 GitHub 看所有 Blueprint Discussions',
  },
} as const;

const { lang } = useData();
const text = computed(() => copy[lang.value.startsWith('zh') ? 'zh-TW' : 'en']);
const state = ref<EvidenceState>({ status: 'loading' });

onMounted(async () => {
  state.value = await loadEvidence(feedUrl(import.meta.env.VITE_EVIDENCE_FEED_URL));
});
</script>

<template>
  <section class="evidence-feed" :aria-busy="state.status === 'loading'">
    <ul v-if="state.status === 'ready'" class="evidence-grid">
      <li v-for="item in state.items" :key="item.number" class="evidence-card">
        <h3 class="evidence-title">
          <a class="no-icon" :href="item.url" target="_blank" rel="noreferrer">{{ item.title }}</a>
        </h3>
        <p v-for="(line, index) in item.preview" :key="index" class="evidence-line">{{ line }}</p>
        <p class="evidence-meta">
          {{ text.published }}
          <time :datetime="item.createdAt">{{ formatDate(item.createdAt, text.dateLocale) }}</time>
        </p>
      </li>
    </ul>

    <template v-else-if="state.status === 'loading'">
      <p class="evidence-sr-only" role="status">{{ text.loading }}</p>
      <ul class="evidence-grid" aria-hidden="true">
        <li v-for="slot in 2" :key="slot" class="evidence-card is-placeholder">
          <span class="evidence-bar is-title" />
          <span class="evidence-bar" />
          <span class="evidence-bar" />
          <span class="evidence-bar is-short" />
          <span class="evidence-bar is-meta" />
        </li>
      </ul>
    </template>

    <p v-else class="evidence-note" role="status">
      {{ state.status === 'empty' ? text.empty : text.unavailable }}
    </p>

    <p class="evidence-all">
      <a :href="DISCUSSIONS_URL" target="_blank" rel="noreferrer">{{ text.all }} →</a>
    </p>
  </section>
</template>

<style scoped>
.evidence-feed {
  margin: 1.5rem 0 2rem;
}

.evidence-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.evidence-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-height: 13rem;
  margin: 0;
  padding: 1.2rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
}

.evidence-card:not(.is-placeholder):hover {
  border-color: var(--vp-c-brand-2);
  transform: translateY(-2px);
}

.evidence-card:focus-within {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.evidence-title {
  margin: 0 0 0.35rem;
  padding: 0;
  border: 0;
  font-size: 1.05rem;
  line-height: 1.45;
}

.evidence-title a {
  color: var(--vp-c-text-1);
  font-weight: 600;
  text-decoration: none;
}

.evidence-title a:focus-visible {
  outline: none;
}

.evidence-title a::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 12px;
}

.evidence-line {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--vp-c-text-2);
  font-size: 0.88rem;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.evidence-meta {
  margin: auto 0 0;
  padding-top: 0.6rem;
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
}

.evidence-bar {
  display: block;
  height: 0.8rem;
  border-radius: 6px;
  background: var(--vp-c-default-soft);
  animation: evidence-pulse 1.6s ease-in-out infinite;
}

.evidence-bar.is-title {
  width: 75%;
  height: 1.1rem;
  margin-bottom: 0.5rem;
}

.evidence-bar.is-short {
  width: 55%;
}

.evidence-bar.is-meta {
  width: 30%;
  margin-top: auto;
}

.evidence-note {
  margin: 0;
  padding: 1rem 1.2rem;
  color: var(--vp-c-text-2);
  text-align: center;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg-alt);
}

.evidence-all {
  margin: 1rem 0 0;
  font-size: 0.9rem;
}

.evidence-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes evidence-pulse {
  50% {
    opacity: 0.45;
  }
}

@media (max-width: 640px) {
  .evidence-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .evidence-card,
  .evidence-bar {
    transition: none;
    animation: none;
  }
}
</style>
