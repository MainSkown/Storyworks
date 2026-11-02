<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import GraphCanvas from '../components/graph/GraphCanvas.vue'
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type CanConnectResult,
  type GraphEdgeModel,
  type GraphNodeModel,
  type GraphStyle,
} from '../components/graph/types'
import GroupsDialog from '../components/relations/GroupsDialog.vue'
import RelationTypesDialog from '../components/relations/RelationTypesDialog.vue'
import { openEntry } from '../codex/openEntry'
import { useCodexStore } from '../codex/store'
import { filterGraph } from '../relations/filter'
import { computeLayout, groupRegion, regionPath, type XY } from '../relations/layout'
import { useRelationsStore } from '../relations/store'

interface CanvasHandle {
  fit(): unknown
  zoomIn(): unknown
  zoomOut(): unknown
}

const REGION_PADDING = 28
const REGION_RADIUS = 20
const SAVE_DELAY = 500

const { t } = useI18n()
const codex = useCodexStore()
const rel = useRelationsStore()

const display = ref<'canvas' | 'list'>('canvas')
const canvas = ref<CanvasHandle | null>(null)
const selectedId = ref<string | null>(null)
const typesOpen = ref(false)
const groupsOpen = ref(false)
const readOnly = computed(() => !!rel.readOnly)

// ---- data ----
const entryById = computed(() => new Map(codex.entries.map((e) => [e.id, e])))
const typeById = computed(() => new Map(codex.types.map((ty) => [ty.id, ty])))
const relTypeById = computed(() => new Map(rel.types.map((ty) => [ty.id, ty])))

/** Relationships with both ends readable; the rest are counted in the banner. */
const drawable = computed(() =>
  rel.relationships.filter((r) => entryById.value.has(r.fromId) && entryById.value.has(r.toId)),
)
const hiddenCount = computed(() => rel.relationships.length - drawable.value.length)

/** Groups limited to members that exist. */
const liveGroups = computed(() =>
  rel.groups.map((g) => ({
    ...g,
    memberIds: g.memberIds.filter((id) => entryById.value.has(id)),
  })),
)

/** Entries shown at all: those in a relationship or in a group. */
const involvedIds = computed(() => {
  const ids = new Set<string>()
  for (const r of drawable.value) ids.add(r.fromId).add(r.toId)
  for (const g of liveGroups.value) for (const m of g.memberIds) ids.add(m)
  return ids
})
const involvedEntries = computed(() => codex.entries.filter((e) => involvedIds.value.has(e.id)))

// ---- layout: once per data change, never per frame ----
const base = shallowRef<Record<string, XY>>({})
const overrides = shallowRef<Record<string, XY>>({})
let pending: Record<string, XY> = {}
let timer: ReturnType<typeof setTimeout> | undefined

const structureKey = computed(
  () =>
    involvedEntries.value.map((e) => e.id).join(',') +
    '|' +
    drawable.value.map((r) => `${r.fromId}>${r.toId}`).join(',') +
    '|' +
    liveGroups.value.map((g) => `${g.id}:${g.memberIds.join(',')}`).join(';'),
)

function recompute(): void {
  base.value = computeLayout({
    nodes: involvedEntries.value.map((e) => ({ id: e.id })),
    edges: drawable.value.map((r) => ({ from: r.fromId, to: r.toId })),
    groups: liveGroups.value.map((g) => ({ id: g.id, memberIds: g.memberIds })),
    saved: { ...rel.layout, ...pending },
  })
}
watch(structureKey, recompute, { immediate: true })

const positions = computed(() => ({ ...base.value, ...overrides.value }))

function flush(): void {
  clearTimeout(timer)
  const p = pending
  pending = {}
  if (Object.keys(p).length) void rel.savePositions(p)
}
function onMove(id: string, x: number, y: number): void {
  if (readOnly.value) return
  const pos = { x: Math.round(x), y: Math.round(y) }
  // First drag freezes the whole arrangement, so other nodes don't re-flow around it on reopen.
  if (!Object.keys(rel.layout).length && !Object.keys(pending).length)
    pending = { ...positions.value }
  overrides.value = { ...overrides.value, [id]: pos }
  pending[id] = pos
  clearTimeout(timer)
  timer = setTimeout(flush, SAVE_DELAY)
}
onBeforeUnmount(flush)

