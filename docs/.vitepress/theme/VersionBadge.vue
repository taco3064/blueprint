<script setup>
// Injected at build time from package.json (see vite.define in config.mts) —
// the badge always states the version these docs were built against.
const version = __BP_VERSION__;
</script>

<template>
  <span class="bp-version-badge">v{{ version }}</span>
</template>

<style scoped>
.bp-version-badge {
  margin-left: 8px;
  padding: 1px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  transform: translateY(-1px);
}
</style>
