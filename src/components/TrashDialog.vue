<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { useProjectStore } from '../project/store'
import type { TrashEntry } from '../project/types'

const open = defineModel<boolean>({ required: true })
const { t, te, locale } = useI18n()
const store = useProjectStore()

function timelineName(e: TrashEntry): string {
  const m = store.project?.manifest
  const id = e.parentId
  const title =
    m?.timelines.find((r) => r.id === id)?.title ?? m?.trash.find((x) => x.id === id)?.title
  return title || t('trash.unknownTimeline')
}
const label = (e: TrashEntry) =>
  e.type === 'node'
    ? t('trash.node', { title: e.title || t('timelines.untitled'), timeline: timelineName(e) })
    : e.type === 'rule'
      ? t('trash.rule', { title: e.title || t('rules.untitled') })
      : e.type === 'entry'
        ? t('trash.entry', { title: e.title || t('codex.untitled') })
        : e.title

async function restore(e: TrashEntry): Promise<void> {
  try {
    const r = await store.restoreItem(e.id)
    if (r && r.skippedEdges > 0)
      Notify.create({
        type: 'warning',
        message: t('trash.skippedEdges', r.skippedEdges),
        position: 'bottom',
        timeout: 6000,
      })
  } catch (err) {
    const code = (err as { code?: string }).code
    const prefix =
      e.type === 'rule'
        ? 'trash.restoreFailedRule'
        : e.type === 'entry'
          ? 'trash.restoreFailedEntry'
          : 'trash.restoreFailed'
    const key = `${prefix}.${code}`
    Notify.create({
      type: 'negative',
      message:
        code && te(key)
          ? t(key, { title: label(e) })
          : t('trash.restoreFailed.generic', { title: label(e) }),
      position: 'bottom',
      timeout: 6000,
    })
  }
}

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
            <span class="name">{{ label(e) }}</span>
            <span class="meta">
              {{ e.type === 'node' || e.type === 'rule' || e.type === 'entry' ? '' : `${t(`trash.type.${e.type}`)} · `
              }}{{ when(e.deletedAt) }}
            </span>
            <QBtn
              flat
              no-caps
              :label="t('trash.restore')"
              :aria-label="t('trash.restoreItem', { title: label(e) })"
              :disable="!!store.readOnly"
              @click="restore(e)"
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
