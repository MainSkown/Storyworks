<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Variable } from '../../project/schemas/variables'

const props = defineProps<{
  modelValue: string
  variables: readonly Variable[]
  label: string
  disabled?: boolean
}>()
defineEmits<{ 'update:modelValue': [id: string] }>()
const { t } = useI18n()
const deleted = computed(() => !props.variables.some((v) => v.id === props.modelValue))
</script>

<template>
  <select
    class="control"
    :aria-label="label"
    :value="modelValue"
    :disabled="disabled"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-if="deleted" :value="modelValue">{{ t('game.conversation.deletedVariable') }}</option>
    <option v-for="v in variables" :key="v.id" :value="v.id">{{ v.name }}</option>
  </select>
</template>

<style scoped>
.control {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0.25rem 0.375rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.control:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
