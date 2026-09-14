<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useData } from 'vitepress';

type Topology = 'layer-first' | 'module-first';

const copy = {
  en: {
    options: {
      'layer-first': {
        name: 'Layer-first',
        structure: 'Layer → Unit',
        description: 'Organize by technical responsibility first, then place product behavior inside those application-wide layers.',
      },
      'module-first': {
        name: 'Module-first',
        structure: 'Module → Layer → Unit',
        description: 'Organize by product or domain module first. Ordinary modules keep the shared inner layer discipline; reserved app remains router composition.',
      },
    },
    choose: 'Choose a topology to reveal its Agent prompt.',
    promptLabel: 'Paste this prompt into your coding Agent',
    copy: 'Copy prompt',
    copied: 'Copied',
  },
  'zh-TW': {
    options: {
      'layer-first': {
        name: 'Layer-first',
        structure: 'Layer → Unit',
        description: '先按技術職責分層，再把產品功能放進全專案共用的各層。',
      },
      'module-first': {
        name: 'Module-first',
        structure: 'Module → Layer → Unit',
        description: '先按產品／領域模組切分。每個一般模組內維持共同技術分層；保留的 app 只負責路由組裝，不是一般領域模組。',
      },
    },
    choose: '請先選擇拓樸，才會顯示對應的 Agent prompt。',
    promptLabel: '把這段 prompt 貼給你的程式撰寫 Agent',
    copy: '複製 prompt',
    copied: '已複製',
  },
} as const;

const prompts = {
  en: {
    'layer-first': `Adopt @kekkai/blueprint in this repository using the layer-first topology.
The topology has already been selected; do not re-infer or change it from the current source shape.
Start by running \`npx @kekkai/blueprint init --topology layer-first\`.
Follow Blueprint's generated instructions and runtime evidence from there.
Do not bypass failed, incomplete, or unverified checks, and do not claim completion until Blueprint's verification reports the adoption complete.`,
    'module-first': `Adopt @kekkai/blueprint in this repository using the module-first topology.
The topology has already been selected; do not re-infer or change it from the current source shape.
Start by running \`npx @kekkai/blueprint init --topology module-first\`.
Follow Blueprint's generated instructions and runtime evidence from there.
Do not bypass failed, incomplete, or unverified checks, and do not claim completion until Blueprint's verification reports the adoption complete.`,
  },
  'zh-TW': {
    'layer-first': `請在這個專案以 layer-first 拓樸導入 @kekkai/blueprint。
拓樸已由使用者明確選定；不要根據目前的原始碼結構重新推斷或改成其他拓樸。
先執行 \`npx @kekkai/blueprint init --topology layer-first\`。
後續以 Blueprint 產生的指示與執行階段證據為依據。
不得略過標示為 failed、incomplete 或 unverified 的檢查，也不能在 Blueprint 驗證導入完成前宣稱完成。`,
    'module-first': `請在這個專案以 module-first 拓樸導入 @kekkai/blueprint。
拓樸已由使用者明確選定；不要根據目前的原始碼結構重新推斷或改成其他拓樸。
先執行 \`npx @kekkai/blueprint init --topology module-first\`。
後續以 Blueprint 產生的指示與執行階段證據為依據。
不得略過標示為 failed、incomplete 或 unverified 的檢查，也不能在 Blueprint 驗證導入完成前宣稱完成。`,
  },
} as const;

const { lang } = useData();
const locale = computed(() => (lang.value.startsWith('zh') ? 'zh-TW' : 'en'));
const text = computed(() => copy[locale.value]);
const selected = ref<Topology | null>(null);
const prompt = computed(() => selected.value ? prompts[locale.value][selected.value] : '');
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;

function select(topology: Topology) {
  selected.value = topology;
  copied.value = false;
}

async function copyPrompt() {
  if (!prompt.value || typeof navigator === 'undefined' || !navigator.clipboard) return;
  try {
    await navigator.clipboard.writeText(prompt.value);
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = false;
    }, 1800);
  }
  catch {
    copied.value = false;
  }
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <section class="adopt-ai">
    <div class="adopt-ai-options" role="group" :aria-label="text.choose">
      <button
        v-for="(option, topology) in text.options"
        :key="topology"
        type="button"
        class="adopt-ai-option"
        :class="{ 'is-selected': selected === topology }"
        :aria-pressed="selected === topology"
        @click="select(topology)"
      >
        <span class="adopt-ai-option-header">
          <strong>{{ option.name }}</strong>
          <code>{{ option.structure }}</code>
        </span>
        <span>{{ option.description }}</span>
      </button>
    </div>

    <p v-if="!selected" class="adopt-ai-empty">{{ text.choose }}</p>
    <div v-else class="adopt-ai-prompt" aria-live="polite">
      <span class="adopt-ai-prompt-label">{{ text.promptLabel }}</span>
      <pre><code>{{ prompt }}</code></pre>
      <button type="button" class="adopt-ai-copy" @click="copyPrompt">
        {{ copied ? text.copied : text.copy }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.adopt-ai {
  margin: 1.5rem 0 2rem;
}

.adopt-ai-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.adopt-ai-option {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  min-height: 150px;
  padding: 1.2rem;
  color: var(--vp-c-text-2);
  text-align: left;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;
}

.adopt-ai-option:hover {
  border-color: var(--vp-c-brand-2);
  transform: translateY(-2px);
}

.adopt-ai-option:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.adopt-ai-option.is-selected {
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.adopt-ai-option-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.adopt-ai-option-header strong {
  color: var(--vp-c-text-1);
  font-size: 1.05rem;
}

.adopt-ai-option-header code {
  white-space: nowrap;
  color: var(--vp-c-brand-1);
}

.adopt-ai-empty,
.adopt-ai-prompt {
  margin-top: 1rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg-alt);
}

.adopt-ai-empty {
  padding: 1rem 1.2rem;
  color: var(--vp-c-text-3);
  text-align: center;
}

.adopt-ai-prompt {
  padding: 1.2rem;
}

.adopt-ai-prompt-label {
  display: block;
  margin-bottom: 0.65rem;
  color: var(--vp-c-text-2);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.adopt-ai-prompt pre {
  margin: 0 0 0.9rem;
  padding: 1rem;
  white-space: pre-wrap;
  border-radius: 8px;
  background: var(--vp-code-block-bg);
}

.adopt-ai-prompt code {
  color: var(--vp-c-text-1);
  font-size: 0.82rem;
  line-height: 1.65;
}

.adopt-ai-copy {
  padding: 0.55rem 0.9rem;
  color: var(--vp-button-brand-text);
  font-weight: 600;
  border: 1px solid var(--vp-button-brand-bg);
  border-radius: 8px;
  background: var(--vp-button-brand-bg);
  cursor: pointer;
}

.adopt-ai-copy:hover {
  color: var(--vp-button-brand-hover-text);
  border-color: var(--vp-button-brand-hover-bg);
  background: var(--vp-button-brand-hover-bg);
}

.adopt-ai-copy:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

@media (max-width: 640px) {
  .adopt-ai-options {
    grid-template-columns: 1fr;
  }

  .adopt-ai-option {
    min-height: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .adopt-ai-option {
    transition: none;
  }
}
</style>
