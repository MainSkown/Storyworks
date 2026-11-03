<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ImportDialog from './ImportDialog.vue'
import { useProjectStore } from '../project/store'
import { useKindProfile } from '../composables/kindProfile'
import type { ManuscriptNode } from '../project/schemas/manifest'
import {
  isFiltering as filtering,
  STATUSES,
  statusFilter as filter,
} from '../composables/statusFilter'
import { dropSlot, filterByStatus, keyboardMove, type Slot } from '../project/tree'

type Zone = 'before' | 'after' | 'inside'
interface Row {
  node: ManuscriptNode
  depth: number
  size: number
  pos: number
  open: boolean | null
}

const vFocus = {
  mounted: (el: HTMLInputElement) => {
    el.focus()
    el.select()
  },
}

const { t, locale } = useI18n()
const store = useProjectStore()
const { profile, nodeLabel } = useKindProfile()
const sequence = computed(() => profile.value.folderLabel === 'sequence')
const root = ref<HTMLElement | null>(null)

const locked = computed(() => !!store.readOnly)
const filterOpen = ref(false)
const importOpen = ref(false)
const collapsed = ref(new Set<string>())
const statusOptions = computed(() =>
  STATUSES.map((value) => ({ value, label: t(`outline.status.${value}`) })),
)

const statusOf = (id: string): (typeof STATUSES)[number] =>
  store.sceneMeta.get(id)?.status ?? 'draft'

const shown = computed(() =>
  filtering.value ? filterByStatus(store.tree, statusOf, new Set(filter.value)) : store.tree,
)

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (nodes: ManuscriptNode[], depth: number) =>
    nodes.forEach((node, i) => {
      const container = node.type !== 'scene'
      const open = container ? filtering.value || !collapsed.value.has(node.id) : null
      out.push({ node, depth, size: nodes.length, pos: i + 1, open })
      if (open) walk(node.children, depth + 1)
    })
  walk(shown.value, 0)
  return out
})

/** id -> parent id, over the whole (unfiltered) tree */
const parents = computed(() => {
  const map = new Map<string, { node: ManuscriptNode; parentId: string | null }>()
  const walk = (nodes: ManuscriptNode[], parentId: string | null) =>
    nodes.forEach((node) => {
      map.set(node.id, { node, parentId })
      walk(node.children, node.id)
    })
  walk(store.tree, null)
  return map
})

const problems = computed(() => {
  const m = new Map<string, 'missing' | 'invalid'>()
  for (const i of store.issues) if (i.kind !== 'unlisted') m.set(i.itemId, i.kind)
  return m
})

// ---- focus (one tab stop, arrows move) ----
const focusId = ref<string | null>(null)
const tabbableId = computed(() => {
  const ids = new Set(rows.value.map((r) => r.node.id))
  if (focusId.value && ids.has(focusId.value)) return focusId.value
  if (store.selectedId && ids.has(store.selectedId)) return store.selectedId
  return rows.value[0]?.node.id ?? null
})

async function focusRow(id: string): Promise<void> {
  focusId.value = id
  await nextTick()
  root.value?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)?.focus()
}

function select(id: string): void {
  store.selectedId = id
  focusId.value = id
}

function toggle(id: string): void {
  const next = new Set(collapsed.value)
  if (!next.delete(id)) next.add(id)
  collapsed.value = next
}

function expand(id: string): void {
  if (!collapsed.value.has(id)) return
  const next = new Set(collapsed.value)
  next.delete(id)
  collapsed.value = next
}

// ---- add ----
const live = ref('')

function ancestorPart(id: string | null): string | null {
  let cur = id ? parents.value.get(id) : undefined
  while (cur) {
    if (cur.node.type === 'part') return cur.node.id
    cur = cur.parentId ? parents.value.get(cur.parentId) : undefined
  }
  return null
}

function sceneParent(): string | null {
  const sel = store.selectedId ? parents.value.get(store.selectedId) : undefined
  if (!sel) return null
  if (sel.node.type === 'scene') return sel.parentId
  if (sel.node.type === 'part') {
    const chapters = sel.node.children.filter((c) => c.type === 'chapter')
    return chapters.at(-1)?.id ?? sel.node.id
  }
  return sel.node.id
}

async function added(id: string, parentId: string | null): Promise<void> {
  if (parentId) expand(parentId)
  select(id)
  await focusRow(id)
  startRename(id)
}

