<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { formatDate, toOrdinal, validateDate } from '../../calendar'
import { pendingNodeJump, takePendingNodeJump } from '../../composables/useJump'
import { useSettingsStore } from '../../settings/store'
import { useProjectStore } from '../../project/store'
import { thinTicks } from '../../timeline/axis'
import { connect } from '../../timeline/graph'
import { datePlacement } from '../../timeline/layout'
import type { TimelineEdge, TimelineNode } from '../../timeline/schema'
import { useTimelinesStore } from '../../timeline/store'
import GraphCanvas from '../graph/GraphCanvas.vue'
import GraphList from '../graph/GraphList.vue'
import type { CanConnectResult, GraphEdgeModel, GraphNodeModel, GraphStyle } from '../graph/types'
import TimelineNodeBody from './TimelineNodeBody.vue'

type View = 'flow' | 'date'
interface CanvasHandle {
  focusNode(id: string): Promise<void>
  centerOn(id: string, duration?: number): void
  fit(): unknown
  zoomIn(): unknown
  zoomOut(): unknown
}

const NODE_W = 200
const NODE_H = 72
const LANE_PAD = 34

const { t, te } = useI18n()
const store = useTimelinesStore()
const project = useProjectStore()
const settings = useSettingsStore()

const tl = computed(() => store.current)
const locked = computed(() => !!project.readOnly)

// Layout (flow/date) is stored in the file; when the file cannot be written it is kept in memory.
const localView = ref<{ id: string; view: View } | null>(null)
const view = computed<View>(() =>
  tl.value && localView.value?.id === tl.value.id
    ? localView.value.view
    : (tl.value?.view ?? 'flow'),
)
function pickView(v: View): void {
  if (!tl.value || v === view.value) return
  localView.value = store.setView(v).ok ? null : { id: tl.value.id, view: v }
}

const display = ref<'canvas' | 'list'>('canvas')
const canvas = ref<CanvasHandle | null>(null)

// ---- model ----
const ordinalOf = (d: TimelineNode['date']) =>
  d && validateDate(store.calendar, d).ok ? toOrdinal(store.calendar, d) : null

const placement = computed(() => {
  const x = tl.value
  if (!x || view.value !== 'date') return null
  const dated = x.nodes.filter((n) => ordinalOf(n.date) !== null).length
  return datePlacement(x.nodes, x.branches, ordinalOf, {
    width: Math.max(1200, dated * 220),
    minGap: NODE_W + 20,
    rowGap: NODE_H + LANE_PAD,
  })
})

const nodes = computed<GraphNodeModel<TimelineNode>[]>(() =>
  (tl.value?.nodes ?? []).map((n) => {
    const p = placement.value?.positions.get(n.id) ?? n.pos
    return {
      id: n.id,
      x: p.x,
      y: p.y,
      label: n.title || t('timelines.untitled'),
      width: NODE_W,
      height: NODE_H,
      data: n,
    }
  }),
)
const edges = computed<GraphEdgeModel<TimelineEdge>[]>(() =>
  (tl.value?.edges ?? []).map((e) => ({ id: e.id, from: e.from, to: e.to, data: e })),
)

const branchById = computed(() => new Map((tl.value?.branches ?? []).map((b) => [b.id, b])))
const nodeById = computed(() => new Map((tl.value?.nodes ?? []).map((n) => [n.id, n])))
const dimNodes = computed(() => (store.filterActive ? store.filterResult?.dimmedNodes : undefined))
const dimEdges = computed(() => (store.filterActive ? store.filterResult?.dimmedEdges : undefined))

function nodeStyle(n: GraphNodeModel<TimelineNode>): GraphStyle {
  const b = n.data?.branchId ? branchById.value.get(n.data.branchId) : undefined
  return {
    color: n.data?.color ?? b?.color ?? 'var(--tag-event)',
    dashed: b?.dashed ?? false,
    dimmed: dimNodes.value?.has(n.id) ?? false,
  }
}
// An edge takes its target node's branch.
function edgeStyle(e: GraphEdgeModel<TimelineEdge>): GraphStyle {
  const id = nodeById.value.get(e.to)?.branchId
  const b = id ? branchById.value.get(id) : undefined
  return { color: b?.color, dashed: b?.dashed ?? false, dimmed: dimEdges.value?.has(e.id) ?? false }
}

