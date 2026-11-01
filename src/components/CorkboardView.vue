<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../project/store'
import { writeView } from '../composables/writeView'
import { crossSlot, groupScenes, type CorkSection } from '../project/corkboard'
import { dropSlot, filterByStatus, keyboardMove, type Slot } from '../project/tree'
import { isFiltering, statusFilter } from '../composables/statusFilter'

type Zone = 'before' | 'after'

const { t } = useI18n()
const store = useProjectStore()
const root = ref<HTMLElement | null>(null)
const live = ref('')

const locked = computed(() => !!store.readOnly)
const statusOf = (id: string) => store.sceneMeta.get(id)?.status ?? 'draft'
const shownTree = computed(() =>
  isFiltering.value
    ? filterByStatus(store.tree, statusOf, new Set(statusFilter.value))
    : store.tree,
)
const sections = computed(() => groupScenes(shownTree.value))
const filterText = computed(() =>
  statusFilter.value.map((s) => t(`outline.status.${s}`)).join(', '),
)
const canMove = computed(() => !locked.value && !isFiltering.value)
const cardIds = computed(() => sections.value.flatMap((s) => s.scenes.map((c) => c.node.id)))
const cardTitles = computed(() => {
  const m = new Map<string, string>()
  for (const s of sections.value) for (const c of s.scenes) m.set(c.node.id, c.node.title)
  return m
})

const statusText = (id: string) => t(`outline.status.${statusOf(id)}`)
const wordsOf = (id: string) => store.wordCounts.get(id) ?? 0

// ---- open ----
function open(id: string): void {
  store.selectedId = id
  writeView.value = 'editor'
}

// ---- focus (one tab stop) ----
const focusId = ref<string | null>(null)
const tabbableId = computed(() => {
  const ids = new Set(cardIds.value)
  if (focusId.value && ids.has(focusId.value)) return focusId.value
  if (store.selectedId && ids.has(store.selectedId)) return store.selectedId
  return cardIds.value[0] ?? null
})

