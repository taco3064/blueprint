<script setup lang="ts">
import { StoryCard } from '~app/components/StoryCard';
import { provideTheme } from '~app/contexts/themeContext';
import { useStories } from '~app/composables/useStories';

defineProps<{ limit: number }>();
provideTheme();
const stories = useStories();
</script>

<template>
  <StoryCard v-for="story in stories" :key="story.id" :story="story" />
</template>
