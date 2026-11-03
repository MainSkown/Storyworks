<script setup lang="ts" generic="ND = unknown, ED = unknown">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  VueFlow,
  getBezierPath,
  useVueFlow,
  type Connection,
  type Edge,
  type EdgeMouseEvent,
  type Node,
  type NodeDragEvent,
  type NodeMouseEvent,
} from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import { backEdgePath, isBackEdge } from './edgePath'
import {
  connectReduce,
  keyToAction,
  nearestAny,
  nearestInDirection,
  nudgeDelta,
  type Box,
  type ConnectEffect,
  type ConnectState,
} from './keyboard'
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type CanConnect,
  type GraphEdgeModel,
  type GraphNodeModel,
  type GraphStyle,
} from './types'

const props = withDefaults(
  defineProps<{
    nodes: GraphNodeModel<ND>[]
    edges: GraphEdgeModel<ED>[]
    canConnect?: CanConnect
    nodeStyle?: (node: GraphNodeModel<ND>) => GraphStyle
    edgeStyle?: (edge: GraphEdgeModel<ED>) => GraphStyle
    nudgeStep?: number
    /** false: positions are computed by the parent, nodes cannot be moved. */
    draggable?: boolean
    selectedId?: string | null
    /** Back/self edges loop around the nodes; labels stay readable when zoomed out. */
    routeBackEdges?: boolean
  }>(),
  {
    canConnect: () => ({ ok: true as const }),
    nodeStyle: () => ({}),
    edgeStyle: () => ({}),
    nudgeStep: 10,
    draggable: true,
    selectedId: null,
    routeBackEdges: false,
  },
)

const emit = defineEmits<{
  move: [id: string, x: number, y: number]
  connect: [from: string, to: string]
  disconnect: [edgeId: string]
  open: [id: string]
  /** A node was clicked (id) or the empty canvas was (null). */
  select: [id: string | null]
  /** `afterId` is the focused node, or null. The parent creates the node. */
  add: [afterId: string | null]
  /** The parent confirms first when the node still has connections. */
  delete: [id: string, connectionCount: number]
  /** A connect attempt was refused; `reason` is ready to show in a toast. */
  rejected: [reason: string]
}>()

defineSlots<{
  node?: (p: { node: GraphNodeModel<ND>; focused: boolean }) => unknown
  /** Drawn behind the nodes, in screen space; position with the viewport values. */
  overlay?: (p: { x: number; y: number; zoom: number }) => unknown
}>()

const { t } = useI18n()
const uid = useId()
const flowId = `graph-${uid}`
const hintId = `${uid}-hint`
const { viewport, setCenter, fitView, zoomIn, zoomOut } = useVueFlow(flowId)

const rootEl = ref<HTMLElement | null>(null)
const announcement = ref('')
const activeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)
const connectState = ref<ConnectState>({ mode: 'idle' })
let focusWithin = false

const nodeById = computed(() => new Map(props.nodes.map((n) => [n.id, n])))
const degrees = computed(() => {
  const m = new Map<string, { out: number; in: number }>()
  for (const n of props.nodes) m.set(n.id, { out: 0, in: 0 })
  for (const e of props.edges) {
    const f = m.get(e.from)
    const to = m.get(e.to)
    if (f) f.out++
    if (to) to.in++
  }
  return m
})
const boxes = computed<Box[]>(() =>
  props.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    w: n.width ?? DEFAULT_NODE_WIDTH,
    h: n.height ?? DEFAULT_NODE_HEIGHT,
  })),
)
let prevBoxes: Box[] = []

const tabbableId = computed(() =>
  activeId.value && nodeById.value.has(activeId.value)
    ? activeId.value
    : (props.nodes[0]?.id ?? null),
)

