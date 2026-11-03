<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { listRoutes, routeLabel } from '../game/routes'
import type { StoryModel } from '../game/storyPlaythrough'
import { newId } from '../project/ids'
import { useProjectStore } from '../project/store'
import { findNode } from '../project/tree'
import type { Conversation } from '../project/schemas/conversation'
import { useTimelinesStore } from '../timeline/store'
import { openTarget } from '../search/open'
import { kindOf, type BoxData } from '../storymap/boxData'
import {
  addBeat,
  BOX_H,
  BOX_W,
  connect,
  derivedArrows,
  moveBox,
  removeBox,
  startBoxes,
  syncItems,
  disconnect,
  type DerivedArrow,
} from '../storymap/ops'
import {
  clearStoryMapSelection,
  derivedList,
  selectedArrowId,
  selectedBoxId,
  shownMap,
} from '../storymap/selection'
import { useStoryMapStore } from '../storymap/store'
import { useConditionText } from '../storymap/useConditionText'
import { useStoryItems } from '../storymap/useItems'
import { useStoryModel } from '../storymap/useStoryModel'
import GraphCanvas from '../components/graph/GraphCanvas.vue'
import GraphList from '../components/graph/GraphList.vue'
import type {
  CanConnectResult,
  GraphEdgeModel,
  GraphNodeModel,
  GraphStyle,
} from '../components/graph/types'
import StoryBoxBody from '../components/storymap/StoryBoxBody.vue'
import StoryPlaythroughPanel from '../components/storymap/StoryPlaythroughPanel.vue'

interface CanvasHandle {
  focusNode(id: string, opts?: { reveal?: boolean }): Promise<void>
  fit(): unknown
  zoomIn(): unknown
  zoomOut(): unknown
}
interface EdgeData {
  derived: DerivedArrow | null
}

const { t } = useI18n()
const project = useProjectStore()
const store = useStoryMapStore()
const tl = useTimelinesStore()
const condText = useConditionText()
const { build } = useStoryModel()
const items = useStoryItems()

const display = ref<'canvas' | 'list'>('canvas')
const canvas = ref<CanvasHandle | null>(null)
/** 'all' or a route key. */
const routeFilter = ref('all')
const Y_STEP = 130

// ---- editing guard ----
const editable = computed(
  () => !project.readOnly && (store.status === 'none' || store.status === 'ok'),
)
const noticeKey = computed(() =>
  store.status === 'invalid' || store.status === 'missing' ? `storymap.${store.status}` : null,
)

// ---- map: stored boxes plus a box for every live item ----
const view = computed(() => {
  let n = 0
  return syncItems(store.map, items.liveIds.value, () => `pending-${n++}`)
})
// Persist the missing boxes (never when read-only or the file is unusable).
watch(
  [() => items.liveIds.value.join('|'), editable],
  ([, can]) => {
    if (can && view.value !== store.map) {
      const ids = items.liveIds.value
      void store.edit((m) => syncItems(m, ids, newId))
    }
  },
  { immediate: true },
)

// ---- derived arrows (from conversations' cross-item links) ----
const convs = shallowRef<{ id: string; conversation: Conversation }[]>([])
async function loadConversations(): Promise<void> {
  const all = await project.loadAllConversations()
  convs.value = all.map((c) => ({ id: c.id, conversation: c }))
}
const convVersions = computed(() =>
  items.items.value
    .filter((i) => i.type === 'conversation' && !i.trashed)
    .map((i) => {
      const path = findNode(project.tree, i.id)?.path
      return path ? project.itemVersion(path) : -1
    })
    .join(','),
)
watch(convVersions, () => void loadConversations(), { immediate: true })

const derived = computed(() => derivedArrows(view.value, convs.value))

// Share with the context-panel inspector.
watchEffect(() => {
  shownMap.value = view.value
  derivedList.value = derived.value
})
onBeforeUnmount(() => {
  shownMap.value = null
  derivedList.value = []
  clearStoryMapSelection()
})

