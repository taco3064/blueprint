<script setup>
// Injected at build time from package.json (see vite.define in config.mts) —
// the badge always states the version these docs were built against. It
// renders as a second line under the site title (grid layout in custom.css).
const version = __BP_VERSION__;
</script>

<template>
  <span class="bp-version-badge">v{{ version }}</span>
</template>

<style scoped>
.bp-version-badge {
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.3px;
  color: var(--vp-c-text-3);
}
</style>
