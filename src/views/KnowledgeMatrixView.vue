<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '../calendar'
import PositionField from '../components/states/PositionField.vue'
import { describePosition } from '../components/states/position'
import { openEntry } from '../codex/openEntry'
import { useCodexStore } from '../codex/store'
import { knowledgeMatrix } from '../knowledge/logic'
import { CELL_LOOK, matrixEntryIds, nextCell, type GridKey } from '../knowledge/matrixView'
import { openKnowledgeItem } from '../knowledge/openItem'
import { useKnowledgeStore } from '../knowledge/store'
import type { Position } from '../timeline/order'
import { useOrderContext } from '../timeline/orderContext'
import { useTimelinesStore } from '../timeline/store'

const { t } = useI18n()
const codex = useCodexStore()
const know = useKnowledgeStore()
const timelines = useTimelinesStore()
const ctx = useOrderContext()

const asOf = ref<Position | null>(null)
const typeFilter = ref<string | null>(null)
const gridEl = ref<HTMLElement | null>(null)

const items = computed(() => know.items)
const entryById = computed(() => new Map(codex.entries.map((e) => [e.id, e])))
const entryName = (id: string) => entryById.value.get(id)?.name || t('codex.untitled')

const allRowIds = computed(() => matrixEntryIds(codex.entries, codex.types, items.value, null))
/** Types that have at least one row, for the filter chips. */
const typeChips = computed(() => {
  const used = new Set(allRowIds.value.map((id) => entryById.value.get(id)?.typeId))
  return codex.types.filter((ty) => used.has(ty.id))
})
const rowIds = computed(() =>
  typeFilter.value
    ? matrixEntryIds(codex.entries, codex.types, items.value, typeFilter.value)
    : allRowIds.value,
)
watch(typeChips, (chips) => {
  if (typeFilter.value && !chips.some((c) => c.id === typeFilter.value)) typeFilter.value = null
})

// Position texts depend on data only, so changing "As of" does not rebuild them.
function positionText(p: Position): string {
  const v = describePosition(p, timelines.loadedTimelines, (d) => formatDate(timelines.calendar, d))
  if (v.kind === 'date') return v.date
  if (v.kind === 'missing-event') return t('states.position.missingEvent')
  return [v.title || t('states.position.untitledEvent'), v.date].filter(Boolean).join(' · ')
}
const learningText = computed(() => {
  const out = new Map<string, string[]>()
  for (const item of items.value)
    for (const l of item.learnings) {
      const lines = [t('knowledgeMatrix.learns', { at: positionText(l.at) })]
      if (l.forgottenAt) lines.push(t('knowledgeMatrix.forgets', { at: positionText(l.forgottenAt) }))
      out.set(l.id, lines)
    }
  return out
})

const matrix = computed(() => knowledgeMatrix(rowIds.value, items.value, asOf.value, ctx.value))
const size = computed(() => ({ rows: matrix.value.length, cols: items.value.length }))
const hiddenCount = computed(() => know.brokenLearningIds.length)

const itemTitle = (title: string) => title || t('knowledgeMatrix.untitledItem')

