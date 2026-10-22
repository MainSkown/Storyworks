<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: number
  min: number
  max: number
  suffix: string
  disabled?: boolean
  labelledby: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const draft = ref(String(props.modelValue))
watch(
  () => props.modelValue,
  (v) => (draft.value = String(v)),
)

function onInput(v: string | number | null): void {
  draft.value = String(v ?? '')
  const n = Number(draft.value)
  if (draft.value !== '' && Number.isFinite(n) && n >= props.min && n <= props.max) {
    emit('update:modelValue', Math.round(n))
  }
}

// Out-of-range or empty text snaps back / clamps on blur.
function commit(): void {
  const n = Number(draft.value)
  if (draft.value === '' || !Number.isFinite(n)) {
    draft.value = String(props.modelValue)
    return
  }
  const clamped = Math.min(props.max, Math.max(props.min, Math.round(n)))
  draft.value = String(clamped)
  emit('update:modelValue', clamped)
}
</script>

<template>
  <QInput
    :model-value="draft"
    type="number"
    dense
    outlined
    :suffix="suffix"
    :min="min"
    :max="max"
    :disable="disabled"
    :aria-labelledby="labelledby"
    input-class="number"
    class="number-field"
    @update:model-value="onInput"
    @blur="commit"
    @keydown.enter="commit"
  />
</template>

<style scoped>
.number-field {
  width: 7.5rem;
}
:deep(.number) {
  text-align: right;
}
</style>