// ---- graph model ----
function labelOf(d: BoxData): string {
  const kind = t(`storymap.kind.${kindOf(d)}`)
  const title =
    d.box.kind === 'beat'
      ? d.box.text.trim() || t('storymap.emptyBeat')
      : (d.item?.title ?? t('storymap.badge.deleted'))
  const state =
    d.state && d.state !== 'live'
      ? t(d.state === 'trashed' ? 'storymap.badge.trash' : 'storymap.badge.deleted')
      : ''
  const base = state
    ? t('storymap.boxWithState', { kind, title, state })
    : t('storymap.box', { kind, title })
  return d.box.start ? `${base}, ${t('storymap.badge.start')}` : base
}
const nodes = computed<GraphNodeModel<BoxData>[]>(() =>
  view.value.boxes.map((box) => {
    const data: BoxData = {
      box,
      item: items.itemOf(box),
      state: items.stateOf(box),
      routes: box.kind === 'item' ? items.routesOf(box.itemId) : [],
    }
    return {
      id: box.id,
      x: box.x,
      y: box.y,
      width: BOX_W,
      height: BOX_H,
      label: labelOf(data),
      data,
    }
  }),
)
const edges = computed<GraphEdgeModel<EdgeData>[]>(() => [
  ...view.value.arrows.map((a) => ({
    id: a.id,
    from: a.from,
    to: a.to,
    ...(a.condition ? { label: condText(a.condition) } : {}),
    data: { derived: null },
  })),
  ...derived.value.map((a) => {
    const first = a.sources[0]
    const text = first?.text?.trim() || t('storymap.jump')
    return {
      id: a.id,
      from: a.from,
      to: a.to,
      label: a.sources.length > 1 ? t('storymap.more', { text, n: a.sources.length - 1 }) : text,
      data: { derived: a },
    }
  }),
])

const routeKey = (r: { timelineId: string; branchId: string }) => `${r.timelineId}/${r.branchId}`
const allRoutes = computed(() => listRoutes(tl.loadedTimelines))
const routeOptions = computed(() => [
  { label: t('storymap.allRoutes'), value: 'all' },
  ...allRoutes.value.map((r) => ({
    label: routeLabel(r, allRoutes.value),
    value: routeKey(r.ref),
  })),
])
watch(allRoutes, (all) => {
  if (routeFilter.value !== 'all' && !all.some((r) => routeKey(r.ref) === routeFilter.value))
    routeFilter.value = 'all'
})

function nodeStyle(n: GraphNodeModel<BoxData>): GraphStyle {
  const d = n.data
  const broken = !!d && !!d.state && d.state !== 'live'
  const color = broken
    ? 'var(--section-checks)'
    : !d || d.box.kind === 'beat'
      ? undefined
      : d.item?.type === 'conversation'
        ? 'var(--tag-event)'
        : 'var(--tag-scene)'
  return {
    ...(color ? { color } : {}),
    ...(broken ? { dashed: true } : {}),
    ...(routeFilter.value !== 'all' && !d?.routes.some((r) => routeKey(r) === routeFilter.value)
      ? { dimmed: true }
      : {}),
  }
}
const edgeStyle = (e: GraphEdgeModel<EdgeData>): GraphStyle =>
  e.data?.derived
    ? { color: 'var(--text-secondary)', dashed: true }
    : { color: 'var(--section-storymap)' }

// ---- actions ----
function toast(message: string): void {
  Notify.create({
    type: 'warning',
    message,
    position: 'bottom',
    timeout: 4000,
    actions: [
      { icon: 'close', color: 'white', round: true, 'aria-label': t('timelineView.cancel') },
    ],
  })
}
function guard(): boolean {
  if (editable.value) return true
  toast(t(noticeKey.value ?? 'storymap.readOnly'))
  return false
}
async function apply(op: Parameters<typeof store.edit>[0]): Promise<boolean> {
  if (!guard()) return false
  const ok = await store.edit(op)
  if (!ok) toast(t('storymap.rejected.failed'))
  return ok
}