// ---- actions ----
function reasonText(reason: string): string {
  const key = `timelines.rejected.${reason}`
  return te(key) ? t(key) : t('timelineView.failed')
}
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

function canConnect(from: string, to: string): CanConnectResult {
  const x = tl.value
  if (!x) return { ok: false, reason: reasonText('no-timeline') }
  const r = connect(x, { id: '', from, to })
  return r.ok ? { ok: true } : { ok: false, reason: reasonText(r.reason) }
}

function onConnect(from: string, to: string): void {
  const r = store.connectNodes(from, to)
  if (!r.ok) toast(reasonText(r.reason))
}
function onDisconnect(edgeId: string): void {
  const r = store.disconnectEdge(edgeId)
  if (!r.ok) toast(reasonText(r.reason))
}
function onMove(id: string, x: number, y: number): void {
  if (view.value !== 'flow') return
  const r = store.moveNode(id, { x: Math.round(x), y: Math.round(y) })
  if (!r.ok) toast(reasonText(r.reason))
}
function onOpen(id: string): void {
  store.selectNode(id)
  if (settings.settings.contextPanel.hidden) settings.setContextPanelHidden(false)
}

async function addEvent(afterId: string | null | undefined): Promise<void> {
  const r = store.addNode({
    afterId,
    connect: !!(afterId === undefined ? store.selectedNodeId : afterId),
  })
  if (!r.ok) return toast(reasonText(r.reason))
  if (display.value === 'canvas') {
    await nextTick()
    // After the button's own focus handling (Quasar refocuses it on release).
    setTimeout(() => void canvas.value?.focusNode(r.id), 60)
  }
}

const pendingDelete = ref<{ id: string; title: string; count: number; links: number } | null>(null)
function onDelete(id: string, count: number): void {
  const links = tl.value ? project.linksBrokenByDeletingNode(tl.value.id, id) : 0
  if (count === 0 && links === 0) return void removeNode(id)
  pendingDelete.value = {
    id,
    count,
    links,
    title: nodeById.value.get(id)?.title || t('timelines.untitled'),
  }
}
async function removeNode(id: string): Promise<void> {
  const r = await store.deleteNode(id)
  if (!r.ok) toast(reasonText(r.reason))
  pendingDelete.value = null
}

function tidy(): void {
  const r = store.tidy()
  if (!r.ok) return toast(reasonText(r.reason))
  void nextTick(() => canvas.value?.fit())
}

// Fit when the first node appears (the canvas was mounted empty).
watch(
  () => nodes.value.length > 0,
  (has) => {
    if (has) setTimeout(() => canvas.value?.fit(), 80)
  },
)

// Jump from a linked passage: centre on the node once the canvas has it.
watch(
  pendingNodeJump,
  async (p) => {
    if (!p) return
    for (let i = 0; i < 30; i++) {
      await nextTick()
      if (store.currentId === p.timelineId && canvas.value && nodes.value.some((n) => n.id === p.nodeId))
        break
      await new Promise((r) => requestAnimationFrame(r))
    }
    if (!takePendingNodeJump(p.timelineId, p.nodeId)) return
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // Vue Flow measures its pane a moment after mounting.
    setTimeout(() => canvas.value?.centerOn(p.nodeId, calm ? 0 : 200), 120)
  },
  { immediate: true },
)

// ---- filters ----
const branchChips = computed(() => [
  { id: null as string | null, name: t('timelines.mainLine'), color: 'var(--tag-event)' },
  ...(tl.value?.branches ?? []).map((b) => ({
    id: b.id as string | null,
    name: b.name,
    color: b.color,
  })),
])
const showFilters = computed(() => store.tags.length > 0 || (tl.value?.branches.length ?? 0) > 0)

// ---- date view overlay ----
const laneName = (key: string) =>
  key === 'main'
    ? t('timelines.mainLine')
    : key === 'undated'
      ? t('timelines.undated')
      : (branchById.value.get(key)?.name ?? key)

