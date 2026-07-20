<script setup lang="ts">
import { useTheme } from '~app/composables/useTheme';

defineProps<{ story: { id: number; title: string } }>();
const { theme } = useTheme();
</script>

<template>
  <article :data-theme="theme">{{ story.title }}</article>
</template>