const flowNodes = computed<Node[]>(() =>
  props.nodes.map((n) => ({
    id: n.id,
    type: 'graph',
    position: { x: n.x, y: n.y },
    data: {},
    draggable: props.draggable,
    focusable: false,
  })),
)
const flowEdges = computed<Edge[]>(() =>
  props.edges.map((e) => {
    const s = props.edgeStyle(e)
    const color = s.color ?? 'var(--border-strong)'
    return {
      id: e.id,
      ...(props.routeBackEdges ? { type: 'graph' } : {}),
      source: e.from,
      target: e.to,
      label: e.label,
      selected: e.id === selectedEdgeId.value,
      focusable: false,
      interactionWidth: 20,
      style: {
        stroke: color,
        strokeDasharray: s.dashed ? '6 4' : undefined,
        opacity: s.dimmed ? 0.25 : undefined,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    }
  }),
)

// Edge drawing (opt-in): forward edges stay Bezier curves, back edges go round the nodes.
const MAX_LABEL = 24
const labelScale = computed(() => Math.min(2.5, Math.max(1, 1 / viewport.value.zoom)))
const backLanes = computed(() => {
  const lanes = new Map<string, number>()
  let i = 0
  for (const e of props.edges) {
    const a = nodeById.value.get(e.from)
    const b = nodeById.value.get(e.to)
    if (!a || !b) continue
    if (b.x <= a.x + (a.width ?? DEFAULT_NODE_WIDTH)) lanes.set(e.id, i++ % 4)
  }
  return lanes
})
interface EdgeSlot {
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  label?: unknown
}
function edgeGeometry(e: EdgeSlot) {
  const s = { x: e.sourceX, y: e.sourceY }
  const t = { x: e.targetX, y: e.targetY }
  if (isBackEdge(s, t)) {
    const r = backEdgePath(s, t, boxes.value, { lane: backLanes.value.get(e.id) ?? 0 })
    return { path: r.path, x: r.labelX, y: r.labelY }
  }
  const [path, x, y] = getBezierPath({
    sourceX: e.sourceX,
    sourceY: e.sourceY,
    sourcePosition: e.sourcePosition,
    targetX: e.targetX,
    targetY: e.targetY,
    targetPosition: e.targetPosition,
  })
  return { path, x, y }
}
function labelText(label: unknown): string {
  const s = String(label ?? '')
  return s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s
}

function nodeLabel(id: string): string {
  return nodeById.value.get(id)?.label ?? id
}
function ariaLabel(n: GraphNodeModel<ND>): string {
  const d = degrees.value.get(n.id) ?? { out: 0, in: 0 }
  return t('graph.node.label', { label: n.label, out: d.out, in: d.in })
}
function nodeCss(n: GraphNodeModel<ND>) {
  const s = props.nodeStyle(n)
  return {
    width: `${n.width ?? DEFAULT_NODE_WIDTH}px`,
    minHeight: `${n.height ?? DEFAULT_NODE_HEIGHT}px`,
    '--gcolor': s.color ?? 'var(--border-strong)',
    borderStyle: s.dashed ? 'dashed' : 'solid',
    opacity: s.dimmed ? 0.35 : undefined,
  }
}

function announce(msg: string) {
  announcement.value = ''
  void nextTick(() => (announcement.value = msg))
}

function nodeEl(id: string): HTMLElement | null {
  return rootEl.value?.querySelector<HTMLElement>(`[data-graph-node="${CSS.escape(id)}"]`) ?? null
}

function ensureVisible(id: string) {
  const b = boxes.value.find((x) => x.id === id)
  const root = rootEl.value
  if (!b || !root) return
  const { x: vx, y: vy, zoom } = viewport.value
  const sx = b.x * zoom + vx
  const sy = b.y * zoom + vy
  const inside =
    sx >= 0 &&
    sy >= 0 &&
    sx + b.w * zoom <= root.clientWidth &&
    sy + b.h * zoom <= root.clientHeight
  if (!inside) void setCenter(b.x + b.w / 2, b.y + b.h / 2, { zoom, duration: ms(150) })
}

/** Brings a node into view with its linked nodes, without zooming out below a readable size. */
function reveal(id: string) {
  const b = boxes.value.find((x) => x.id === id)
  const root = rootEl.value
  if (!b || !root) return
  const { x: vx, y: vy, zoom } = viewport.value
  const pad = 40
  const inside =
    b.x * zoom + vx >= pad &&
    b.y * zoom + vy >= pad &&
    (b.x + b.w) * zoom + vx <= root.clientWidth - pad &&
    (b.y + b.h) * zoom + vy <= root.clientHeight - pad
  if (inside) return
  const linked = new Set([id])
  for (const e of props.edges) {
    if (e.from === id) linked.add(e.to)
    else if (e.to === id) linked.add(e.from)
  }
  const group = boxes.value.filter((x) => linked.has(x.id))
  const x0 = Math.min(...group.map((g) => g.x))
  const y0 = Math.min(...group.map((g) => g.y))
  const x1 = Math.max(...group.map((g) => g.x + g.w))
  const y1 = Math.max(...group.map((g) => g.y + g.h))
  const margin = 80
  const fitZoom = Math.min(
    root.clientWidth / (x1 - x0 + margin * 2),
    root.clientHeight / (y1 - y0 + margin * 2),
  )
  const minZoom = Math.min(zoom, 0.55)
  const z = Math.min(zoom, Math.max(minZoom, fitZoom))
  const whole = fitZoom >= minZoom
  void setCenter(
    whole ? (x0 + x1) / 2 : b.x + b.w / 2,
    whole ? (y0 + y1) / 2 : b.y + b.h / 2,
    { zoom: z, duration: ms(200) },
  )
}

/** Viewport animation length; none when the user prefers reduced motion. */
const ms = (n: number) => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : n)