const axisTicks = computed(() => {
  const p = placement.value
  if (!p || !tl.value) return []
  return tl.value.nodes.flatMap((n) => {
    const pos = p.positions.get(n.id)
    return n.date && pos && p.laneOf.get(n.id) !== 'undated'
      ? [{ x: pos.x, label: formatDate(store.calendar, n.date) }]
      : []
  })
})
const visibleTicks = (zoom: number) =>
  thinTicks(
    axisTicks.value.map((x) => ({ ...x, x: x.x * zoom })),
    120,
  ).map((x) => ({
    ...x,
    x: x.x / zoom,
  }))
const hasDated = computed(() => !!placement.value?.range)

const canvasKey = computed(() => `${tl.value?.id}:${view.value}`)
</script>

<template>
  <section v-if="tl" class="tl">
    <div class="toolbar" role="toolbar" :aria-label="t('timelineView.toolbar')">
      <div class="group" role="group" :aria-label="t('timelineView.viewLabel')">
        <button
          v-for="v in ['flow', 'date'] as const"
          :key="v"
          type="button"
          class="seg"
          :aria-pressed="view === v"
          @click="pickView(v)"
        >
          {{ t(`timelines.view.${v}`) }}
        </button>
      </div>
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
        icon="add"
        :label="t('timelineView.addEvent')"
        :disable="locked"
        @click="addEvent(undefined)"
      />
      <template v-if="display === 'canvas'">
        <QBtn
          v-if="view === 'flow'"
          outline
          dense
          no-caps
          icon="auto_fix_high"
          :label="t('timelines.tidy')"
          :disable="locked || !nodes.length"
          @click="tidy"
        />
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
    </div>

    <div v-if="showFilters" class="filters" role="group" :aria-label="t('timelineView.filters')">
      <template v-if="store.tags.length">
        <span class="flabel">{{ t('timelines.filterByTag') }}</span>
        <button
          v-for="tag in store.tags"
          :key="tag"
          type="button"
          class="fchip"
          :aria-pressed="store.filter.tags.includes(tag)"
          @click="store.toggleTag(tag)"
        >
          {{ tag }}
        </button>
      </template>
      <template v-if="tl.branches.length">
        <span class="flabel">{{ t('timelines.filterByBranch') }}</span>
        <button
          v-for="b in branchChips"
          :key="b.id ?? 'main'"
          type="button"
          class="fchip"
          :aria-pressed="store.filter.branchIds.includes(b.id)"
          @click="store.toggleBranch(b.id)"
        >
          <span class="dot" :style="{ background: b.color }" />{{ b.name }}
        </button>
      </template>
      <QBtn
        v-if="store.filterActive"
        flat
        dense
        no-caps
        :label="t('timelines.clearFilter')"
        @click="store.clearFilter()"
      />
    </div>

    <div class="stage">
      <div v-if="display === 'list'" class="fill list">
        <GraphList
          :nodes="nodes"
          :edges="edges"
          :can-connect="canConnect"
          :node-style="nodeStyle"
          :edge-style="edgeStyle"
          @connect="onConnect"
          @disconnect="onDisconnect"
          @open="onOpen"
          @add="addEvent"
          @delete="onDelete"
          @rejected="toast"
        >
          <template #node="{ node }"><TimelineNodeBody :node="node" /></template>
        </GraphList>
      </div>
      <GraphCanvas
        v-else
        :key="canvasKey"
        ref="canvas"
        class="fill"
        :nodes="nodes"
        :edges="edges"
        :can-connect="canConnect"
        :node-style="nodeStyle"
        :edge-style="edgeStyle"
        :draggable="view === 'flow' && !locked"
        :selected-id="store.selectedNodeId"
        @select="store.selectNode($event)"
        @move="onMove"
        @connect="onConnect"
        @disconnect="onDisconnect"
        @open="onOpen"
        @add="addEvent"
        @delete="onDelete"
        @rejected="toast"
      >
        <template #node="{ node }"><TimelineNodeBody :node="node" /></template>
        <template v-if="placement" #overlay="{ x, y, zoom }">
          <div
            v-for="(lane, i) in placement.lanes"
            :key="lane.key"
            class="lane"
            :class="{ odd: i % 2 === 1, undated: lane.key === 'undated' }"
            :style="{
              top: `${(lane.y - LANE_PAD) * zoom + y}px`,
              height: `${lane.height * zoom}px`,
            }"
          >
            <span class="lane-name">{{ laneName(lane.key) }}</span>
          </div>
          <div
            v-for="tick in visibleTicks(zoom)"
            :key="`${tick.x}:${tick.label}`"
            class="tick"
            :style="{ left: `${tick.x * zoom + x}px` }"
          >
            <span class="tick-label">{{ tick.label }}</span>
          </div>
          <p v-if="!hasDated && nodes.length" class="nodates">{{ t('timelineView.noDates') }}</p>
        </template>
      </GraphCanvas>
      <div v-if="!nodes.length" class="empty">
        <h2>{{ t('timelineView.emptyTitle') }}</h2>
        <p>{{ t('timelineView.emptyBody') }}</p>
      </div>
    </div>

    <QDialog :model-value="!!pendingDelete" @update:model-value="pendingDelete = null">
      <QCard v-if="pendingDelete" class="confirm" role="alertdialog" aria-labelledby="tl-del-title">
        <QCardSection>
          <h2 id="tl-del-title" class="confirm-title">{{ t('timelineView.deleteEventTitle') }}</h2>
          <p v-if="pendingDelete.count > 0">
            {{
              t('timelineView.deleteEventBody', {
                title: pendingDelete.title,
                n: pendingDelete.count,
              })
            }}
          </p>
          <p v-else>{{ t('timelineView.deleteEventPlain', { title: pendingDelete.title }) }}</p>
          <p v-if="pendingDelete.links > 0">
            {{ t('deleteImpact.links', { n: pendingDelete.links }, pendingDelete.links) }}
          </p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn
            flat
            no-caps
            autofocus
            :label="t('timelineView.cancel')"
            @click="pendingDelete = null"
          />
          <QBtn
            unelevated
            no-caps
            color="negative"
            :label="t('timelineView.delete')"
            @click="removeNode(pendingDelete.id)"
          />
        </QCardActions>
      </QCard>
    </QDialog>
  </section>
  <section v-else class="tl none">
    <p>{{ t(store.entries.length ? 'timelineView.pickOne' : 'timelines.noTimelines') }}</p>
  </section>
