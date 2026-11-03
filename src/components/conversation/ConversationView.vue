<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import {
  brokenTargets,
  canConnect as canConnectIn,
  connect,
  deleteNode,
  disconnect,
  moveNode,
  toGraph,
  type NodeType,
} from '../../game/conversationGraph'
import { brokenUses } from '../../game/variableUses'
import { newId } from '../../project/ids'
import { useProjectStore } from '../../project/store'
import { findNode } from '../../project/tree'
import type { Conversation, ConversationNode } from '../../project/schemas/conversation'
import { useVariablesStore } from '../../variables/store'
import GraphCanvas from '../graph/GraphCanvas.vue'
import GraphList from '../graph/GraphList.vue'
import type { CanConnectResult, GraphEdgeModel, GraphNodeModel, GraphStyle } from '../graph/types'
import ConversationInspector from './ConversationInspector.vue'
import ConversationNodeBody from './ConversationNodeBody.vue'
import PlaythroughPanel from './PlaythroughPanel.vue'
import { NODE_COLOR, NODE_ICON, NODE_TYPES, useNodeLabel } from './nodeTypes'

interface CanvasHandle {
  focusNode(id: string): Promise<void>
  fit(): unknown
  zoomIn(): unknown
  zoomOut(): unknown
}

const NODE_W = 200
const NODE_H = 72

const props = defineProps<{ conversationId: string }>()
defineSlots<{
  /** Step 7: the play-through panel, shown beside the canvas while `playthroughOpen` is on. */
  playthrough?: (p: { conversation: Conversation; close: () => void }) => unknown
}>()

const { t, te } = useI18n()
const project = useProjectStore()
const vars = useVariablesStore()
const labelOf = useNodeLabel()

const locked = computed(() => !!project.readOnly)
const conv = shallowRef<Conversation | null>(null)
const loadError = ref('')
const selectedId = ref<string | null>(null)
const display = ref<'canvas' | 'list'>('canvas')
const canvas = ref<CanvasHandle | null>(null)
const playthroughOpen = ref(false)

// ---- loading ----
async function load(): Promise<void> {
  const id = props.conversationId
  const r = await project.loadConversation(id)
  if (id !== props.conversationId) return
  if (!r.ok) {
    conv.value = null
    loadError.value = r.error.message
    return
  }
  loadError.value = ''
  // Same content keeps the same object, so open editors are not reset.
  if (!conv.value || JSON.stringify(conv.value) !== JSON.stringify(r.value)) conv.value = r.value
}

const filePath = computed(
  () =>
    (project.project ? findNode(project.project.manifest.manuscript, props.conversationId) : undefined)
      ?.path ?? null,
)
const version = computed(() => (filePath.value ? project.itemVersion(filePath.value) : -1))
watch(
  () => props.conversationId,
  () => {
    conv.value = null
    selectedId.value = null
    playthroughOpen.value = false
    void load()
  },
  { immediate: true },
)
// Snapshot restore, external changes.
watch(version, () => void load())
watch(
  () => conv.value?.nodes.some((n) => n.id === selectedId.value),
  (has) => {
    if (!has) selectedId.value = null
  },
)

// ---- model ----
const graph = computed(() => (conv.value ? toGraph(conv.value) : { nodes: [], edges: [] }))
const nodes = computed<GraphNodeModel<ConversationNode>[]>(() =>
  graph.value.nodes.map((n) => ({
    ...n,
    label: n.data ? labelOf(n.data) : n.label,
    width: NODE_W,
    height: NODE_H,
  })),
)
const edges = computed<GraphEdgeModel[]>(() => graph.value.edges)
const brokenTargetIds = computed(
  () => new Set(conv.value ? brokenTargets(conv.value).map((b) => b.nodeId) : []),
)
const brokenUseIds = computed(
  () => new Set(conv.value ? brokenUses(conv.value, vars.variables).map((b) => b.nodeId) : []),
)