/** Centres the viewport on a node (keeps the zoom). */
function centerOn(id: string, duration = 200) {
  const b = boxes.value.find((x) => x.id === id)
  if (b)
    void setCenter(b.x + b.w / 2, b.y + b.h / 2, {
      zoom: viewport.value.zoom,
      duration: ms(duration),
    })
}

async function focusNode(id: string, opts: { reveal?: boolean } = {}) {
  activeId.value = id
  await nextTick()
  // A node added a moment ago is rendered by Vue Flow a frame or two later.
  for (let i = 0; i < 10 && !nodeEl(id); i++) await new Promise((r) => requestAnimationFrame(r))
  nodeEl(id)?.focus({ preventScroll: true })
  if (opts.reveal) reveal(id)
  else ensureVisible(id)
}

function onFocusin(e: FocusEvent) {
  focusWithin = true
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-graph-node]')?.dataset.graphNode
  if (id) activeId.value = id
}
function onFocusout(e: FocusEvent) {
  if (!rootEl.value?.contains(e.relatedTarget as HTMLElement | null)) focusWithin = false
}

function runEffect(effect: ConnectEffect | null) {
  if (!effect) return
  switch (effect.type) {
    case 'started':
      announce(t('graph.connect.started', { label: nodeLabel(effect.from) }))
      break
    case 'target': {
      const st = connectState.value
      let msg = t('graph.connect.target', { label: nodeLabel(effect.id) })
      if (st.mode === 'connecting') {
        const res = props.canConnect(st.from, effect.id)
        if (!res.ok) msg += ` ${t('graph.connect.rejected', { reason: res.reason })}`
      }
      announce(msg)
      break
    }
    case 'connect':
      emit('connect', effect.from, effect.to)
      announce(t('graph.connect.done', { from: nodeLabel(effect.from), to: nodeLabel(effect.to) }))
      break
    case 'rejected': {
      const msg = effect.reason ?? t('graph.connect.self')
      emit('rejected', msg)
      announce(effect.reason ? t('graph.connect.rejected', { reason: effect.reason }) : msg)
      break
    }
    case 'cancelled':
      announce(t('graph.connect.cancelled'))
      break
  }
}

