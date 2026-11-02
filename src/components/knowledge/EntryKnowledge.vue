<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import type { Knows } from '../../knowledge/logic'
import { useKnowledgeStore } from '../../knowledge/store'
import { openItem } from '../../knowledge/ui'
import { entryKnowledgeAsOf, orderLearningRows } from '../../knowledge/view'
import type { Position } from '../../timeline/order'
import { useOrderContext } from '../../timeline/orderContext'
import PositionField from '../states/PositionField.vue'
import KnowsBadge from './KnowsBadge.vue'
import LearningDialog from './LearningDialog.vue'
import PositionLink from './PositionLink.vue'
import RevealedLink from './RevealedLink.vue'

const props = defineProps<{ entryId: string }>()
const { t } = useI18n()
const knowledge = useKnowledgeStore()
const ctx = useOrderContext()

const locked = computed(() => !!knowledge.readOnly)
const rows = computed(() => knowledge.learningsOfEntry(props.entryId))
const ordered = computed(() => orderLearningRows(rows.value, ctx.value))
const title = (r: { item: { title: string } }) => r.item.title || t('knowledge.untitled')

// ---- dialog ----
const dialogOpen = ref(false)
const edit = ref<{ itemId: string; learningId: string } | null>(null)
function openAdd(): void {
  edit.value = null
  dialogOpen.value = true
}
function openEdit(itemId: string, learningId: string): void {
  edit.value = { itemId, learningId }
  dialogOpen.value = true
}
function remove(itemId: string, learningId: string): void {
  if (!knowledge.removeLearning(itemId, learningId).ok)
    Notify.create({ type: 'negative', message: t('knowledge.failed'), position: 'bottom', timeout: 5000 })
}

// ---- as of ----
const asOf = ref<Position | null>(null)
const ORDER: Knows[] = ['known', 'forgotten', 'unknown', 'not-yet']
const asOfGroups = computed(() => {
  if (!asOf.value) return []
  const states = entryKnowledgeAsOf(
    rows.value.map((r) => ({
      item: { id: r.item.id, title: title(r) },
      learning: r.learning,
    })),
    asOf.value,
    ctx.value,
  )
  return ORDER.map((state) => ({ state, items: states.filter((s) => s.state === state) })).filter(
    (g) => g.items.length,
  )
})
</script>

<template>
  <div class="ek">
    <div class="actions">
      <QBtn
        unelevated
        no-caps
        icon="add"
        class="btn-section"
        :label="t('knowledge.entry.add')"
        :disable="locked"
        @click="openAdd"
      />
    </div>

    <h2 class="label section-title first">{{ t('knowledge.entry.heading') }}</h2>
    <p v-if="!ordered.length" class="muted">{{ t('knowledge.entry.none') }}</p>
    <ol v-else class="rows" :aria-label="t('knowledge.entry.heading')">
      <li v-for="o in ordered" :key="o.row.learning.id" class="row">
        <div class="body">
          <div class="main">
            <button
              type="button"
              class="link"
              :aria-label="t('knowledge.openItem', { title: title(o.row) })"
              @click="openItem(o.row.item.id)"
            >
              {{ title(o.row) }}
            </button>
            <span v-if="!o.determined" class="badge">
              <QIcon name="help_outline" size="0.875rem" aria-hidden="true" />{{ t('knowledge.entry.orderUnknown') }}
            </span>
          </div>
          <span class="meta">
            <span class="k">{{ t('knowledge.entry.learnedAt') }}</span>
            <PositionLink :position="o.row.learning.at" />
          </span>
          <span v-if="o.row.learning.forgottenAt" class="meta">
            <span class="k">{{ t('knowledge.entry.forgottenAt') }}</span>
            <PositionLink :position="o.row.learning.forgottenAt" />
          </span>
          <span v-if="o.row.learning.revealedIn" class="meta">
            <span class="k">{{ t('knowledge.entry.revealedIn') }}</span>
            <RevealedLink :passage="o.row.learning.revealedIn" />
          </span>
          <p v-if="o.row.learning.note" class="note">{{ o.row.learning.note }}</p>
        </div>
        <template v-if="!locked">
          <QBtn
            flat
            round
            dense
            icon="edit"
            :aria-label="t('knowledge.entry.edit', { title: title(o.row) })"
            @click="openEdit(o.row.item.id, o.row.learning.id)"
          />
          <QBtn
            flat
            round
            dense
            icon="delete_outline"
            :aria-label="t('knowledge.entry.remove', { title: title(o.row) })"
            @click="remove(o.row.item.id, o.row.learning.id)"
          />
        </template>
      </li>
    </ol>

    <h2 class="label section-title">{{ t('knowledge.asOf.heading') }}</h2>
    <PositionField v-model="asOf" :label="t('knowledge.asOf.label')" :hint="t('knowledge.entry.asOfHint')" />
    <template v-if="asOf">
      <p v-if="!asOfGroups.length" class="muted">{{ t('knowledge.entry.none') }}</p>
      <section v-for="g in asOfGroups" :key="g.state" class="group" :aria-labelledby="`ek-g-${g.state}`">
        <h3 :id="`ek-g-${g.state}`" class="group-head">{{ t(`knowledge.entry.group.${g.state}`) }}</h3>
        <ul class="plain">
          <li v-for="i in g.items" :key="i.itemId" class="as-row">
            <button type="button" class="link" @click="openItem(i.itemId)">{{ i.title }}</button>
            <KnowsBadge :state="i.state" />
          </li>
        </ul>
      </section>
    </template>

    <LearningDialog
      v-model="dialogOpen"
      :entry-id="entryId"
      :item-id="edit?.itemId"
      :learning-id="edit?.learningId"
    />
  </div>
</template>

<style scoped>
.ek {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.btn-section {
  background: var(--section-codex);
  color: var(--section-codex-on);
}
.label {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.section-title {
  margin-top: 1rem;
}
.section-title.first {
  margin-top: 0.5rem;
}
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.rows,
.plain {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
}
.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  overflow-wrap: anywhere;
}
.main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  font-size: 0.8125rem;
}
.k {
  color: var(--text-secondary);
}
.note {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  white-space: pre-wrap;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
  border: 1px dotted var(--section-timelines);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--section-codex);
  font: inherit;
  text-align: start;
  text-decoration: underline;
  cursor: pointer;
}
.link:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.group {
  margin-top: 0.25rem;
}
.group-head {
  margin: 0 0 0.25rem;
  font-size: 0.9375rem;
}
.as-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
</style>
