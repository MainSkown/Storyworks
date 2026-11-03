<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MiniRichText from '../MiniRichText.vue'
import { useOverviewStore } from '../../gamedoc/overviewStore'

const { t } = useI18n()
const store = useOverviewStore()

const readOnly = computed(() => !!store.readOnly)
const editable = computed(() => store.status === 'ok' && !readOnly.value)
const problem = computed(() => {
  if (store.status === 'invalid') return t('gamedoc.overviewTab.invalid')
  if (store.status === 'missing') return t('gamedoc.overviewTab.missing')
  if (store.status === 'none') return t('gamedoc.overviewTab.none')
  return ''
})
const detail = computed(() => {
  const e = store.error
  return e ? `${e.file}${e.field ? ` (${e.field})` : ''}: ${e.message}` : ''
})
</script>

<template>
  <section class="overview" :aria-label="t('gamedoc.overviewTab.title')">
    <h2 class="title">{{ t('gamedoc.overviewTab.title') }}</h2>
    <div v-if="problem" class="problem" role="alert">
      <p>{{ problem }}</p>
      <p v-if="detail" class="detail">{{ detail }}</p>
    </div>
    <template v-else-if="store.content">
      <p v-if="readOnly" class="muted" role="status">{{ t('gamedoc.overviewTab.readOnly') }}</p>
      <MiniRichText
        :model-value="store.content"
        item-key="game-overview"
        :label="t('gamedoc.overviewTab.title')"
        :disabled="!editable"
        class="editor"
        @update:model-value="store.setContent($event)"
      />
    </template>
  </section>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.25rem 0;
  color: var(--text-primary);
}
.title {
  margin: 0;
  font-size: 1.15rem;
  border-inline-start: 4px solid var(--section-gamedoc);
  padding-inline-start: 0.5rem;
}
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.problem {
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-strong);
  border-inline-start: 4px solid var(--section-checks);
  border-radius: 0.375rem;
  background: var(--bg-raised);
}
.problem p {
  margin: 0;
}
.detail {
  margin-top: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}
.editor :deep(.ProseMirror) {
  min-height: 24rem;
  max-height: none;
}
</style>
