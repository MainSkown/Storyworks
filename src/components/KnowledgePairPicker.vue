<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '../calendar'
import { groupPickerEntries } from '../codex/pick'
import { useCodexStore } from '../codex/store'
import { describePosition } from './states/position'
import { filterItems, learnerPositions } from '../knowledge/pairPick'
import { useKnowledgeStore } from '../knowledge/store'
import type { Position } from '../timeline/order'
import { useTimelinesStore } from '../timeline/store'

const emit = defineEmits<{ pick: [itemId: string, entryId: string] }>()

const { t } = useI18n()
const know = useKnowledgeStore()
const codex = useCodexStore()
const timelines = useTimelinesStore()

/** Step 1 picks the item, step 2 the character. */
const itemId = ref<string | null>(null)
const query = ref('')
const active = ref(0)
const searchEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

const item = computed(() => know.items.find((i) => i.id === itemId.value) ?? null)
const itemRows = computed(() => filterItems(know.items, query.value))
const entryGroups = computed(() => groupPickerEntries(codex.entries, codex.types, query.value))
const entryRows = computed(() => entryGroups.value.flatMap((g) => g.rows))
const learners = computed(() => (item.value ? learnerPositions(item.value) : new Map<string, Position[]>()))
const rowCount = computed(() => (item.value ? entryRows.value.length : itemRows.value.length))
const hasAny = computed(() => (item.value ? codex.entries.length > 0 : know.items.length > 0))

const rowId = (i: number) => `kn-picker-row-${i}`
const learnerCount = (id: string) => new Set(know.items.find((i) => i.id === id)?.learnings.map((l) => l.entryId)).size

function positionText(p: Position): string {
  const v = describePosition(p, timelines.loadedTimelines, (d) => formatDate(timelines.calendar, d))
  if (v.kind === 'date') return v.date
  if (v.kind === 'missing-event') return t('states.position.missingEvent')
  return [v.title || t('states.position.untitledEvent'), v.date].filter(Boolean).join(' · ')
}
const hint = (entryId: string): string => {
  const at = learners.value.get(entryId)?.[0]
  return at ? t('knowledgeUse.learnsAt', { at: positionText(at) }) : ''
}

const focusSearch = () => nextTick(() => searchEl.value?.focus())
onMounted(focusSearch)
watch([query, itemId], () => (active.value = 0))

function move(delta: number): void {
  if (rowCount.value === 0) return
  active.value = (active.value + delta + rowCount.value) % rowCount.value
  listEl.value?.querySelector(`#${rowId(active.value)}`)?.scrollIntoView({ block: 'nearest' })
}

function back(): void {
  itemId.value = null
  query.value = ''
  void focusSearch()
}

function choose(i: number): void {
  if (!item.value) {
    const r = itemRows.value[i]
    if (!r) return
    itemId.value = r.id
    query.value = ''
    void focusSearch()
  } else {
    const r = entryRows.value[i]
    if (r) emit('pick', item.value.id, r.entryId)
  }
}

function onBackspace(e: KeyboardEvent): void {
  if (item.value && query.value === '') {
    e.preventDefault()
    back()
  }
}

// Offsets of the groups' rows in the flat list.
const offsets = computed(() => {
  let n = 0
  return entryGroups.value.map((g) => {
    const start = n
    n += g.rows.length
    return start
  })
})
</script>

<template>
  <div>
    <p v-if="!hasAny" class="empty">
      {{ t(item ? 'knowledgeUse.emptyEntries' : 'knowledgeUse.emptyItems') }}
    </p>
    <template v-else>
      <div v-if="item" class="step">
        <QBtn flat dense no-caps icon="arrow_back" :label="t('knowledgeUse.back')" @click="back" />
        <span class="step-title">{{ t('knowledgeUse.pickEntry', { item: item.title || t('knowledgeMatrix.untitledItem') }) }}</span>
      </div>
      <input
        ref="searchEl"
        v-model="query"
        class="search"
        type="search"
        role="combobox"
        aria-expanded="true"
        aria-controls="kn-picker-list"
        :aria-activedescendant="rowCount ? rowId(active) : undefined"
        :aria-label="t(item ? 'knowledgeUse.searchEntries' : 'knowledgeUse.searchItems')"
        :placeholder="t(item ? 'knowledgeUse.searchEntries' : 'knowledgeUse.searchItems')"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="choose(active)"
        @keydown.backspace="onBackspace"
      />
      <p v-if="rowCount === 0" class="empty" role="status">
        {{ t(item ? 'knowledgeUse.noMatchEntries' : 'knowledgeUse.noMatchItems') }}
      </p>
      <div v-else-if="!item" id="kn-picker-list" ref="listEl" class="list" role="listbox">
        <div
          v-for="(r, i) in itemRows"
          :id="rowId(i)"
          :key="r.id"
          class="row"
          :class="{ active: i === active }"
          role="option"
          :aria-selected="i === active"
          @click="choose(i)"
          @mousemove="active = i"
        >
          <span class="name">{{ r.title || t('knowledgeMatrix.untitledItem') }}</span>
          <span class="chip">{{ t('knowledgeUse.learners', { n: learnerCount(r.id) }, learnerCount(r.id)) }}</span>
        </div>
      </div>
      <div v-else id="kn-picker-list" ref="listEl" class="list" role="listbox">
        <div
          v-for="(g, gi) in entryGroups"
          :key="g.typeId ?? ''"
          role="group"
          :aria-label="g.typeName ?? t('codex.noType')"
        >
          <div class="group-name">{{ g.typeName ?? t('codex.noType') }}</div>
          <div
            v-for="(r, ri) in g.rows"
            :id="rowId(offsets[gi]! + ri)"
            :key="r.entryId"
            class="row"
            :class="{ active: offsets[gi]! + ri === active }"
            role="option"
            :aria-selected="offsets[gi]! + ri === active"
            @click="choose(offsets[gi]! + ri)"
            @mousemove="active = offsets[gi]! + ri"
          >
            <span class="name">{{ r.name || t('codex.untitled') }}</span>
            <span v-if="hint(r.entryId)" class="date">{{ hint(r.entryId) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.step {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.step-title {
  font-weight: 600;
}
.empty {
  margin: 0;
  color: var(--text-secondary);
}
.search {
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.search:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.list {
  max-height: min(24rem, 55vh);
  overflow-y: auto;
}
.group-name {
  position: sticky;
  top: 0;
  padding: 0.35rem 0.5rem;
  background: var(--bg-raised);
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.4rem 0.5rem;
  border-inline-start: 3px solid transparent;
  cursor: pointer;
}
.row.active {
  background: var(--bg-selected);
  border-inline-start-color: var(--focus-ring);
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.date {
  color: var(--text-secondary);
  font-size: 0.85rem;
  white-space: nowrap;
}
.chip {
  padding: 0 0.4rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  white-space: nowrap;
}
</style>
