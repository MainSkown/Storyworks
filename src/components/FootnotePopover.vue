<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ x: number; y: number; text: string; readonly?: boolean }>()
const emit = defineEmits<{ edit: [text: string]; close: []; remove: [] }>()
const { t } = useI18n()
const area = ref<HTMLTextAreaElement | null>(null)

onMounted(async () => {
  await nextTick()
  area.value?.focus()
  area.value?.select()
})

const oneLine = (s: string): string => s.replace(/\s*\n+\s*/g, ' ')
function onInput(e: Event): void {
  emit('edit', oneLine((e.target as HTMLTextAreaElement).value))
}
</script>

<template>
  <div
    class="popover"
    role="dialog"
    :aria-label="t('footnote.title')"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <label class="label" for="footnote-text">{{ t('footnote.text') }}</label>
    <textarea
      id="footnote-text"
      ref="area"
      class="field"
      rows="3"
      :value="text"
      :readonly="readonly"
      @input="onInput"
      @keydown.enter.exact.prevent="emit('close')"
    />
    <div class="row">
      <button v-if="!readonly" type="button" class="btn danger" @click="emit('remove')">
        {{ t('footnote.remove') }}
      </button>
      <button type="button" class="btn" @click="emit('close')">{{ t('footnote.done') }}</button>
    </div>
  </div>
</template>

<style scoped>
.popover {
  position: fixed;
  z-index: 20;
  box-sizing: border-box;
  width: 20rem;
  max-width: calc(100vw - 1rem);
  padding: 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.5rem;
  background: var(--bg-panel);
  color: var(--text-primary);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}
.label {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.field {
  box-sizing: border-box;
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
  resize: vertical;
}
.row {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.btn {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.btn:hover {
  background: var(--bg-selected);
}
.danger {
  margin-inline-end: auto;
}
.field:focus-visible,
.btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
