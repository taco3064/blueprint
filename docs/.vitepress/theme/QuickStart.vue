<script setup>
import { ref, computed } from 'vue';
import { useData } from 'vitepress';

// Two adoption modes, one shown at a time with an animated toggle between them.
// Default is the hands-off prompt; the guided (--agent) mode is opt-in.
const COPY = {
  en: {
    auto: {
      key: 'auto',
      kicker: 'Hands-off',
      desc: 'Hand your agent a prompt — it runs start to finish on its own.',
      where: 'paste to your agent',
      cmd: 'Run npx @kekkai/blueprint init --authoring to adopt @kekkai/blueprint in this repo.',
      toggle: 'Rather judge each step yourself, with the agent assisting?',
    },
    guided: {
      key: 'guided',
      kicker: 'You judge, the agent assists',
      desc: 'blueprint writes the playbook, then launches your agent to walk it with you.',
      where: 'run in your terminal',
      cmd: 'npx @kekkai/blueprint init --agent claude',
      toggle: 'Rather hand it off in one line?',
    },
    copy: 'Copy',
    copied: 'Copied',
  },
  'zh-TW': {
    auto: {
      key: 'auto',
      kicker: '全自動',
      desc: '丟一段 prompt 給你的 agent —— 它自己從頭跑到尾。',
      where: '貼給你的 agent',
      cmd: '請執行 npx @kekkai/blueprint init --authoring 協助導入 @kekkai/blueprint',
      toggle: '想由 AI 輔助、逐項自行判斷？',
    },
    guided: {
      key: 'guided',
      kicker: '你判斷、AI 輔助',
      desc: 'blueprint 先寫出 playbook，再啟動你的 agent 帶著你一步步走。',
      where: '在終端機執行',
      cmd: 'npx @kekkai/blueprint init --agent claude',
      toggle: '想一句話全自動搞定？',
    },
    copy: '複製',
    copied: '已複製',
  },
};

const { lang } = useData();
const t = computed(() => (lang.value.startsWith('zh') ? COPY['zh-TW'] : COPY.en));

const mode = ref('auto');
const active = computed(() => t.value[mode.value]);
function toggle() {
  mode.value = mode.value === 'auto' ? 'guided' : 'auto';
}

const copied = ref(false);
let copyTimer = null;
function copyCmd() {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return;
  navigator.clipboard
    .writeText(active.value.cmd)
    .then(() => {
      copied.value = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copied.value = false;
      }, 1800);
    })
    .catch(() => {});
}
</script>

<template>
  <div class="qs">
    <Transition name="qs-swap" mode="out-in">
      <div class="qs-card" :key="active.key">
        <span class="qs-kicker">{{ active.kicker }}</span>
        <p class="qs-desc">{{ active.desc }}</p>
        <div class="qs-cmd">
          <span class="qs-where">{{ active.where }}</span>
          <div class="qs-cmd-row">
            <span class="qs-cmdtext">{{ active.cmd }}</span>
            <button class="qs-copy" type="button" @click="copyCmd">
              {{ copied ? t.copied : t.copy }}
            </button>
          </div>
        </div>
        <button class="qs-toggle" type="button" @click="toggle">
          {{ active.toggle }} →
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.qs {
  max-width: 660px;
  margin: 1.5rem auto 0.5rem;
}

.qs-card {
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  padding: 1.6rem;
  background: var(--vp-c-bg-soft);
}

.qs-kicker {
  display: inline-block;
  margin-bottom: 0.6rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
}

.qs-desc {
  margin: 0 0 1.1rem;
  font-size: 0.98rem;
  line-height: 1.55;
  color: var(--vp-c-text-1);
}

.qs-cmd {
  margin-bottom: 1.2rem;
}

.qs-where {
  display: block;
  margin-bottom: 0.4rem;
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.qs-cmd-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--vp-c-bg-alt);
}

.qs-cmdtext {
  flex: 1;
  min-width: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--vp-c-text-1);
  overflow-wrap: anywhere;
}

.qs-copy {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  background: var(--vp-c-bg);
  cursor: pointer;
}

.qs-copy:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.qs-toggle {
  padding: 0;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  background: none;
  border: none;
  cursor: pointer;
}

.qs-toggle:hover {
  text-decoration: underline;
}

.qs-swap-enter-active,
.qs-swap-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}

.qs-swap-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.qs-swap-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (prefers-reduced-motion: reduce) {
  .qs-swap-enter-active,
  .qs-swap-leave-active {
    transition: none;
  }
}
</style>
