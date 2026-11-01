<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { povOptions } from '../codex/entryRefs'
import { useCodexStore } from '../codex/store'

const props = defineProps<{ modelValue: string | undefined; disabled: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [id: string | null] }>()
const { t } = useI18n()
const codex = useCodexStore()

const typeName = (typeId: string) => codex.types.find((x) => x.id === typeId)?.name ?? ''
const all = computed(() =>
  povOptions(codex.entries, codex.types).map((e) => ({
    id: e.id,
    label: e.name || t('codex.untitled'),
    type: typeName(e.typeId),
  })),
)
const query = ref('')
const options = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? all.value.filter((o) => o.label.toLowerCase().includes(q)) : all.value
})
const missing = computed(() => !!props.modelValue && !codex.entries.some((e) => e.id === props.modelValue))

function filter(val: string, update: (fn: () => void) => void): void {
  update(() => {
    query.value = val
  })
}
</script>

<template>
  <div v-if="missing" class="missing">
    <span class="chip" role="status">{{ t('sceneProps.povMissing') }}</span>
    <button type="button" class="clear" :disabled="disabled" @click="emit('update:modelValue', null)">
      {{ t('sceneProps.povClear') }}
    </button>
  </div>
  <QSelect
    v-else
    :model-value="modelValue ?? null"
    :options="options"
    :aria-label="t('sceneProps.pov')"
    :label="modelValue ? undefined : t('sceneProps.povNone')"
    option-value="id"
    option-label="label"
    outlined
    dense
    clearable
    use-input
    hide-selected
    fill-input
    input-debounce="0"
    emit-value
    map-options
    options-dense
    :disable="disabled"
    @filter="filter"
    @update:model-value="emit('update:modelValue', $event ?? null)"
  >
    <template #option="{ opt, itemProps }">
      <QItem v-bind="itemProps">
        <QItemSection>
          <QItemLabel>{{ opt.label }}</QItemLabel>
          <QItemLabel v-if="opt.type" caption>{{ opt.type }}</QItemLabel>
        </QItemSection>
      </QItem>
    </template>
    <template #no-option>
      <QItem>
        <QItemSection class="text-grey">{{ t('sceneProps.povNoMatch') }}</QItemSection>
      </QItem>
    </template>
  </QSelect>
</template>

<style scoped>
.missing {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.chip {
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  background: var(--tag-problem);
  color: var(--tag-problem-on);
  font-size: 0.75rem;
  font-weight: 700;
}
.clear {
  padding: 0.125rem 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.clear:hover:not(:disabled) {
  background: var(--bg-selected);
}
.clear:disabled {
  opacity: 0.5;
  cursor: default;
}
.clear:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