const cardEl = (id: string) =>
  root.value?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`) ?? null

async function focusCard(id: string): Promise<void> {
  focusId.value = id
  await nextTick()
  cardEl(id)?.focus()
}

/** Nearest card in the row above or below, by position on screen. */
function neighbourVertical(id: string, dir: 1 | -1): string | null {
  const from = cardEl(id)?.getBoundingClientRect()
  if (!from) return null
  let best: { id: string; dy: number; dx: number } | null = null
  for (const other of cardIds.value) {
    const r = cardEl(other)?.getBoundingClientRect()
    if (!r || other === id) continue
    const dy = (r.top - from.top) * dir
    if (dy <= 1) continue
    const dx = Math.abs(r.left - from.left)
    if (!best || dy < best.dy - 1 || (Math.abs(dy - best.dy) <= 1 && dx < best.dx))
      best = { id: other, dy, dx }
  }
  return best?.id ?? null
}

// ---- move ----
async function applyMove(id: string, slot: Slot | null): Promise<void> {
  if (!slot || !canMove.value) return
  if (!(await store.moveItem(id, slot.parentId, slot.index))) return
  live.value = t('corkboard.moved', { title: cardTitles.value.get(id) ?? '' })
  await focusCard(id)
}

function onKeydown(e: KeyboardEvent, id: string): void {
  const ids = cardIds.value
  const i = ids.indexOf(id)
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const map: Record<string, () => Slot | null> = {
      ArrowLeft: () => keyboardMove(store.tree, id, 'up'),
      ArrowRight: () => keyboardMove(store.tree, id, 'down'),
      ArrowUp: () => crossSlot(store.tree, id, 'prev'),
      ArrowDown: () => crossSlot(store.tree, id, 'next'),
    }
    const slot = map[e.key]
    if (slot) {
      e.preventDefault()
      void applyMove(id, slot())
    }
    return
  }
  if (e.ctrlKey || e.metaKey) return
  const go = (target: string | null | undefined) => {
    e.preventDefault()
    if (target) void focusCard(target)
  }
  switch (e.key) {
    case 'ArrowLeft':
      return go(ids[i - 1])
    case 'ArrowRight':
      return go(ids[i + 1])
    case 'ArrowUp':
      return go(neighbourVertical(id, -1))
    case 'ArrowDown':
      return go(neighbourVertical(id, 1))
    case 'Home':
      return go(ids[0])
    case 'End':
      return go(ids.at(-1))
    case 'Enter':
    case ' ':
      e.preventDefault()
      open(id)
  }
}

// ---- drag and drop (native HTML5, same slots as the tree) ----
const dragId = ref<string | null>(null)
const cardDrop = ref<{ id: string; zone: Zone } | null>(null)
const sectionDrop = ref<string | null>(null)
let dropTarget: Slot | null = null

function clearDrag(): void {
  dragId.value = null
  cardDrop.value = null
  sectionDrop.value = null
  dropTarget = null
}

function onDragStart(e: DragEvent, id: string): void {
  dragId.value = id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
}

function accept(e: DragEvent, slot: Slot | null): void {
  dropTarget = slot
  if (!slot) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onCardOver(e: DragEvent, id: string): void {
  const drag = dragId.value
  if (!drag) return
  e.stopPropagation()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const zone: Zone = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after'
  const slot = dropSlot(store.tree, drag, id, zone)
  cardDrop.value = slot ? { id, zone } : null
  sectionDrop.value = null
  accept(e, slot)
}

function onSectionOver(e: DragEvent, sec: CorkSection): void {
  const drag = dragId.value
  if (!drag) return
  const slot = sec.parentId ? dropSlot(store.tree, drag, sec.parentId, 'inside') : null
  cardDrop.value = null
  sectionDrop.value = slot ? sec.key : null
  accept(e, slot)
}

function onDragLeave(e: DragEvent): void {
  if (!root.value?.contains(e.relatedTarget as Node | null)) {
    cardDrop.value = null
    sectionDrop.value = null
    dropTarget = null
  }
}

async function onDrop(e: DragEvent): Promise<void> {
  const drag = dragId.value
  const slot = dropTarget
  clearDrag()
  if (!drag || !slot) return
  e.preventDefault()
  await applyMove(drag, slot)
}
</script>

<template>
  <div ref="root" class="cork" @dragleave="onDragLeave">
    <p v-if="sections.length === 0" class="empty">
      {{ isFiltering ? t('outline.noMatch') : t('write.emptyTree') }}
    </p>
    <div
      v-else
      class="board"
      role="group"
      :aria-label="t('corkboard.title')"
      :aria-description="t('corkboard.keyboardHint')"
    >
      <p v-if="isFiltering" class="hint">
        {{ t('corkboard.filtered', { statuses: filterText }) }}
      </p>
      <p class="hint">{{ t('corkboard.keyboardHint') }}</p>
      <section
        v-for="sec in sections"
        :key="sec.key"
        class="sec"
        :class="{ 'drop-inside': sectionDrop === sec.key }"
        :aria-labelledby="sec.heading ? `cork-h-${sec.heading.id}` : undefined"
        @dragover="onSectionOver($event, sec)"
        @drop="onDrop"
      >
        <component
          :is="sec.heading.type === 'part' ? 'h2' : 'h3'"
          v-if="sec.heading"
          :id="`cork-h-${sec.heading.id}`"
          class="heading"
          :class="sec.heading.type"
        >
          <QIcon
            :name="sec.heading.type === 'part' ? 'bookmarks' : 'book'"
            size="1rem"
            aria-hidden="true"
          />
          <span class="sr-only">{{ t(`write.kind.${sec.heading.type}`) }}: </span>
          {{ sec.heading.title }}
          <span class="words">{{ t('outline.words', { n: wordsOf(sec.heading.id) }) }}</span>
        </component>

        <ul v-if="sec.scenes.length" class="cards" role="list">
          <li v-for="c in sec.scenes" :key="c.node.id">
            <div
              class="card"
              :class="{
                selected: c.node.id === store.selectedId,
                dragging: c.node.id === dragId,
                [`drop-${cardDrop?.id === c.node.id ? cardDrop.zone : 'none'}`]: true,
              }"
              role="button"
              :data-card-id="c.node.id"
              :tabindex="c.node.id === tabbableId ? 0 : -1"
              :aria-current="c.node.id === store.selectedId ? 'true' : undefined"
              :aria-label="
                [
                  c.node.title,
                  t('outline.statusLabel', { status: statusText(c.node.id) }),
                  t('outline.words', { n: wordsOf(c.node.id) }),
                ].join(', ')
              "
              :aria-description="store.sceneMeta.get(c.node.id)?.synopsis || undefined"
              :draggable="canMove"
              @click="open(c.node.id)"
              @focus="focusId = c.node.id"
              @keydown="onKeydown($event, c.node.id)"
              @dragstart="onDragStart($event, c.node.id)"
              @dragend="clearDrag"
              @dragover="onCardOver($event, c.node.id)"
              @drop.stop="onDrop"
            >
              <span class="title">{{ c.node.title }}</span>
              <span v-if="store.sceneMeta.get(c.node.id)?.synopsis" class="synopsis">{{
                store.sceneMeta.get(c.node.id)?.synopsis
              }}</span>
              <span v-else class="synopsis none">{{ t('corkboard.noSynopsis') }}</span>
              <span class="foot">
                <span v-if="store.sceneMeta.has(c.node.id)" class="status" aria-hidden="true">
                  <span class="dot" :class="`s-${statusOf(c.node.id)}`"></span>
                  {{ statusText(c.node.id) }}
                </span>
                <span class="words" aria-hidden="true">{{
                  t('outline.words', { n: wordsOf(c.node.id) })
                }}</span>
              </span>
            </div>
          </li>
        </ul>
        <p v-else-if="sec.heading" class="none-here">{{ t('corkboard.emptyContainer') }}</p>
      </section>
    </div>
    <div class="sr-only" role="status" aria-live="polite">{{ live }}</div>
  </div>
</template>

<style scoped>
.cork {
  height: 100%;
  overflow-y: auto;
  padding: 1rem 1.5rem 2rem;
  background: var(--bg-editor);
  color: var(--text-primary);
}
.empty,
.hint,
.none-here {
  margin: 0 0 0.75rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.sec {
  margin-bottom: 1.25rem;
  padding: 0.25rem;
  border-radius: 0.5rem;
}
.sec.drop-inside {
  outline: 2px dashed var(--focus-ring);
  outline-offset: 2px;
}
.heading {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0 0 0.5rem;
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 600;
}
.heading.part {
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--border);
  font-size: 1.15rem;
  font-weight: 700;
}
.heading .words {
  margin-inline-start: auto;
  font-weight: 400;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  height: 100%;
  min-height: 8rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  cursor: pointer;
}
.card:hover {
  border-color: var(--border-strong);
}
.card.selected {
  border-color: var(--focus-ring);
  box-shadow: inset 0 0 0 1px var(--focus-ring);
}
.card:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.card.dragging {
  opacity: 0.5;
}
.card.drop-before {
  box-shadow: -4px 0 0 var(--focus-ring);
}
.card.drop-after {
  box-shadow: 4px 0 0 var(--focus-ring);
}
.title {
  font-size: 0.9375rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.synopsis {
  display: -webkit-box;
  flex: 1;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}
.synopsis.none {
  font-style: italic;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.75rem;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.words {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

/* Status shapes differ as well as colours: ring, half, solid, solid with centre. */
.dot {
  flex: none;
  box-sizing: border-box;
  width: 0.625rem;
  height: 0.625rem;
  border: 2px solid var(--dot);
  border-radius: 50%;
}
.s-idea {
  --dot: var(--status-idea);
  background: transparent;
}
.s-draft {
  --dot: var(--status-draft);
  background: linear-gradient(90deg, var(--dot) 50%, transparent 50%);
}
.s-revising {
  --dot: var(--status-revising);
  background: var(--dot);
}
.s-final {
  --dot: var(--status-final);
  background: var(--dot);
  box-shadow: 0 0 0 1px var(--bg-sheet) inset;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
