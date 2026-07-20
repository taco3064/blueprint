<script setup lang="ts">
import viteLogo from '../assets/vite.svg'
import heroImg from '../assets/hero.png'
import vueLogo from '../assets/vue.svg'

defineProps<{ msg: string }>()
</script>

<template>
  <img :src="viteLogo" /><img :src="heroImg" /><img :src="vueLogo" />
  <h1>{{ msg }}</h1>
</template>
