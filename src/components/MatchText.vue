<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string; start: number; end: number }>()
const parts = computed(() =>
  props.end > props.start
    ? [props.text.slice(0, props.start), props.text.slice(props.start, props.end), props.text.slice(props.end)]
    : [props.text, '', ''],
)
</script>

<template>
  <span>{{ parts[0] }}<mark v-if="parts[1]">{{ parts[1] }}</mark>{{ parts[2] }}</span>
</template>

<style scoped>
mark {
  padding: 0 0.1em;
  border-radius: 0.15rem;
  background: var(--bg-selected);
  color: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}
</style>