// ---- keyboard: one tab stop, arrows move; tabindex is set on the DOM so moving never re-renders ----
let active = { r: 0, c: 0 }
const cellAt = (r: number, c: number) =>
  gridEl.value?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`) ?? null

function activate(r: number, c: number, focus: boolean): void {
  cellAt(active.r, active.c)?.setAttribute('tabindex', '-1')
  active = { r, c }
  const cell = cellAt(r, c)
  cell?.setAttribute('tabindex', '0')
  if (focus) cell?.focus()
}

// The first cell is the tab stop again whenever the grid is rebuilt.
watch([rowIds, items], async () => {
  await nextTick()
  gridEl.value?.querySelectorAll('[data-r][tabindex="0"]').forEach((el) => el.setAttribute('tabindex', '-1'))
  active = { r: 0, c: 0 }
  cellAt(0, 0)?.setAttribute('tabindex', '0')
})

const GRID_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'])

function onKeydown(e: KeyboardEvent): void {
  const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')
  if (!cell) return
  const at = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) }
  if (e.key === 'Enter') {
    e.preventDefault()
    const row = matrix.value[at.r]
    const itemId = row?.cells[at.c]?.itemId
    if (!row || !itemId) return
    void (e.shiftKey ? openEntry(row.entryId) : openKnowledgeItem(itemId))
  } else if (GRID_KEYS.has(e.key)) {
    e.preventDefault()
    const to = nextCell(at, e.key as GridKey, size.value, { ctrl: e.ctrlKey || e.metaKey })
    activate(to.r, to.c, true)
  }
}

function onFocusin(e: FocusEvent): void {
  const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')
  if (cell) activate(Number(cell.dataset.r), Number(cell.dataset.c), false)
}
</script>

<template>
  <section class="km">
    <div class="toolbar">
      <QBtn flat dense no-caps icon="arrow_back" :label="t('knowledgeMatrix.back')" :to="{ name: 'codex' }" />
      <h1 class="title">{{ t('knowledgeMatrix.title') }}</h1>
      <PositionField v-model="asOf" :label="t('knowledgeMatrix.asOf')" class="asof" />
    </div>
    <div
      v-if="typeChips.length > 1"
      class="filters"
      role="group"
      :aria-label="t('knowledgeMatrix.filterType')"
    >
      <button
        v-for="ty in typeChips"
        :key="ty.id"
        type="button"
        class="fchip"
        :aria-pressed="typeFilter === ty.id"
        @click="typeFilter = typeFilter === ty.id ? null : ty.id"
      >
        <span class="dot" :style="{ background: ty.color }" aria-hidden="true" />{{ ty.name }}
      </button>
    </div>

    <div v-if="!items.length" class="empty" role="status">
      <p>{{ t('knowledgeMatrix.emptyItems') }}</p>
    </div>
    <div v-else-if="!allRowIds.length" class="empty" role="status">
      <p>{{ t('knowledgeMatrix.emptyLearnings') }}</p>
    </div>
    <div v-else-if="!matrix.length" class="empty" role="status">
      <p>{{ t('knowledgeMatrix.noMatch') }}</p>
    </div>
    <template v-else>
      <p class="hint">
        {{ t('knowledgeMatrix.keyboardHint') }}
        <span v-if="hiddenCount" role="status">
          {{ t('knowledgeMatrix.hidden', { n: hiddenCount }, hiddenCount) }}
        </span>
      </p>
      <div class="scroll">
        <table
          ref="gridEl"
          class="grid"
          role="grid"
          :aria-label="t('knowledgeMatrix.gridLabel')"
          :aria-rowcount="matrix.length + 1"
          :aria-colcount="items.length + 1"
          @keydown="onKeydown"
          @focusin="onFocusin"
        >
          <thead>
            <tr>
              <th scope="col" class="corner">{{ t('knowledgeMatrix.cornerHeader') }}</th>
              <th v-for="item in items" :key="item.id" scope="col" class="colh">
                <button
                  type="button"
                  class="hbtn"
                  tabindex="-1"
                  :title="itemTitle(item.title)"
                  @click="openKnowledgeItem(item.id)"
                >
                  {{ itemTitle(item.title) }}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in matrix" :key="row.entryId">
              <th scope="row" class="rowh">
                <button
                  type="button"
                  class="hbtn"
                  tabindex="-1"
                  :title="t('knowledgeMatrix.openEntry', { name: entryName(row.entryId) })"
                  @click="openEntry(row.entryId)"
                >
                  {{ entryName(row.entryId) }}
                </button>
              </th>
              <td
                v-for="(cell, c) in row.cells"
                :key="cell.itemId"
                role="gridcell"
                class="cell"
                :class="cell.state"
                :data-r="r"
                :data-c="c"
                :tabindex="r === 0 && c === 0 ? 0 : -1"
              >
                <span v-if="cell.state === 'none'" class="dash" :title="t('knowledgeMatrix.state.none')">
                  <span aria-hidden="true">—</span>
                  <span class="sr-only">{{ t('knowledgeMatrix.state.none') }}</span>
                </span>
                <template v-else>
                  <span class="state">
                    <i class="q-icon notranslate material-icons" aria-hidden="true">{{ CELL_LOOK[cell.state].icon }}</i>
                    {{ t(`knowledgeMatrix.state.${CELL_LOOK[cell.state].key}`) }}
                  </span>
                  <template v-for="l in cell.learnings" :key="l.id">
                    <span v-for="(line, i) in learningText.get(l.id)" :key="i" class="line">{{ line }}</span>
                  </template>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.km {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--text-primary);
}
.toolbar,
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}
.filters {
  gap: 0.375rem;
  padding-block: 0.375rem;
}
.title {
  margin: 0 0.5rem 0 0;
  font-size: 1.0625rem;
  font-weight: 600;
}
.asof {
  margin-inline-start: auto;
}
.fchip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.fchip:hover {
  background: var(--bg-selected);
}
.fchip[aria-pressed='true'] {
  border-color: var(--section-codex);
  background: var(--section-codex);
  color: var(--section-codex-on);
}
.fchip:focus-visible,
.hbtn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
}
.hint {
  margin: 0;
  padding: 0.375rem 0.75rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.empty {
  padding: 1.5rem 0.75rem;
  color: var(--text-secondary);
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scroll-padding: 3rem 11rem;
}
.grid {
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.8125rem;
}
.grid th,
.grid td {
  box-sizing: border-box;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.corner,
.colh,
.rowh {
  background: var(--bg-panel);
  font-weight: 600;
  text-align: start;
}
.corner,
.colh {
  position: sticky;
  top: 0;
  z-index: 2;
  min-width: 9rem;
  max-width: 12rem;
  padding: 0.375rem 0.5rem;
}
.corner,
.rowh {
  position: sticky;
  left: 0;
  width: 11rem;
  min-width: 11rem;
  max-width: 11rem;
}
.corner {
  z-index: 3;
  color: var(--text-secondary);
}
.rowh {
  z-index: 1;
  padding: 0.375rem 0.5rem;
}
.hbtn {
  display: block;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.hbtn:hover {
  text-decoration: underline;
}
.cell {
  min-width: 9rem;
  max-width: 12rem;
  padding: 0.375rem 0.5rem;
  vertical-align: top;
  background: var(--bg-sheet);
}
.cell:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}
.state {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 600;
}
.state .q-icon {
  font-size: 1rem;
}
.line {
  display: block;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.cell.known .state {
  color: var(--section-rules);
}
.cell.forgotten .state,
.cell.unknown .state {
  color: var(--section-timelines);
}
.cell.not-yet {
  background: var(--bg-app);
}
.cell.not-yet .state,
.cell.not-yet .line {
  color: var(--text-secondary);
  font-style: italic;
  font-weight: 400;
}
.dash {
  color: var(--text-secondary);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
