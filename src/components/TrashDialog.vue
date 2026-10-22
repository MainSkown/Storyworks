<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../project/store'

const open = defineModel<boolean>({ required: true })
const { t, locale } = useI18n()
const store = useProjectStore()

const when = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="trash-title">
      <QCardSection>
        <h2 id="trash-title" class="title">{{ t('trash.title') }}</h2>
        <p v-if="store.trash.length === 0" class="empty">{{ t('trash.empty') }}</p>
        <ul v-else class="list">
          <li v-for="e in store.trash" :key="e.id" class="entry">
            <span class="name">{{ e.title }}</span>
            <span class="meta">{{ t(`trash.type.${e.type}`) }} · {{ when(e.deletedAt) }}</span>
            <QBtn
              flat
              no-caps
              :label="t('trash.restore')"
              :aria-label="t('trash.restoreItem', { title: e.title })"
              :disable="!!store.readOnly"
              @click="store.restoreItem(e.id)"
            />
          </li>
        </ul>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('trash.close')" @click="open = false" />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  min-width: min(32rem, 90vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.title {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.empty,
.meta {
  color: var(--text-secondary);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.entry {
  display: grid;
  grid-template-columns: 1fr auto;
  column-gap: 0.75rem;
  align-items: center;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--border);
}
.name {
  font-weight: 600;
}
.meta {
  grid-column: 1;
  font-size: 0.85rem;
}
.entry :deep(.q-btn) {
  grid-column: 2;
  grid-row: 1 / span 2;
}
</style>