async function relayout(): Promise<void> {
  if (readOnly.value) return
  clearTimeout(timer)
  pending = {}
  await rel.resetLayout()
  overrides.value = {}
  recompute()
  await nextTick()
  canvas.value?.fit()
}

// ---- filters ----
const fRelation = ref<string[]>([])
const fEntry = ref<string[]>([])
const fGroup = ref<string[]>([])
const filterActive = computed(
  () => fRelation.value.length + fEntry.value.length + fGroup.value.length > 0,
)
function toggle(which: 'relation' | 'entry' | 'group', id: string): void {
  const list = { relation: fRelation, entry: fEntry, group: fGroup }[which]
  list.value = list.value.includes(id) ? list.value.filter((x) => x !== id) : [...list.value, id]
}
function clearFilters(): void {
  fRelation.value = []
  fEntry.value = []
  fGroup.value = []
}

const filtered = computed(() =>
  filterGraph(
    {
      entries: involvedEntries.value.map((e) => ({ id: e.id, typeId: e.typeId })),
      relationships: drawable.value,
      groups: liveGroups.value,
    },
    { relationTypeIds: fRelation.value, entryTypeIds: fEntry.value, groupIds: fGroup.value },
  ),
)

// ---- graph model ----
const nodes = computed<GraphNodeModel<{ typeId: string }>[]>(() =>
  involvedEntries.value
    .filter((e) => filtered.value.visibleEntryIds.has(e.id))
    .map((e) => {
      const p = positions.value[e.id] ?? { x: 0, y: 0 }
      return {
        id: e.id,
        x: p.x,
        y: p.y,
        label: e.name || t('codex.untitled'),
        data: { typeId: e.typeId },
      }
    }),
)
const visibleRelationships = computed(() =>
  drawable.value.filter((r) => filtered.value.visibleRelationshipIds.has(r.id)),
)
const edges = computed<GraphEdgeModel<{ typeId: string }>[]>(() =>
  visibleRelationships.value.map((r) => ({
    id: r.id,
    from: r.fromId,
    to: r.toId,
    label: relTypeById.value.get(r.typeId)?.name ?? '',
    data: { typeId: r.typeId },
  })),
)

function nodeStyle(n: GraphNodeModel<{ typeId: string }>): GraphStyle {
  return {
    color: typeById.value.get(n.data?.typeId ?? '')?.color,
    dimmed: filtered.value.dimmedEntryIds.has(n.id),
  }
}
function edgeStyle(e: GraphEdgeModel<{ typeId: string }>): GraphStyle {
  return { color: relTypeById.value.get(e.data?.typeId ?? '')?.color }
}
const typeName = (typeId: string) => typeById.value.get(typeId)?.name ?? t('codex.noType')
const entryName = (id: string) => entryById.value.get(id)?.name || t('codex.untitled')

// Group regions: hull behind the shown members, with the group name as its label.
const regions = computed(() => {
  const shown = new Set(nodes.value.map((n) => n.id))
  const out: { id: string; name: string; color: string; path: string; lx: number; ly: number }[] =
    []
  for (const g of liveGroups.value) {
    const pts = g.memberIds.filter((id) => shown.has(id)).map((id) => positions.value[id]!)
    if (!pts.length) continue
    const hull = groupRegion(pts, {
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      padding: REGION_PADDING,
    })
    out.push({
      id: g.id,
      name: g.name,
      color: g.color,
      path: regionPath(hull, REGION_RADIUS),
      lx: Math.min(...hull.map((p) => p.x)) + 14,
      ly: Math.min(...hull.map((p) => p.y)) + 20,
    })
  }
  return out
})