const canConnect = (from: string, to: string): CanConnectResult =>
  view.value.arrows.some((a) => a.from === from && a.to === to)
    ? { ok: false, reason: t('storymap.rejected.duplicate') }
    : { ok: true }

function onConnect(from: string, to: string): void {
  void apply((m) => connect(m, newId(), from, to))
}
function onDisconnect(id: string): void {
  if (id.startsWith('auto:')) return toast(t('storymap.rejected.derived'))
  void apply((m) => disconnect(m, id))
}
const onMove = (id: string, x: number, y: number) =>
  void apply((m) => moveBox(m, id, Math.round(x), Math.round(y)))

function onSelect(id: string | null): void {
  selectedBoxId.value = id
  selectedArrowId.value = null
}
function onSelectEdge(id: string | null): void {
  if (!id) return
  selectedArrowId.value = id
  selectedBoxId.value = null
}
watch(view, (m) => {
  const box = selectedBoxId.value
  if (box && !m.boxes.some((b) => b.id === box)) selectedBoxId.value = null
  const arrow = selectedArrowId.value
  if (arrow && !m.arrows.some((a) => a.id === arrow) && !derived.value.some((a) => a.id === arrow))
    selectedArrowId.value = null
})

async function onOpen(id: string): Promise<void> {
  const box = view.value.boxes.find((b) => b.id === id)
  if (!box) return
  onSelect(id)
  if (box.kind === 'beat') {
    await nextTick()
    document.getElementById('storymap-beat-text')?.focus()
    return
  }
  const item = items.itemOf(box)
  if (!item || item.trashed) return toast(t('storymap.inspector.openGone'))
  await openTarget({ id: item.id, kind: item.type })
}

async function addBeatAfter(afterId: string | null): Promise<void> {
  if (!guard()) return
  const boxes = view.value.boxes
  const after = boxes.find((b) => b.id === afterId)
  let x = after ? after.x : Math.min(0, ...boxes.map((b) => b.x))
  let y = after ? after.y + Y_STEP : Math.max(-Y_STEP, ...boxes.map((b) => b.y)) + Y_STEP
  while (boxes.some((b) => Math.abs(b.x - x) < BOX_W && Math.abs(b.y - y) < BOX_H)) y += Y_STEP
  const id = newId()
  if (!(await apply((m) => addBeat(m, { id, text: t('storymap.newBeat'), x, y })))) return
  onSelect(id)
  if (display.value === 'canvas') {
    await nextTick()
    setTimeout(() => void canvas.value?.focusNode(id, { reveal: true }), 60)
  }
}

const pendingDelete = ref<{ id: string; count: number } | null>(null)
function onDelete(id: string, count: number): void {
  if (!guard()) return
  const box = view.value.boxes.find((b) => b.id === id)
  if (!box) return
  if (box.kind === 'item' && items.stateOf(box) !== 'deleted')
    return toast(t('storymap.rejected.itemBox'))
  if (count === 0) return removeById(id)
  pendingDelete.value = { id, count }
}
function removeById(id: string): void {
  pendingDelete.value = null
  if (selectedBoxId.value === id) selectedBoxId.value = null
  void apply((m) => removeBox(m, id))
}

// Fit when the first box appears (the canvas was not mounted while empty).
watch(
  () => nodes.value.length > 0,
  (has) => {
    if (has) setTimeout(() => canvas.value?.fit(), 80)
  },
)

