<script setup lang="ts" generic="ND = unknown, ED = unknown">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CanConnect, GraphEdgeModel, GraphNodeModel, GraphStyle } from './types'

const props = withDefaults(
  defineProps<{
    nodes: GraphNodeModel<ND>[]
    edges: GraphEdgeModel<ED>[]
    canConnect?: CanConnect
    nodeStyle?: (node: GraphNodeModel<ND>) => GraphStyle
    edgeStyle?: (edge: GraphEdgeModel<ED>) => GraphStyle
    /** Extra outgoing rows per node that are not edges (see the `extra-out` slot). */
    extraOut?: (nodeId: string) => number
  }>(),
  {
    canConnect: () => ({ ok: true as const }),
    nodeStyle: () => ({}),
    edgeStyle: () => ({}),
    extraOut: () => 0,
  },
)

const emit = defineEmits<{
  connect: [from: string, to: string]
  disconnect: [edgeId: string]
  open: [id: string]
  add: [afterId: string | null]
  delete: [id: string, connectionCount: number]
  rejected: [reason: string]
}>()

defineSlots<{
  node?: (p: { node: GraphNodeModel<ND> }) => unknown
  'extra-out'?: (p: { node: GraphNodeModel<ND>; index: number }) => unknown
}>()

const { t } = useI18n()

const labels = computed(() => new Map(props.nodes.map((n) => [n.id, n.label])))
const rows = computed(() =>
  props.nodes.map((n) => ({
    node: n,
    out: props.edges.filter((e) => e.from === n.id),
    inc: props.edges.filter((e) => e.to === n.id),
  })),
)
const label = (id: string) => labels.value.get(id) ?? id

// Pending pick per node and direction, e.g. "a:out".
const picks = ref<Record<string, string | null>>({})
const message = ref<{ key: string; text: string } | null>(null)

function options(id: string, dir: 'out' | 'in') {
  const taken = new Set(
    props.edges
      .filter((e) => (dir === 'out' ? e.from === id : e.to === id))
      .map((e) => (dir === 'out' ? e.to : e.from)),
  )
  return props.nodes
    .filter((n) => n.id !== id && !taken.has(n.id))
    .map((n) => ({ label: n.label, value: n.id }))
}

function addConnection(id: string, dir: 'out' | 'in') {
  const key = `${id}:${dir}`
  const other = picks.value[key]
  if (!other) return
  const [from, to] = dir === 'out' ? [id, other] : [other, id]
  const res = props.canConnect(from, to)
  if (!res.ok) {
    message.value = { key, text: res.reason }
    emit('rejected', res.reason)
    return
  }
  message.value = null
  picks.value[key] = null
  emit('connect', from, to)
}

function edgeColor(e: GraphEdgeModel<ED>) {
  return props.edgeStyle(e).color ?? 'var(--border-strong)'
}
</script>

<template>
  <section class="graph-list" :aria-label="t('graph.list.title')">
    <p v-if="!nodes.length" class="empty">{{ t('graph.list.empty') }}</p>
    <ul v-else class="items">
      <li
        v-for="row in rows"
        :key="row.node.id"
        class="item"
        :style="{ '--gcolor': nodeStyle(row.node).color ?? 'var(--border-strong)' }"
        :class="{ dashed: nodeStyle(row.node).dashed, dimmed: nodeStyle(row.node).dimmed }"
      >
        <header class="head">
          <h3 class="name">
            <slot name="node" :node="row.node">{{ row.node.label }}</slot>
          </h3>
          <div class="actions">
            <QBtn
              flat
              dense
              no-caps
              :label="t('graph.list.open')"
              @click="emit('open', row.node.id)"
            />
            <QBtn
              flat
              dense
              no-caps
              :label="t('graph.list.addAfter')"
              @click="emit('add', row.node.id)"
            />
            <QBtn
              flat
              dense
              no-caps
              :label="t('graph.list.delete')"
              @click="emit('delete', row.node.id, row.out.length + row.inc.length)"
            />
          </div>
        </header>

        <div v-for="dir in ['out', 'in'] as const" :key="dir" class="group">
          <h4 class="group-title">
            {{ dir === 'out' ? t('graph.list.outgoing') : t('graph.list.incoming') }}
          </h4>
          <ul class="conns">
            <li v-for="e in dir === 'out' ? row.out : row.inc" :key="e.id" class="conn">
              <span
                class="swatch"
                :class="{ dashed: edgeStyle(e).dashed }"
                :style="{ borderColor: edgeColor(e) }"
              />
              <span class="conn-label">
                {{ label(dir === 'out' ? e.to : e.from) }}
                <span v-if="e.label" class="edge-label">({{ e.label }})</span>
                <span v-if="edgeStyle(e).dashed" class="sr-only">
                  {{ t('graph.list.dashed') }}</span
                >
              </span>
              <QBtn
                flat
                dense
                round
                icon="close"
                :aria-label="
                  t(dir === 'out' ? 'graph.list.removeOut' : 'graph.list.removeIn', {
                    label: label(dir === 'out' ? e.to : e.from),
                  })
                "
                @click="emit('disconnect', e.id)"
              />
            </li>
            <template v-if="dir === 'out'">
              <li v-for="k in extraOut(row.node.id)" :key="`x${k}`" class="conn">
                <slot name="extra-out" :node="row.node" :index="k - 1" />
              </li>
            </template>
            <li
              v-if="
                !(dir === 'out' ? row.out : row.inc).length &&
                !(dir === 'out' && extraOut(row.node.id))
              "
              class="none"
            >
              {{ t('graph.list.none') }}
            </li>
          </ul>
          <div class="add-row">
            <QSelect
              v-model="picks[`${row.node.id}:${dir}`]"
              dense
              outlined
              emit-value
              map-options
              :options="options(row.node.id, dir)"
              :label="dir === 'out' ? t('graph.list.pickOut') : t('graph.list.pickIn')"
              class="pick"
            />
            <QBtn
              outline
              dense
              no-caps
              :label="t('graph.list.connect')"
              :disable="!picks[`${row.node.id}:${dir}`]"
              @click="addConnection(row.node.id, dir)"
            />
          </div>
          <p v-if="message?.key === `${row.node.id}:${dir}`" class="error" role="alert">
            {{ t('graph.connect.rejected', { reason: message.text }) }}
          </p>
        </div>
      </li>
    </ul>
    <QBtn
      class="add-item"
      outline
      no-caps
      icon="add"
      :label="t('graph.list.addItem')"
      @click="emit('add', null)"
    />
  </section>
</template>

<style scoped>
.graph-list {
  padding: 0.75rem;
  color: var(--text-primary);
}
.items,
.conns {
  margin: 0;
  padding: 0;
  list-style: none;
}
.items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.item {
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-left: 4px solid var(--gcolor);
  border-radius: 6px;
  background: var(--bg-raised);
}
.item.dimmed {
  opacity: 0.45;
}
.item.dashed {
  border-style: dashed;
  border-left-width: 4px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.name {
  margin: 0;
  font-size: 1rem;
}
.group {
  margin-top: 0.5rem;
}
.group-title {
  margin: 0 0 0.25rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
}
.conn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.conn-label {
  flex: 1;
}
.edge-label,
.none {
  color: var(--text-secondary);
}
.swatch {
  width: 1.25rem;
  border-top: 2px solid;
}
.swatch.dashed {
  border-top-style: dashed;
}
.add-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
.pick {
  flex: 1;
  min-width: 0;
}
.error {
  margin: 0.25rem 0 0;
  color: var(--section-checks);
}
.add-item {
  margin-top: 0.75rem;
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