</template>

<style scoped>
.tl {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.none {
  padding: 1.5rem;
  color: var(--text-secondary);
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
  font-size: 0.8125rem;
}
.flabel {
  margin-inline-start: 0.5rem;
  color: var(--text-secondary);
}
.flabel:first-child {
  margin-inline-start: 0;
}
.group {
  display: inline-flex;
}
.seg,
.fchip {
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.seg {
  padding: 0.25rem 0.75rem;
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
.seg[aria-pressed='true'],
.fchip[aria-pressed='true'] {
  background: var(--section-timelines);
  border-color: var(--section-timelines);
  color: var(--section-timelines-on);
}
.fchip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.625rem;
  border-radius: 999px;
}
.dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
}
.stage {
  position: relative;
  flex: 1;
  min-height: 0;
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
  inset-block-start: 40%;
  inset-inline: 0;
  text-align: center;
  color: var(--text-secondary);
  pointer-events: none;
}
.empty h2 {
  margin: 0 0 0.25rem;
  color: var(--text-primary);
  font-size: 1.125rem;
}
.lane {
  position: absolute;
  inset-inline: 0;
  border-block-end: 1px solid var(--border);
}
.lane.odd {
  background: color-mix(in srgb, var(--bg-sidebar) 55%, transparent);
}
.lane.undated {
  border-block-start: 2px dashed var(--border-strong);
}
.lane-name {
  position: absolute;
  inset-block-start: 0.25rem;
  inset-inline-start: 0.5rem;
  padding: 0 0.375rem;
  border-radius: 0.25rem;
  background: var(--bg-app);
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.tick {
  position: absolute;
  inset-block: 0;
  border-inline-start: 1px dotted var(--border-strong);
}
.tick-label {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.6875rem;
  white-space: nowrap;
}
.nodates {
  position: absolute;
  inset-block-end: 0.75rem;
  inset-inline: 0;
  margin: 0;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.8125rem;
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