// ---- play-through ----
const playOpen = ref(false)
const startId = ref<string | null>(null)
const model = shallowRef<StoryModel | null>(null)
const runKey = ref(0)
const starts = computed(() => startBoxes(view.value))
const startOptions = computed(() => {
  const marked = starts.value.implicit ? new Set<string>() : new Set(starts.value.ids)
  const label = (n: GraphNodeModel<BoxData>) => {
    const d = n.data!
    return d.box.kind === 'beat'
      ? d.box.text.trim() || t('storymap.emptyBeat')
      : (d.item?.title ?? t('storymap.badge.deleted'))
  }
  const opt = (n: GraphNodeModel<BoxData>) => ({
    value: n.id,
    label: marked.has(n.id) ? t('storymap.startOption', { title: label(n) }) : label(n),
  })
  return [
    ...nodes.value.filter((n) => marked.has(n.id)).map(opt),
    ...nodes.value.filter((n) => !marked.has(n.id)).map(opt),
  ]
})
async function rebuild(): Promise<void> {
  model.value = await build()
  runKey.value++
}
async function togglePlay(): Promise<void> {
  playOpen.value = !playOpen.value
  if (!playOpen.value) return
  if (!startId.value || !view.value.boxes.some((b) => b.id === startId.value))
    startId.value = starts.value.ids[0] ?? null
  await rebuild()
}
watch(startId, () => {
  if (playOpen.value) void rebuild()
})
</script>

<template>
  <section class="story-map" :aria-label="t('storymap.title')">
    <div class="toolbar" role="toolbar" :aria-label="t('storymap.toolbar')">
      <div class="group" role="group" :aria-label="t('timelineView.displayLabel')">
        <button
          v-for="d in ['canvas', 'list'] as const"
          :key="d"
          type="button"
          class="seg"
          :aria-pressed="display === d"
          @click="display = d"
        >
          {{ t(`timelineView.${d}`) }}
        </button>
      </div>
      <QBtn
        outline
        dense
        no-caps
        icon="sticky_note_2"
        :label="t('storymap.addBeat')"
        :disable="!editable"
        @click="addBeatAfter(selectedBoxId)"
      />
      <QSelect
        v-if="allRoutes.length"
        v-model="routeFilter"
        class="route-filter"
        dense
        outlined
        emit-value
        map-options
        :options="routeOptions"
        :label="t('storymap.routeFilter')"
      />
      <template v-if="display === 'canvas' && nodes.length">
        <QBtn
          outline
          dense
          round
          icon="fit_screen"
          :aria-label="t('timelineView.fit')"
          :title="t('timelineView.fit')"
          @click="canvas?.fit()"
        />
        <QBtn
          outline
          dense
          round
          icon="remove"
          :aria-label="t('timelineView.zoomOut')"
          :title="t('timelineView.zoomOut')"
          @click="canvas?.zoomOut()"
        />
        <QBtn
          outline
          dense
          round
          icon="add"
          :aria-label="t('timelineView.zoomIn')"
          :title="t('timelineView.zoomIn')"
          @click="canvas?.zoomIn()"
        />
      </template>
      <QBtn
        class="play-btn"
        unelevated
        dense
        no-caps
        icon="play_arrow"
        :label="t('storymap.play')"
        :aria-pressed="playOpen"
        :disable="!nodes.length"
        @click="togglePlay"
      />
    </div>
    <p v-if="noticeKey" class="ro" role="alert">
      {{ t(noticeKey) }}
      <code v-if="store.error?.message">{{ store.error.message }}</code>
    </p>
    <p v-else-if="project.readOnly" class="ro">{{ t('storymap.readOnly') }}</p>

    <div class="body">
      <div class="stage">
        <div v-if="!nodes.length" class="empty">
          <h2>{{ t('storymap.emptyTitle') }}</h2>
          <p>{{ t('storymap.emptyBody') }}</p>
        </div>
        <div v-else-if="display === 'list'" class="fill list">
          <GraphList
            :nodes="nodes"
            :edges="edges"
            :can-connect="canConnect"
            :node-style="nodeStyle"
            :edge-style="edgeStyle"
            @connect="onConnect"
            @disconnect="onDisconnect"
            @open="onOpen"
            @add="addBeatAfter"
            @delete="onDelete"
            @rejected="toast"
          >
            <template #node="{ node }">
              <StoryBoxBody v-if="node.data" :data="node.data" />
            </template>
          </GraphList>
        </div>
        <GraphCanvas
          v-else
          ref="canvas"
          class="fill"
          :nodes="nodes"
          :edges="edges"
          :can-connect="canConnect"
          :node-style="nodeStyle"
          :edge-style="edgeStyle"
          :draggable="editable"
          :selected-id="selectedBoxId"
          route-back-edges
          @select="onSelect"
          @select-edge="onSelectEdge"
          @move="onMove"
          @connect="onConnect"
          @disconnect="onDisconnect"
          @open="onOpen"
          @add="addBeatAfter"
          @delete="onDelete"
          @rejected="toast"
        >
          <template #node="{ node }">
            <StoryBoxBody v-if="node.data" :data="node.data" />
          </template>
        </GraphCanvas>
      </div>
      <div v-if="playOpen" class="side play-panel">
        <div class="picker">
          <QSelect
            v-model="startId"
            dense
            outlined
            emit-value
            map-options
            :options="startOptions"
            :label="t('storymap.startFrom')"
          />
          <p v-if="starts.implicit" class="note">{{ t('storymap.implicitStart') }}</p>
        </div>
        <StoryPlaythroughPanel
          v-if="model && startId"
          :key="runKey"
          :model="model"
          :start="{ boxId: startId }"
          @close="playOpen = false"
        />
      </div>
    </div>

    <QDialog :model-value="!!pendingDelete" @update:model-value="pendingDelete = null">
      <QCard v-if="pendingDelete" class="confirm" role="alertdialog" aria-labelledby="sm-del-title">
        <QCardSection>
          <h2 id="sm-del-title" class="confirm-title">{{ t('storymap.delete.title') }}</h2>
          <p>{{ t('storymap.delete.body', { n: pendingDelete.count }, pendingDelete.count) }}</p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn
            flat
            no-caps
            autofocus
            :label="t('storymap.delete.cancel')"
            @click="pendingDelete = null"
          />
          <QBtn
            unelevated
            no-caps
            color="negative"
            :label="t('storymap.delete.confirm')"
            @click="removeById(pendingDelete.id)"
          />
        </QCardActions>
      </QCard>
    </QDialog>
  </section>