function nodeStyle(n: GraphNodeModel<ConversationNode>): GraphStyle {
  return { color: n.data ? NODE_COLOR[n.data.type] : undefined }
}

// ---- actions ----
function reasonText(reason: string): string {
  const key = `game.conversation.rejected.${reason}`
  return te(key) ? t(key) : t('game.conversation.rejected.failed')
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

/** Shows the change at once, then saves it; a refused save reloads the stored state. */
async function apply(change: (c: Conversation) => Conversation): Promise<void> {
  if (!conv.value) return
  if (locked.value) return toast(t('game.conversation.readOnly'))
  conv.value = change(conv.value)
  if (!(await project.patchConversation(props.conversationId, change))) await load()
}

const canConnect = (from: string, to: string): CanConnectResult => {
  if (!conv.value) return { ok: false, reason: reasonText('unknown-node') }
  const r = canConnectIn(conv.value)(from, to)
  return r.ok ? r : { ok: false, reason: reasonText(r.reason) }
}

function onConnect(from: string, to: string): void {
  const c = conv.value
  if (!c) return
  // From a Choice the drag adds an option; from Lines or Jump it replaces the target.
  const optionId = newId()
  const change = (x: Conversation) => connect(x, from, to, { newOptionId: optionId })
  if (change(c) === c) return toast(reasonText('failed'))
  void apply(change)
}
const onDisconnect = (edgeId: string) => void apply((c) => disconnect(c, edgeId))
const onMove = (id: string, x: number, y: number) =>
  void apply((c) => moveNode(c, id, Math.round(x), Math.round(y)))
const onOpen = (id: string) => (selectedId.value = id)

async function addNodeOf(type: NodeType, afterId: string | null): Promise<void> {
  if (locked.value) return toast(t('game.conversation.readOnly'))
  const id = await project.addConversationNode(props.conversationId, type, { afterId })
  if (!id) return toast(reasonText('failed'))
  await load()
  selectedId.value = id
  if (display.value === 'canvas') {
    await nextTick()
    // After the button's own focus handling (Quasar refocuses it on release).
    setTimeout(() => void canvas.value?.focusNode(id), 60)
  }
}

const pendingDelete = ref<{ id: string; label: string; count: number } | null>(null)
function onDelete(id: string, count: number): void {
  if (locked.value) return toast(t('game.conversation.readOnly'))
  const n = conv.value?.nodes.find((x) => x.id === id)
  if (count === 0) return removeNode(id)
  pendingDelete.value = { id, count, label: n ? labelOf(n) : '' }
}
function removeNode(id: string): void {
  if (selectedId.value === id) selectedId.value = null
  pendingDelete.value = null
  void apply((c) => deleteNode(c, id))
}

// Fit when the first node appears (the canvas was not mounted while empty).
watch(
  () => nodes.value.length > 0,
  (has) => {
    if (has) setTimeout(() => canvas.value?.fit(), 80)
  },
)
</script>

<template>
  <section v-if="conv" class="cv" :aria-label="t('game.conversation.title')">
    <div class="toolbar" role="toolbar" :aria-label="t('game.conversation.toolbar')">
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
      <div class="group adds" role="group" :aria-label="t('game.conversation.addGroup')">
        <QBtn
          v-for="type in NODE_TYPES"
          :key="type"
          outline
          dense
          no-caps
          :icon="NODE_ICON[type]"
          :label="t(`game.conversation.type.${type}`)"
          :aria-label="t('game.conversation.addOf', { type: t(`game.conversation.type.${type}`) })"
          :disable="locked"
          @click="addNodeOf(type, selectedId)"
        />
      </div>
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
        :label="t('game.conversation.play')"
        :aria-pressed="playthroughOpen"
        @click="playthroughOpen = !playthroughOpen"
      />
    </div>
    <p v-if="locked" class="ro">{{ t('game.conversation.readOnly') }}</p>

    <div class="body">
      <div class="stage">
        <div v-if="!nodes.length" class="empty">
          <h2>{{ t('game.conversation.emptyTitle') }}</h2>
          <p>{{ t('game.conversation.emptyBody') }}</p>
          <QBtn
            unelevated
            no-caps
            color="primary"
            icon="add"
            :label="t('game.conversation.addFirst')"
            :disable="locked"
            @click="addNodeOf('lines', null)"
          />
        </div>
        <div v-else-if="display === 'list'" class="fill list">
          <GraphList
            :nodes="nodes"
            :edges="edges"
            :can-connect="canConnect"
            :node-style="nodeStyle"
            @connect="onConnect"
            @disconnect="onDisconnect"
            @open="onOpen"
            @add="addNodeOf('lines', $event)"
            @delete="onDelete"
            @rejected="toast"
          >
            <template #node="{ node }">
              <ConversationNodeBody
                :node="node"
                :start="conv.startNodeId === node.id"
                :broken-target="brokenTargetIds.has(node.id)"
                :broken-use="brokenUseIds.has(node.id)"
              />
            </template>
          </GraphList>
        </div>
        <GraphCanvas
          v-else
          :key="conv.id"
          ref="canvas"
          class="fill"
          :nodes="nodes"
          :edges="edges"
          :can-connect="canConnect"
          :node-style="nodeStyle"
          :draggable="!locked"
          :selected-id="selectedId"
          @select="selectedId = $event"
          @move="onMove"
          @connect="onConnect"
          @disconnect="onDisconnect"
          @open="onOpen"
          @add="addNodeOf('lines', $event)"
          @delete="onDelete"
          @rejected="toast"
        >
          <template #node="{ node }">
            <ConversationNodeBody
              :node="node"
              :start="conv.startNodeId === node.id"
              :broken-target="brokenTargetIds.has(node.id)"
              :broken-use="brokenUseIds.has(node.id)"
            />
          </template>
        </GraphCanvas>
      </div>
      <ConversationInspector
        v-if="selectedId && !playthroughOpen"
        class="side"
        :conversation="conv"
        :node-id="selectedId"
        :editable="!locked"
        @update="apply"
      />
      <div v-if="playthroughOpen" class="side play-panel">
        <slot name="playthrough" :conversation="conv" :close="() => (playthroughOpen = false)">
          <PlaythroughPanel :conversation="conv" @close="playthroughOpen = false" />
        </slot>
      </div>
    </div>

    <QDialog :model-value="!!pendingDelete" @update:model-value="pendingDelete = null">
      <QCard v-if="pendingDelete" class="confirm" role="alertdialog" aria-labelledby="cv-del-title">
        <QCardSection>
          <h2 id="cv-del-title" class="confirm-title">{{ t('game.conversation.delete.title') }}</h2>
          <p>
            {{
              t(
                'game.conversation.delete.body',
                { label: pendingDelete.label, n: pendingDelete.count },
                pendingDelete.count,
              )
            }}
          </p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn
            flat
            no-caps
            autofocus
            :label="t('game.conversation.delete.cancel')"
            @click="pendingDelete = null"
          />
          <QBtn
            unelevated
            no-caps
            color="negative"
            :label="t('game.conversation.delete.confirm')"
            @click="removeNode(pendingDelete.id)"
          />
        </QCardActions>
      </QCard>
    </QDialog>
  </section>
  <section v-else class="cv none">
    <p v-if="loadError" role="alert">
      {{ t('game.conversation.loadFailed') }} <code>{{ loadError }}</code>
    </p>
  </section>
</template>

<style scoped>
.cv {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.none {
  padding: 1.5rem;
  color: var(--text-secondary);
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
.adds {
  gap: 0.25rem;
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
  background: var(--section-write);
  border-color: var(--section-write);
  color: var(--section-write-on);
}
.seg:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.play-btn {
  margin-inline-start: auto;
  background: var(--section-write);
  color: var(--section-write-on);
}
.ro {
  margin: 0;
  padding: 0.25rem 0.75rem;
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-size: 0.8125rem;
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
