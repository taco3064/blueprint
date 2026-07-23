<script setup>
import { ref, onMounted, computed } from "vue";
import { useData } from "vitepress";

// One source at the hub, every artifact radiating around it. Copy lives here
// (both locales) so each index.md just mounts <CompileFlow />. There is no CI
// output node — blueprint scaffolds no CI; the verification strategy (a git
// hook, CI, whatever) is the adopter's, and Verify is the read-only runtimes.
const COPY = {
  en: {
    source: "blueprint.config.mjs",
    outputs: [
      {
        file: "eslint.config.mjs",
        label: "Enforce",
        desc: "structural rules + embedded plugin",
      },
      {
        file: "docs/architecture-handbook.md",
        label: "Explain",
        desc: "the handbook humans read",
      },
      {
        file: "CLAUDE.md · AGENTS.md · …",
        label: "Collaborate",
        desc: "ground rules for AI agents",
      },
      {
        file: "inspect · deps · rules",
        label: "Verify",
        desc: "read-only runtimes on the same source",
      },
    ],
  },
  "zh-TW": {
    source: "blueprint.config.mjs",
    outputs: [
      {
        file: "eslint.config.mjs",
        label: "強制",
        desc: "結構規則＋內嵌 plugin",
      },
      {
        file: "docs/architecture-handbook.md",
        label: "說明",
        desc: "給人讀的架構手冊",
      },
      {
        file: "CLAUDE.md · AGENTS.md · …",
        label: "協作",
        desc: "AI Agent 的守則",
      },
      {
        file: "inspect · deps · rules",
        label: "驗證",
        desc: "讀同一份 config 的唯讀指令",
      },
    ],
  },
};

// Four fixed compass slots around the hub, in reading order (top, right,
// bottom, left). The radial layout is inherently four-up.
const SLOTS = ["cf-n", "cf-e", "cf-s", "cf-w"];

const { lang } = useData();
const t = computed(() =>
  lang.value.startsWith("zh") ? COPY["zh-TW"] : COPY.en,
);

// Only the hub shows until the section scrolls into view; then the four
// artifacts slide out from behind it. `armed` hides them (added on mount so
// no-JS / SSR still shows everything); `revealed` plays the entrance once.
const root = ref(null);
const armed = ref(false);
const revealed = ref(false);

onMounted(() => {
  const el = root.value;
  if (!el || typeof window === "undefined") return;
  const reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) return;

  armed.value = true;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          revealed.value = true;
          io.disconnect();
          break;
        }
      }
    },
    { threshold: 0.3 },
  );
  io.observe(el);
});
</script>

<template>
  <div
    ref="root"
    class="cf-radial"
    :class="{ 'cf-armed': armed, 'is-revealed': revealed }"
  >
    <!-- Spokes sit behind the nodes; the solid node/hub backgrounds mask where a
         line would otherwise cross into a box. Decorative, so aria-hidden. -->
    <svg
      class="cf-spokes"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line x1="50" y1="50" x2="50" y2="7" />
      <line x1="50" y1="50" x2="93" y2="50" />
      <line x1="50" y1="50" x2="50" y2="93" />
      <line x1="50" y1="50" x2="7" y2="50" />
    </svg>

    <div class="cf-hub">{{ t.source }}</div>

    <div v-for="(o, i) in t.outputs" :key="i" class="cf-node" :class="SLOTS[i]">
      <span class="cf-file">{{ o.file }}</span>
      <span class="cf-meta"
        ><strong>{{ o.label }}</strong> — {{ o.desc }}</span
      >
    </div>
  </div>
</template>

<style scoped>
.cf-radial {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1.15fr 1fr;
  align-items: center;
  justify-items: center;
  gap: 18px 22px;
  max-width: 900px;
  margin: 2.5rem auto 1rem;
}

.cf-spokes {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  transition: opacity 0.6s ease 0.2s;
}

.cf-spokes line {
  stroke: var(--vp-c-brand-2);
  stroke-width: 1.5;
  opacity: 0.55;
  vector-effect: non-scaling-stroke;
}

.cf-hub,
.cf-node {
  position: relative;
  min-width: 0;
  max-width: 280px;
}

.cf-hub {
  grid-column: 2;
  grid-row: 2;
  z-index: 2;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 8px;
  padding: 14px 18px;
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  color: var(--vp-c-brand-1);
  /* opaque base so the spokes never show through the hub, with the gold tint
     layered on top to keep it reading as the source */
  background-color: var(--vp-c-bg-soft);
  background-image: linear-gradient(
    var(--vp-c-brand-soft),
    var(--vp-c-brand-soft)
  );
  white-space: nowrap;
}

.cf-node {
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  text-align: center;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 10px 14px;
  background: var(--vp-c-bg-alt);
  transition:
    transform 0.6s cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 0.5s ease;
}

.cf-n {
  grid-column: 2;
  grid-row: 1;
}

.cf-e {
  grid-column: 3;
  grid-row: 2;
}

.cf-s {
  grid-column: 2;
  grid-row: 3;
}

.cf-w {
  grid-column: 1;
  grid-row: 2;
}

.cf-file {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  color: var(--vp-c-text-1);
  overflow-wrap: anywhere;
}

.cf-meta {
  font-size: 12px;
  color: var(--vp-c-text-2);
  overflow-wrap: anywhere;
}

.cf-meta strong {
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

/* Armed = JS ready: hide the artifacts pulled in toward the hub, and the
   spokes, until the section is revealed. */
.cf-armed .cf-node {
  opacity: 0;
}

.cf-armed .cf-spokes {
  opacity: 0;
}

.cf-armed .cf-n {
  transform: translateY(64px);
}

.cf-armed .cf-s {
  transform: translateY(-64px);
}

.cf-armed .cf-e {
  transform: translateX(-64px);
}

.cf-armed .cf-w {
  transform: translateX(64px);
}

/* Revealed: artifacts slide out to their slots (staggered) and spokes fade in. */
.cf-armed.is-revealed .cf-node {
  opacity: 1;
  transform: none;
}

.cf-armed.is-revealed .cf-spokes {
  opacity: 1;
}

.cf-armed.is-revealed .cf-n {
  transition-delay: 0.04s;
}

.cf-armed.is-revealed .cf-e {
  transition-delay: 0.11s;
}

.cf-armed.is-revealed .cf-s {
  transition-delay: 0.18s;
}

.cf-armed.is-revealed .cf-w {
  transition-delay: 0.25s;
}

/* Narrow screens: no room for a ring — stack it with the source in the middle,
   two artifacts sliding up, two sliding down. Spokes are dropped. */
@media (max-width: 860px) {
  .cf-radial {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .cf-spokes {
    display: none;
  }

  .cf-hub {
    order: 0;
    text-align: center;
  }

  .cf-n {
    order: -2;
  }

  .cf-e {
    order: -1;
  }

  .cf-s {
    order: 1;
  }

  .cf-w {
    order: 2;
  }

  .cf-hub,
  .cf-node {
    max-width: none;
    width: 100%;
  }

  .cf-armed .cf-n,
  .cf-armed .cf-e {
    transform: translateY(48px);
  }

  .cf-armed .cf-s,
  .cf-armed .cf-w {
    transform: translateY(-48px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cf-node,
  .cf-spokes {
    transition: none;
  }
}
</style>
