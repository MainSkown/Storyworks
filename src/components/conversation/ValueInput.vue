<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { VariableType } from '../../project/schemas/variables'

const props = defineProps<{
  type: VariableType
  modelValue: unknown
  label: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean | number | string] }>()
const { t } = useI18n()

function onNumber(e: Event): void {
  const el = e.target as HTMLInputElement
  const n = Number(el.value)
  if (el.value.trim() === '' || !Number.isFinite(n))
    el.value = typeof props.modelValue === 'number' ? String(props.modelValue) : ''
  else emit('update:modelValue', n)
}
</script>

<template>
  <select
    v-if="type === 'flag'"
    class="control"
    :aria-label="label"
    :value="String(modelValue === true)"
    :disabled="disabled"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value === 'true')"
  >
    <option value="true">{{ t('game.conversation.flag.true') }}</option>
    <option value="false">{{ t('game.conversation.flag.false') }}</option>
  </select>
  <input
    v-else-if="type === 'number'"
    class="control num"
    type="number"
    step="any"
    :aria-label="label"
    :value="typeof modelValue === 'number' ? modelValue : ''"
    :disabled="disabled"
    @change="onNumber"
  />
  <input
    v-else
    class="control"
    type="text"
    :aria-label="label"
    :value="typeof modelValue === 'string' ? modelValue : ''"
    :disabled="disabled"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.control {
  min-width: 0;
  width: 7rem;
  box-sizing: border-box;
  padding: 0.25rem 0.375rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.num {
  width: 5rem;
}
.control:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
