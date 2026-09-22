<script setup>
import { computed } from 'vue';
import { useData } from 'vitepress';
import { versionIdentity } from './version-identity';

const { lang } = useData();
const identity = computed(() => versionIdentity(
  __BP_VERSION__, lang.value, import.meta.env.VITE_BP_DOCS_TAG,
));
</script>

<template>
  <span class="bp-version-badge" :title="identity.title">{{ identity.label }}</span>
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