async function addPart(): Promise<void> {
  await added(await store.addPart(t('outline.newPart')), null)
}
async function addChapter(): Promise<void> {
  const parent = ancestorPart(store.selectedId)
  await added(
    await store.addChapter(
      parent,
      t(sequence.value ? 'outline.newSequence' : 'outline.newChapter'),
    ),
    parent,
  )
}
async function addScene(): Promise<void> {
  const parent = sceneParent()
  await added(await store.addScene(parent, t('write.newScene')), parent)
}

// ---- rename ----
const renamingId = ref<string | null>(null)
const renameText = ref('')

function startRename(id: string): void {
  const info = parents.value.get(id)
  if (!info || locked.value) return
  renamingId.value = id
  renameText.value = info.node.title
}

async function commitRename(): Promise<void> {
  const id = renamingId.value
  if (!id) return
  renamingId.value = null
  await store.rename(id, renameText.value)
  await focusRow(id)
}

function cancelRename(): void {
  const id = renamingId.value
  renamingId.value = null
  if (id) void focusRow(id)
}

// ---- delete ----
const deleteId = ref<string | null>(null)
const deleteOpen = computed({
  get: () => deleteId.value !== null,
  set: (v) => {
    if (!v) deleteId.value = null
  },
})
const deleteTitle = computed(() => parents.value.get(deleteId.value ?? '')?.node.title ?? '')
const deleteLinks = computed(() =>
  deleteId.value ? store.linksBrokenByDeletingItem(deleteId.value) : 0,
)

async function doDelete(): Promise<void> {
  const id = deleteId.value
  deleteId.value = null
  if (!id) return
  const i = rows.value.findIndex((r) => r.node.id === id)
  const next = rows.value[i + 1] ?? rows.value[i - 1]
  await store.deleteItem(id)
  if (next && next.node.id !== id) void focusRow(next.node.id)
}

// ---- move: keyboard ----
const canReorder = computed(() => !locked.value && !filtering.value)

async function applyMove(id: string, slot: Slot | null): Promise<void> {
  if (!slot) return
  if (!(await store.moveItem(id, slot.parentId, slot.index))) return
  if (slot.parentId) expand(slot.parentId)
  live.value = t('outline.moved', { title: parents.value.get(id)?.node.title ?? '' })
  await focusRow(id)
}

function onKeydown(e: KeyboardEvent, row: Row): void {
  if (renamingId.value) return
  const id = row.node.id
  const list = rows.value
  const i = list.findIndex((r) => r.node.id === id)
  const keys: Record<string, 'up' | 'down' | 'out' | 'in'> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'out',
    ArrowRight: 'in',
  }
  if (e.altKey && keys[e.key]) {
    e.preventDefault()
    if (canReorder.value) void applyMove(id, keyboardMove(store.tree, id, keys[e.key]!))
    return
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      if (list[i + 1]) void focusRow(list[i + 1]!.node.id)
      break
    case 'ArrowUp':
      e.preventDefault()
      if (list[i - 1]) void focusRow(list[i - 1]!.node.id)
      break
    case 'Home':
      e.preventDefault()
      void focusRow(list[0]!.node.id)
      break
    case 'End':
      e.preventDefault()
      void focusRow(list.at(-1)!.node.id)
      break
    case 'ArrowRight':
      e.preventDefault()
      if (row.open === false) toggle(id)
      else if (row.open && list[i + 1]?.depth === row.depth + 1) void focusRow(list[i + 1]!.node.id)
      break
    case 'ArrowLeft': {
      e.preventDefault()
      if (row.open && !filtering.value) toggle(id)
      else {
        const parentId = parents.value.get(id)?.parentId
        if (parentId && list.some((r) => r.node.id === parentId)) void focusRow(parentId)
      }
      break
    }
    case 'Enter':
    case ' ':
      e.preventDefault()
      select(id)
      break
    case 'F2':
      e.preventDefault()
      startRename(id)
      break
    case 'Delete':
      e.preventDefault()
      if (!locked.value) deleteId.value = id
      break
  }
}

// ---- move: drag and drop (native HTML5) ----
const dragId = ref<string | null>(null)
const drop = ref<{ id: string; zone: Zone } | null>(null)
let dropKey = ''
let dropTarget: Slot | null = null