</template>

<style scoped>
.story-map {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}
.group {
  display: inline-flex;
}
.seg {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.seg + .seg {
  border-inline-start: 0;
}
.seg:first-child {
  border-radius: 0.375rem 0 0 0.375rem;
}
.seg:last-child {
  border-radius: 0 0.375rem 0.375rem 0;
}
.seg[aria-pressed='true'] {
  background: var(--section-storymap);
  border-color: var(--section-storymap);
  color: var(--section-storymap-on);
}
.seg:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.route-filter {
  min-width: 12rem;
}
.play-btn {
  margin-inline-start: auto;
  background: var(--section-storymap);
  color: var(--section-storymap-on);
}
.ro {
  margin: 0;
  padding: 0.25rem 0.75rem;
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.ro code {
  display: block;
  overflow-wrap: anywhere;
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.stage {
  position: relative;
  flex: 1;
  min-width: 0;
}
.side {
  flex: none;
  width: min(24rem, 40%);
  border-inline-start: 1px solid var(--border);
}
.play-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-panel);
}
.picker {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.note {
  margin: 0.25rem 0 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.fill {
  position: absolute;
  inset: 0;
}
.list {
  overflow: auto;
}
.empty {
  position: absolute;
  inset-block-start: 35%;
  inset-inline: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1.5rem;
  text-align: center;
  color: var(--text-secondary);
}
.empty h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.125rem;
}
.empty p {
  max-width: 28rem;
  margin: 0;
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