function dispatchConnect(action: Parameters<typeof connectReduce>[1]) {
  const r = connectReduce(connectState.value, action, props.canConnect)
  connectState.value = r.state
  runEffect(r.effect)
}

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return
  const connecting = connectState.value.mode === 'connecting'
  const action = keyToAction(e, connecting)
  if (!action) return
  const nodeId = target.closest<HTMLElement>('[data-graph-node]')?.dataset.graphNode ?? null

  if (action.type === 'delete' && !nodeId) {
    if (!selectedEdgeId.value) return
    e.preventDefault()
    emit('disconnect', selectedEdgeId.value)
    selectedEdgeId.value = null
    announce(t('graph.edge.removed'))
    return
  }
  if (!nodeId) return
  e.preventDefault()

  switch (action.type) {
    case 'focus': {
      const from = connectState.value.mode === 'connecting' ? connectState.value.target : nodeId
      const next = nearestInDirection(boxes.value, from, action.dir)
      if (!next) return
      if (connectState.value.mode === 'connecting') dispatchConnect({ type: 'target', id: next })
      void focusNode(next)
      break
    }
    case 'nudge': {
      const b = boxes.value.find((x) => x.id === nodeId)
      if (!b) return
      const { dx, dy } = nudgeDelta(action.dir, props.nudgeStep)
      emit('move', nodeId, b.x + dx, b.y + dy)
      announce(t('graph.moved', { label: nodeLabel(nodeId) }))
      break
    }
    case 'open':
      emit('open', nodeId)
      break
    case 'add':
      emit('add', nodeId)
      break
    case 'delete':
      emit('delete', nodeId, props.edges.filter((x) => x.from === nodeId || x.to === nodeId).length)
      break
    case 'connect':
      dispatchConnect({ type: 'start', from: nodeId })
      break
    case 'confirm':
      dispatchConnect({ type: 'confirm' })
      break
    case 'cancel':
      dispatchConnect({ type: 'cancel' })
      break
  }
}

// Refused connections are reported (so the parent can say why) instead of silently not snapping.
function onConnect(c: Connection) {
  const res = props.canConnect(c.source, c.target)
  if (res.ok) emit('connect', c.source, c.target)
  else emit('rejected', res.reason)
}
function onDragStop(e: NodeDragEvent) {
  emit('move', e.node.id, Math.round(e.node.position.x), Math.round(e.node.position.y))
}
function onNodeClick(e: NodeMouseEvent) {
  selectedEdgeId.value = null
  emit('select', e.node.id)
}
function onPaneClick() {
  selectedEdgeId.value = null
  emit('select', null)
}
function selectEdge(id: string) {
  selectedEdgeId.value = id
  rootEl.value?.focus({ preventScroll: true })
  const m = props.edges.find((x) => x.id === id)
  if (m) announce(t('graph.edge.selected', { from: nodeLabel(m.from), to: nodeLabel(m.to) }))
}
const onEdgeClick = (e: EdgeMouseEvent) => selectEdge(e.edge.id)

watch(
  () => props.nodes,
  (nodes) => {
    const ids = new Set(nodes.map((n) => n.id))
    const cs = connectState.value
    if (cs.mode === 'connecting' && (!ids.has(cs.from) || !ids.has(cs.target))) {
      connectState.value = { mode: 'idle' }
    }
    if (activeId.value && !ids.has(activeId.value)) {
      const next = nearestAny(prevBoxes, activeId.value) ?? nodes[0]?.id ?? null
      activeId.value = next
      if (next && focusWithin) void focusNode(next)
    }
    prevBoxes = boxes.value
  },
  { immediate: true },
)
watch(
  () => props.edges,
  (edges) => {
    if (selectedEdgeId.value && !edges.some((e) => e.id === selectedEdgeId.value)) {
      selectedEdgeId.value = null
    }
  },
)

const fit = () => fitView({ padding: 0.2, maxZoom: 1, duration: ms(150) })
defineExpose({
  focusNode,
  centerOn,
  announce,
  fit,
  zoomIn: () => zoomIn({ duration: ms(100) }),
  zoomOut: () => zoomOut({ duration: ms(100) }),
})
</script>