function onDragStart(e: DragEvent, id: string): void {
  dragId.value = id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
}

function clearDrag(): void {
  dragId.value = null
  drop.value = null
  dropKey = ''
  dropTarget = null
}

function onDragOver(e: DragEvent, row: Row): void {
  const drag = dragId.value
  if (!drag) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const f = (e.clientY - rect.top) / rect.height
  const edge: Zone = f < 0.5 ? 'before' : 'after'
  const zones: Zone[] =
    row.node.type === 'scene' ? [edge] : [f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'inside', edge]
  const key = `${row.node.id}:${zones[0]}:${edge}`
  if (key !== dropKey) {
    dropKey = key
    dropTarget = null
    drop.value = null
    for (const zone of zones) {
      const slot = dropSlot(store.tree, drag, row.node.id, zone)
      if (slot) {
        dropTarget = slot
        drop.value = { id: row.node.id, zone }
        break
      }
    }
  }
  if (!dropTarget) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDragLeave(e: DragEvent): void {
  if (!root.value?.contains(e.relatedTarget as Node | null)) {
    drop.value = null
    dropKey = ''
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

/** Row inputs for v-memo: rows whose values are unchanged skip render, so typing in a 600-row tree stays cheap. */
function memoDeps(r: Row): unknown[] {
  const id = r.node.id
  const sc = r.node.type === 'scene'
  return [
    r.node.title,
    r.depth,
    r.size,
    r.pos,
    r.open,
    id === store.selectedId,
    id === tabbableId.value,
    id === dragId.value,
    drop.value?.id === id ? drop.value.zone : null,
    store.wordCounts.get(id),
    sc && store.sceneMeta.has(id),
    sc ? statusOf(id) : null,
    sc ? store.sceneMeta.get(id)?.synopsis : null,
    problems.value.get(id),
    locked.value,
    canReorder.value,
    renamingId.value === id ? renameText.value : null,
    renamingId.value === id,
    locale.value,
    store.sceneNumbering.byItem.get(id),
  ]
}

/** Number of the scene's first heading (screenplay); empty otherwise. */
const sceneNo = (id: string): number | undefined => store.sceneNumbering.byItem.get(id)

const statusText = (id: string) => t(`outline.status.${statusOf(id)}`)
</script>

<template>
  <div ref="root" class="outline">
    <div class="actions" role="toolbar" :aria-label="t('write.actions')">
      <button
        v-if="profile.hasParts"
        type="button"
        class="tool"
        :aria-label="t('outline.addPart')"
        :title="t('outline.addPart')"
        :disabled="locked"
        @click="addPart"
      >
        <QIcon name="bookmark_add" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tool"
        :aria-label="t(sequence ? 'outline.addSequence' : 'outline.addChapter')"
        :title="t(sequence ? 'outline.addSequence' : 'outline.addChapter')"
        :disabled="locked"
        @click="addChapter"
      >
        <QIcon name="library_add" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tool"
        :aria-label="t('write.addScene')"
        :title="t('write.addScene')"
        :disabled="locked"
        @click="addScene"
      >
        <QIcon name="note_add" aria-hidden="true" />
      </button>
      <button
        v-if="profile.hasImport"
        type="button"
        class="tool"
        aria-haspopup="dialog"
        :aria-label="t('import.open')"
        :title="t('import.open')"
        :disabled="locked"
        @click="importOpen = true"
      >
        <QIcon name="upload_file" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tool"
        :class="{ on: filtering }"
        aria-haspopup="dialog"
        :aria-label="
          filtering ? t('outline.filterActive', { n: filter.length }) : t('outline.filter')
        "
        :title="t('outline.filter')"
        @click="filterOpen = true"
      >
        <QIcon name="filter_list" aria-hidden="true" />
        <span v-if="filtering" class="badge" aria-hidden="true">{{ filter.length }}</span>
      </button>
    </div>

    <p v-if="rows.length === 0" class="empty">
      {{ filtering ? t('outline.noMatch') : t('write.emptyTree') }}
    </p>
    <ul
      v-else
      class="tree"
      role="tree"
      :aria-label="t('write.tree')"
      :aria-description="t('outline.keyboardHint')"
      @dragleave="onDragLeave"
    >
      <li v-for="r in rows" :key="r.node.id" v-memo="memoDeps(r)" role="none">
        <div
          class="row"
          :class="{
            selected: r.node.id === store.selectedId,
            dragging: r.node.id === dragId,
            [`drop-${drop?.id === r.node.id ? drop.zone : 'none'}`]: true,
          }"
          :style="{ paddingInlineStart: `${0.25 + r.depth * 0.875}rem` }"
          role="treeitem"
          :data-row-id="r.node.id"
          :aria-level="r.depth + 1"
          :aria-setsize="r.size"
          :aria-posinset="r.pos"
          :aria-selected="r.node.id === store.selectedId"
          :aria-expanded="r.open === null ? undefined : r.open"
          :aria-description="
            r.node.type === 'scene'
              ? store.sceneMeta.get(r.node.id)?.synopsis || undefined
              : undefined
          "
          :title="
            r.node.type === 'scene'
              ? store.sceneMeta.get(r.node.id)?.synopsis || undefined
              : undefined
          "
          :tabindex="r.node.id === tabbableId ? 0 : -1"
          :draggable="canReorder && renamingId === null"
          @click="select(r.node.id)"
          @dblclick="startRename(r.node.id)"
          @focus="focusId = r.node.id"
          @keydown="onKeydown($event, r)"
          @dragstart="onDragStart($event, r.node.id)"
          @dragend="clearDrag"
          @dragover="onDragOver($event, r)"
          @drop="onDrop"
        >
          <button
            v-if="r.open !== null"
            type="button"
            class="chevron"
            tabindex="-1"
            :aria-label="
              r.open
                ? t('outline.collapse', { title: r.node.title })
                : t('outline.expand', { title: r.node.title })
            "
            @click.stop="toggle(r.node.id)"
          >
            <QIcon
              :name="r.open ? 'expand_more' : 'chevron_right'"
              size="1rem"
              aria-hidden="true"
            />
          </button>
          <span v-else class="chevron-gap" aria-hidden="true"></span>

          <span
            v-if="r.node.type === 'scene' && store.sceneMeta.has(r.node.id)"
            class="dot"
            :class="`s-${statusOf(r.node.id)}`"
            role="img"
            :aria-label="t('outline.statusLabel', { status: statusText(r.node.id) })"
            :title="statusText(r.node.id)"
          ></span>
          <QIcon
            v-else-if="r.node.type !== 'scene'"
            class="kind-icon"
            :name="r.node.type === 'part' ? 'bookmarks' : 'book'"
            size="1rem"
            aria-hidden="true"
          />

          <input
            v-if="renamingId === r.node.id"
            v-model="renameText"
            v-focus
            class="rename"
            :aria-label="t('write.rename')"
            @click.stop
            @dblclick.stop
            @keydown.stop
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename"
          />
          <span v-else class="name" :class="r.node.type">
            <span class="sr-only">{{ t(`write.kind.${nodeLabel(r.node.type)}`) }}: </span>
            <span v-if="sceneNo(r.node.id)" class="num">{{ sceneNo(r.node.id) }}</span>
            {{ r.node.title }}
          </span>

          <span
            v-if="problems.get(r.node.id)"
            class="problem"
            role="img"
            :aria-label="
              t('write.problem.item', {
                title: r.node.title,
                problem: t(`write.problem.${problems.get(r.node.id)}`),
              })
            "
            :title="t(`write.problem.${problems.get(r.node.id)}`)"
          >
            <QIcon
              :name="problems.get(r.node.id) === 'missing' ? 'report_problem' : 'error_outline'"
              size="1rem"
              aria-hidden="true"
            />
          </span>

          <span
            v-if="renamingId !== r.node.id"
            class="words"
            :title="t('outline.words', { n: store.wordCounts.get(r.node.id) ?? 0 })"
          >
            <span class="sr-only">{{ t('outline.words', { n: '' }) }}</span>
            {{ store.wordCounts.get(r.node.id) ?? 0 }}
          </span>
          <button
            v-if="!locked && renamingId !== r.node.id"
            type="button"
            class="delete"
            tabindex="-1"
            :aria-label="`${t('write.delete')}: ${r.node.title}`"
            :title="t('write.delete')"
            @click.stop="deleteId = r.node.id"
          >
            <QIcon name="delete" size="1rem" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>

    <div class="sr-only" role="status" aria-live="polite">{{ live }}</div>

    <ImportDialog v-model="importOpen" />

    <QDialog v-model="filterOpen">
      <QCard class="confirm" role="dialog" aria-labelledby="outline-filter-title">
        <QCardSection>
          <h2 id="outline-filter-title" class="confirm-title">{{ t('outline.filter') }}</h2>
          <p class="filter-hint">{{ t('outline.filterHint') }}</p>
          <div class="filter-options">
            <QCheckbox
              v-for="o in statusOptions"
              :key="o.value"
              v-model="filter"
              :val="o.value"
              :label="o.label"
            />
          </div>
        </QCardSection>
        <QCardActions align="right">
          <QBtn
            flat
            no-caps
            :label="t('outline.filterClear')"
            :disable="!filtering"
            @click="filter = []"
          />
          <QBtn
            unelevated
            no-caps
            color="primary"
            :label="t('outline.filterDone')"
            @click="filterOpen = false"
          />
        </QCardActions>
      </QCard>
    </QDialog>

    <QDialog v-model="deleteOpen">
      <QCard class="confirm" role="alertdialog" aria-labelledby="outline-del-title">
        <QCardSection>
          <h2 id="outline-del-title" class="confirm-title">{{ t('write.deleteTitle') }}</h2>
          <p>{{ t('write.deleteBody', { title: deleteTitle }) }}</p>
          <p v-if="deleteLinks > 0">
            {{ t('deleteImpact.links', { n: deleteLinks }, deleteLinks) }}
          </p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps autofocus :label="t('write.cancel')" @click="deleteId = null" />
          <QBtn unelevated no-caps color="negative" :label="t('write.delete')" @click="doDelete" />
        </QCardActions>
      </QCard>
    </QDialog>
  </div>
</template>

<style scoped>
.outline {
  color: var(--text-primary);
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
}
.tool {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font-size: 1.125rem;
  cursor: pointer;
}
.tool:hover:not(:disabled) {
  background: var(--bg-selected);
}
.tool.on {
  background: var(--bg-selected);
}
.tool:disabled {
  opacity: 0.5;
  cursor: default;
}
.tool:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.badge {
  position: absolute;
  top: -0.375rem;
  right: -0.375rem;
  box-sizing: border-box;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.25rem;
  border-radius: 0.5rem;
  background: var(--focus-ring);
  color: var(--bg-sheet);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1rem;
  text-align: center;
}
.filter-hint {
  margin: 0 0 0.5rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.filter-options {
  display: flex;
  flex-direction: column;
}
.tree {
  max-height: 55vh;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.empty {
  margin: 0.25rem 0;
  color: var(--text-secondary);
}
.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 1.75rem;
  padding-inline-end: 0.25rem;
  border-radius: 0.25rem;
  color: var(--text-primary);
  cursor: pointer;
}
.row:hover {
  background: var(--bg-selected);
}
.row.selected {
  background: var(--bg-selected);
  box-shadow: inset 2px 0 0 var(--sec, var(--focus-ring));
  font-weight: 600;
}
.row:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}
.row.dragging {
  opacity: 0.5;
}
.row.drop-before {
  box-shadow: inset 0 2px 0 var(--focus-ring);
}
.row.drop-after {
  box-shadow: inset 0 -2px 0 var(--focus-ring);
}
.row.drop-inside {
  outline: 2px dashed var(--focus-ring);
  outline-offset: -2px;
}
.chevron,
.delete {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: 0;
  border-radius: 0.25rem;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
}
.chevron:hover,
.delete:hover {
  color: var(--text-primary);
}
.chevron-gap {
  flex: none;
  width: 1.25rem;
}
.delete {
  visibility: hidden;
}
.row:hover .delete,
.row:focus-within .delete,
.row.selected .delete {
  visibility: visible;
}
.kind-icon {
  flex: none;
  color: var(--text-secondary);
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 0.8125rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.num {
  margin-inline-end: 0.375rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.name.part {
  font-weight: 700;
}
.name.chapter {
  font-weight: 600;
}
.words {
  flex: none;
  color: var(--text-secondary);
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
}
.problem {
  display: inline-flex;
  flex: none;
  color: var(--text-secondary);
}
.rename {
  flex: 1;
  min-width: 0;
  padding: 0.125rem 0.25rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.25rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
}
.rename:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
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
  box-shadow: 0 0 0 1px var(--bg-sidebar) inset;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.confirm {
  min-width: min(26rem, 90vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.confirm-title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
</style>