// ---- selection / actions ----
const selected = computed(() =>
  selectedId.value && nodes.value.some((n) => n.id === selectedId.value)
    ? (entryById.value.get(selectedId.value) ?? null)
    : null,
)
const selectedGroups = computed(() =>
  selected.value
    ? liveGroups.value
        .filter((g) => g.memberIds.includes(selected.value!.id))
        .map((g) => g.name)
        .join(', ')
    : '',
)

const canConnect = (): CanConnectResult => ({ ok: false, reason: t('relationGraph.cannotConnect') })
function onRejected(message: string): void {
  Notify.create({ type: 'warning', message, position: 'bottom', timeout: 4000 })
}

// ---- list view (equivalent to the canvas for keyboard and screen reader use) ----
const listGroups = computed(() =>
  regions.value.map((r) => ({
    id: r.id,
    name: r.name,
    members: liveGroups.value
      .find((g) => g.id === r.id)!
      .memberIds.filter((id) => nodes.value.some((n) => n.id === id))
      .map(entryName),
  })),
)
</script>

<template>
  <section class="rg">
    <div class="toolbar" role="toolbar" :aria-label="t('relationGraph.toolbar')">
      <QBtn
        flat
        dense
        no-caps
        icon="arrow_back"
        :label="t('relationGraph.back')"
        :to="{ name: 'codex' }"
      />
      <h1 class="title">{{ t('relationGraph.title') }}</h1>
      <div class="group" role="group" :aria-label="t('relationGraph.displayLabel')">
        <button
          v-for="d in ['canvas', 'list'] as const"
          :key="d"
          type="button"
          class="seg"
          :aria-pressed="display === d"
          @click="display = d"
        >
          {{ t(d === 'list' ? 'relationGraph.listButton' : 'relationGraph.canvas') }}
        </button>
      </div>
      <QBtn
        flat
        dense
        no-caps
        icon="swap_horiz"
        :label="t('relationGraph.relationTypes')"
        @click="typesOpen = true"
      />
      <QBtn
        flat
        dense
        no-caps
        icon="workspaces"
        :label="t('relationGraph.groups')"
        @click="groupsOpen = true"
      />
      <template v-if="display === 'canvas'">
        <QBtn
          outline
          dense
          no-caps
          icon="auto_fix_high"
          :label="t('relationGraph.relayout')"
          :disable="readOnly || !nodes.length"
          @click="relayout"
        />
        <QBtn
          outline
          dense
          round
          icon="fit_screen"
          :aria-label="t('relationGraph.fit')"
          :title="t('relationGraph.fit')"
          @click="canvas?.fit()"
        />
        <QBtn
          outline
          dense
          round
          icon="remove"
          :aria-label="t('relationGraph.zoomOut')"
          :title="t('relationGraph.zoomOut')"
          @click="canvas?.zoomOut()"
        />
        <QBtn
          outline
          dense
          round
          icon="add"
          :aria-label="t('relationGraph.zoomIn')"
          :title="t('relationGraph.zoomIn')"
          @click="canvas?.zoomIn()"
        />
      </template>
    </div>

    <div
      v-if="involvedEntries.length"
      class="filters"
      role="group"
      :aria-label="t('relationGraph.filters')"
    >
      <template v-if="rel.types.length">
        <span class="flabel">{{ t('relationGraph.filterRelation') }}</span>
        <button
          v-for="ty in rel.types"
          :key="ty.id"
          type="button"
          class="fchip"
          :aria-pressed="fRelation.includes(ty.id)"
          @click="toggle('relation', ty.id)"
        >
          <span class="swatch" :style="{ background: ty.color }" aria-hidden="true" />
          {{ ty.name }}
        </button>
      </template>
      <template v-if="codex.types.length">
        <span class="flabel">{{ t('relationGraph.filterEntry') }}</span>
        <button
          v-for="ty in codex.types"
          :key="ty.id"
          type="button"
          class="fchip"
          :aria-pressed="fEntry.includes(ty.id)"
          @click="toggle('entry', ty.id)"
        >
          <span class="dot" :style="{ background: ty.color }" aria-hidden="true" />
          {{ ty.name }}
        </button>
      </template>
      <template v-if="rel.groups.length">
        <span class="flabel">{{ t('relationGraph.filterGroup') }}</span>
        <button
          v-for="g in rel.groups"
          :key="g.id"
          type="button"
          class="fchip"
          :aria-pressed="fGroup.includes(g.id)"
          @click="toggle('group', g.id)"
        >
          <span class="box" :style="{ borderColor: g.color }" aria-hidden="true" />
          {{ g.name }}
        </button>
      </template>
      <QBtn
        v-if="filterActive"
        flat
        dense
        no-caps
        :label="t('relationGraph.clearFilters')"
        @click="clearFilters"
      />
    </div>

    <p v-if="hiddenCount > 0" class="banner" role="status">
      <QIcon name="warning" aria-hidden="true" />
      {{ t('relationGraph.hidden', { n: hiddenCount }, hiddenCount) }}
    </p>
    <p v-if="rel.layoutStatus === 'invalid'" class="banner" role="status">
      <QIcon name="warning" aria-hidden="true" />
      {{ t('relationGraph.layoutInvalid') }}
    </p>

    <div class="stage">
      <div v-if="!involvedEntries.length" class="empty">
        <h2>{{ t('relationGraph.emptyTitle') }}</h2>
        <p>{{ t('relationGraph.emptyBody') }}</p>
      </div>
      <div v-else-if="!nodes.length" class="empty">
        <h2>{{ t('relationGraph.noMatchTitle') }}</h2>
        <QBtn
          outline
          no-caps
          :label="t('relationGraph.clearFilters')"
          @click="clearFilters"
        />
      </div>

      <div v-else-if="display === 'list'" class="list">
        <table class="rows">
          <caption class="sr-only">
            {{ t('relationGraph.list.title') }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ t('relationGraph.list.from') }}</th>
              <th scope="col">{{ t('relationGraph.list.relation') }}</th>
              <th scope="col">{{ t('relationGraph.list.to') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in visibleRelationships" :key="r.id">
              <td>
                <button
                  type="button"
                  class="link"
                  :aria-label="t('relationGraph.openLabel', { name: entryName(r.fromId) })"
                  @click="openEntry(r.fromId)"
                >
                  {{ entryName(r.fromId) }}
                </button>
              </td>
              <td>
                <span
                  class="swatch"
                  :style="{ background: relTypeById.get(r.typeId)?.color }"
                  aria-hidden="true"
                />
                {{ relTypeById.get(r.typeId)?.name }}
              </td>
              <td>
                <button
                  type="button"
                  class="link"
                  :aria-label="t('relationGraph.openLabel', { name: entryName(r.toId) })"
                  @click="openEntry(r.toId)"
                >
                  {{ entryName(r.toId) }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <template v-if="listGroups.length">
          <h2 class="list-h">{{ t('relationGraph.list.groups') }}</h2>
          <ul class="gl">
            <li v-for="g in listGroups" :key="g.id">
              <strong>{{ g.name }}:</strong>
              {{ g.members.length ? g.members.join(', ') : t('relationGraph.list.noMembers') }}
            </li>
          </ul>
        </template>
      </div>

      <template v-else>
        <div class="fill">
          <GraphCanvas
            ref="canvas"
            :nodes="nodes"
            :edges="edges"
            :node-style="nodeStyle"
            :edge-style="edgeStyle"
            :can-connect="canConnect"
            :draggable="!readOnly"
            :selected-id="selectedId"
            @select="selectedId = $event"
            @open="openEntry"
            @move="onMove"
            @rejected="onRejected"
          >
            <template #overlay="{ x, y, zoom }">
              <svg class="regions" width="100%" height="100%">
                <g :transform="`translate(${x} ${y}) scale(${zoom})`">
                  <g v-for="r in regions" :key="r.id">
                    <path
                      :d="r.path"
                      class="region"
                      :style="{
                        fill: `color-mix(in srgb, ${r.color} 14%, transparent)`,
                        stroke: r.color,
                      }"
                    />
                    <text :x="r.lx" :y="r.ly" class="region-label">{{ r.name }}</text>
                  </g>
                </g>
              </svg>
            </template>
            <template #node="{ node }">
              <span class="nm" :title="node.label">{{ node.label }}</span>
              <span class="ty">{{ typeName(node.data?.typeId ?? '') }}</span>
            </template>
          </GraphCanvas>
        </div>
        <aside v-if="selected" class="card" :aria-label="t('relationGraph.cardLabel')">
          <strong class="card-name">{{ selected.name || t('codex.untitled') }}</strong>
          <span class="card-type">
            <span
              class="dot"
              :style="{ background: typeById.get(selected.typeId)?.color }"
              aria-hidden="true"
            />
            {{ typeName(selected.typeId) }}
          </span>
          <span v-if="selectedGroups" class="card-type">
            {{ t('relationGraph.cardGroups', { names: selectedGroups }) }}
          </span>
          <QBtn
            unelevated
            dense
            no-caps
            class="btn-section"
            :label="t('relationGraph.openButton')"
            :aria-label="t('relationGraph.openLabel', { name: selected.name })"
            @click="openEntry(selected.id)"
          />
        </aside>
      </template>
    </div>
    <RelationTypesDialog v-model="typesOpen" />
    <GroupsDialog v-model="groupsOpen" />
  </section>
</template>

<style scoped>
.rg {
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
  font-size: 0.8125rem;
}
.title {
  margin: 0 0.5rem 0 0;
  font-size: 1.0625rem;
  font-weight: 600;
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
  background: var(--section-codex);
  border-color: var(--section-codex);
  color: var(--section-codex-on);
}
.seg:focus-visible,
.fchip:focus-visible,
.link:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.fchip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.125rem 0.625rem;
  border-radius: 999px;
}
/* Shapes tell the filter kinds apart without colour: dot = entry type, bar = relation, box = group. */
.dot {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
}
.swatch {
  display: inline-block;
  width: 1rem;
  height: 0.25rem;
  border-radius: 2px;
}
.box {
  display: inline-block;
  width: 0.75rem;
  height: 0.625rem;
  border: 2px dashed;
  border-radius: 3px;
}
.banner {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0;
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--section-timelines);
  font-size: 0.8125rem;
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
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 0.75rem 1rem;
}
.empty {
  position: absolute;
  inset-block-start: 35%;
  inset-inline: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
  color: var(--text-secondary);
}
.empty h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.125rem;
}
.empty p {
  margin: 0;
}
.regions {
  display: block;
}
.region {
  stroke-width: 2;
  stroke-dasharray: 10 6;
}
.region-label {
  fill: var(--text-primary);
  stroke: var(--bg-app);
  stroke-width: 4px;
  paint-order: stroke;
  font-size: 14px;
  font-weight: 600;
}
.nm,
.ty {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.nm {
  font-weight: 600;
}
.ty {
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.card {
  position: absolute;
  inset-block-start: 0.75rem;
  inset-inline-end: 0.75rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  max-width: 16rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.5rem;
  background: var(--bg-raised);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--text-primary) 18%, transparent);
}
.card-name {
  overflow-wrap: anywhere;
}
.card-type {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.btn-section {
  margin-top: 0.25rem;
  background: var(--section-codex);
  color: var(--section-codex-on);
}
.rows {
  width: 100%;
  border-collapse: collapse;
}
.rows th,
.rows td {
  padding: 0.375rem 0.5rem;
  border-bottom: 1px solid var(--border);
  text-align: start;
}
.rows th {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.list-h {
  margin: 1rem 0 0.25rem;
  font-size: 1rem;
}
.gl {
  margin: 0;
  padding-inline-start: 1.25rem;
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