<template>
  <div
    ref="rootEl"
    class="graph-canvas"
    role="group"
    tabindex="-1"
    :aria-label="t('graph.canvas.label')"
    :aria-describedby="hintId"
    @keydown="onKeydown"
    @focusin="onFocusin"
    @focusout="onFocusout"
  >
    <p :id="hintId" class="sr-only">{{ t('graph.canvas.hint') }}</p>
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ announcement }}
    </div>
    <div class="overlay" aria-hidden="true">
      <slot name="overlay" :x="viewport.x" :y="viewport.y" :zoom="viewport.zoom" />
    </div>
    <VueFlow
      :id="flowId"
      :nodes="flowNodes"
      :edges="flowEdges"
      :disable-keyboard-a11y="true"
      :nodes-focusable="false"
      :edges-focusable="false"
      :delete-key-code="null"
      :nodes-draggable="draggable"
      :fit-view-on-init="true"
      :min-zoom="0.2"
      :max-zoom="2"
      @connect="onConnect"
      @node-drag-stop="onDragStop"
      @node-click="onNodeClick"
      @edge-click="onEdgeClick"
      @pane-click="onPaneClick"
    >
      <template #edge-graph="e">
        <BaseEdge
          :id="e.id"
          :path="edgeGeometry(e).path"
          :marker-end="e.markerEnd"
          :style="e.style"
          :interaction-width="e.interactionWidth"
        />
        <EdgeLabelRenderer v-if="e.label">
          <div
            class="elabel nodrag nopan"
            :class="{ 'is-selected': e.selected }"
            aria-hidden="true"
            :style="{
              transform: `translate(-50%, -50%) translate(${edgeGeometry(e).x}px, ${edgeGeometry(e).y}px) scale(${labelScale})`,
            }"
            @click.stop="selectEdge(e.id)"
          >
            {{ labelText(e.label) }}
          </div>
        </EdgeLabelRenderer>
      </template>
      <template #node-graph="{ id }">
        <div
          v-if="nodeById.get(id)"
          class="gnode"
          :class="{
            'is-selected': selectedId === id,
            'is-source': connectState.mode === 'connecting' && connectState.from === id,
            'is-target':
              connectState.mode === 'connecting' &&
              connectState.target === id &&
              connectState.from !== id,
          }"
          role="button"
          :data-graph-node="id"
          :tabindex="tabbableId === id ? 0 : -1"
          :aria-label="ariaLabel(nodeById.get(id)!)"
          :style="nodeCss(nodeById.get(id)!)"
          @dblclick="emit('open', id)"
        >
          <Handle type="target" :position="Position.Left" />
          <slot name="node" :node="nodeById.get(id)!" :focused="activeId === id">
            {{ nodeById.get(id)!.label }}
          </slot>
          <Handle type="source" :position="Position.Right" />
        </div>
      </template>
    </VueFlow>
  </div>
</template>

<style scoped>
.graph-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  background: var(--bg-app);
  color: var(--text-primary);
  outline: none;
}
.graph-canvas :deep(.vue-flow) {
  background: transparent;
}
.gnode {
  box-sizing: border-box;
  padding: 0.5rem 0.75rem;
  border-width: 1px 1px 1px 4px;
  border-color: var(--border-strong);
  border-left-color: var(--gcolor);
  border-radius: 6px;
  background: var(--bg-raised);
  color: var(--text-primary);
  font: inherit;
  cursor: grab;
}
.gnode:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.gnode.is-selected {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.gnode.is-source {
  outline: 2px dashed var(--focus-ring);
  outline-offset: 2px;
}
.gnode.is-target {
  background: var(--bg-selected);
}
.graph-canvas :deep(.vue-flow__handle) {
  width: 8px;
  height: 8px;
  border: 1px solid var(--border-strong);
  background: var(--bg-sheet);
}
.graph-canvas :deep(.vue-flow__edge-path) {
  stroke-width: 2;
}
.graph-canvas :deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke-width: 4;
}
.graph-canvas :deep(.vue-flow__edge-textbg) {
  fill: var(--bg-app);
}
.graph-canvas :deep(.vue-flow__edge-text) {
  fill: var(--text-secondary);
  font-size: 11px;
}
.elabel {
  position: absolute;
  padding: 2px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--bg-raised);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.3;
  white-space: nowrap;
  pointer-events: all;
  cursor: pointer;
}
.elabel.is-selected {
  border-color: var(--focus-ring);
  border-width: 2px;
}
.graph-canvas :deep(.vue-flow__edge-labels) {
  z-index: 10;
}
.graph-canvas :deep(.vue-flow__connection-path) {
  stroke: var(--focus-ring);
  stroke-width: 2;
}
.overlay {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
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
