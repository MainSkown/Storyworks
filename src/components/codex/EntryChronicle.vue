<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { formatDate } from '../../calendar'
import { useCodexStore } from '../../codex/store'
import { jumpToNode } from '../../composables/useJump'
import { useRelationsStore } from '../../relations/store'
import { useStatesStore } from '../../states/store'
import { buildChronicle, type ChronicleExtra, type ChronicleRow } from '../../timeline/chronicle'
import { assembleChronicleInput } from '../../timeline/chronicleInput'
import { useOrderContext } from '../../timeline/orderContext'
import { describeTarget } from '../../timeline/pick'
import { useTimelinesStore } from '../../timeline/store'
import type { Position } from '../../timeline/order'

const props = withDefaults(defineProps<{ entryId: string; extra?: ChronicleExtra[] }>(), {
  extra: () => [],
})
const emit = defineEmits<{ navigate: [tab: 'states' | 'relations'] }>()

const { t } = useI18n()
const codex = useCodexStore()
const relations = useRelationsStore()
const states = useStatesStore()
const timelines = useTimelinesStore()
const ctx = useOrderContext()

const fmt = (d: Parameters<typeof formatDate>[1]) => formatDate(timelines.calendar, d)

const entryStates = computed(() => states.statesFor(props.entryId))

const rows = computed<ChronicleRow[]>(() => {
  const input = assembleChronicleInput({
    usage: codex.usedInNodes(props.entryId),
    timelines: timelines.loadedTimelines,
    states: entryStates.value,
    kindName: (id) => states.kinds.find((k) => k.id === id)?.name || t('chronicle.unknownKind'),
    relationships: relations.relationsFor(props.entryId).map((r) => {
      const other = codex.entries.find((e) => e.id === r.otherId)
      return {
        id: r.relationship.id,
        label: r.label || t('relations.unknownType'),
        otherName: other ? other.name || t('codex.untitled') : t('chronicle.missingEntry'),
        nodeRef: r.relationship.nodeRef ?? null,
      }
    }),
    untitledNode: t('chronicle.untitledEvent'),
  })
  return buildChronicle({ ...input, extra: props.extra }, ctx.value)
})

const sections = computed(() =>
  [
    { key: 'ordered', unknown: false, rows: rows.value.filter((r) => r.determined) },
    { key: 'unknown', unknown: true, rows: rows.value.filter((r) => !r.determined) },
  ].filter((s) => s.rows.length),
)

const KIND_ICON: Record<string, string> = { node: 'event', state: 'toggle_on', relationship: 'link' }
const kindIcon = (r: ChronicleRow) => KIND_ICON[r.kind] ?? 'circle'
const kindText = (r: ChronicleRow) => (r.kind in KIND_ICON ? t(`chronicle.kind.${r.kind}`) : r.kind)

function eventTitle(p: Position | null): string | null {
  if (!p || !('node' in p)) return null
  const d = describeTarget(
    timelines.loadedTimelines,
    { item: p.node.timelineId, block: p.node.nodeId },
    fmt,
  )
  return d ? d.title || t('chronicle.untitledEvent') : t('chronicle.missingEvent')
}
function whenText(p: Position): string {
  if ('date' in p) return fmt(p.date)
  return eventTitle(p) ?? ''
}

function stateValue(r: ChronicleRow): { text: string; missing: boolean } {
  const s = entryStates.value.find((x) => x.id === (r.target.type === 'state' ? r.target.stateId : ''))
  const kind = s && states.kinds.find((k) => k.id === s.kindId)
  if (kind?.valueType === 'entry') {
    const e = codex.entries.find((x) => x.id === r.value)
    return e ? { text: e.name || t('codex.untitled'), missing: false } : { text: t('chronicle.missingEntry'), missing: true }
  }
  return { text: r.value ?? '', missing: false }
}

function dateText(r: ChronicleRow): string {
  return r.date ? fmt(r.date) : t('chronicle.dateUnknown')
}

const clickable = (r: ChronicleRow) => r.target.type !== 'extra'

async function open(r: ChronicleRow): Promise<void> {
  const target = r.target
  if (target.type === 'state') emit('navigate', 'states')
  else if (target.type === 'relationship') emit('navigate', 'relations')
  else if (target.type === 'node') {
    const res = await jumpToNode(target.timelineId, target.nodeId)
    if (!res.ok)
      Notify.create({ type: 'warning', message: t('codex.jumpFailed'), position: 'bottom', timeout: 5000 })
  }
}
</script>

<template>
  <p v-if="!rows.length" class="muted">{{ t('chronicle.empty') }}</p>
  <div v-else class="chronicle">
    <template v-for="sec in sections" :key="sec.key">
      <template v-if="sec.unknown">
        <h3 class="divider">{{ t('chronicle.orderUnknown') }}</h3>
        <p class="muted hint">{{ t('chronicle.orderUnknownHint') }}</p>
      </template>
      <ol class="list" :aria-label="sec.unknown ? t('chronicle.orderUnknown') : t('chronicle.list')">
        <li v-for="r in sec.rows" :key="r.id" class="item">
          <component
            :is="clickable(r) ? 'button' : 'div'"
            class="row"
            v-bind="clickable(r) ? { type: 'button', 'aria-label': t('chronicle.open', { label: `${kindText(r)}: ${r.label}` }) } : {}"
            @click="clickable(r) && open(r)"
          >
            <span class="when">{{ dateText(r) }}</span>
            <span class="kind">
              <QIcon :name="kindIcon(r)" size="1rem" aria-hidden="true" />{{ kindText(r) }}
            </span>
            <span class="what">
              <span class="title">{{ r.label }}<template v-if="r.kind === 'state'">:</template></span>
              <span v-if="r.kind === 'relationship'" class="val">{{ r.otherName }}</span>
              <template v-else-if="r.kind === 'state'">
                <span class="val" :class="{ gone: stateValue(r).missing }">
                  <QIcon v-if="stateValue(r).missing" name="error_outline" size="1rem" aria-hidden="true" />{{ stateValue(r).text }}
                </span>
                <span v-if="r.until" class="meta">{{ t('chronicle.until', { when: whenText(r.until) }) }}</span>
                <span v-if="r.final" class="badge">
                  <QIcon name="flag" size="0.875rem" aria-hidden="true" />{{ t('chronicle.final') }}
                </span>
                <span v-if="eventTitle(r.position)" class="meta">{{ t('chronicle.at', { event: eventTitle(r.position) ?? '' }) }}</span>
              </template>
            </span>
          </component>
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.chronicle {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.list {
  margin: 0;
  padding: 0 0 0 0.75rem;
  list-style: none;
  border-left: 2px solid var(--border-strong);
}
.item {
  position: relative;
  padding: 0.125rem 0;
}
.item::before {
  content: '';
  position: absolute;
  top: 0.9rem;
  left: -1.0625rem;
  width: 0.5rem;
  height: 0.5rem;
  border: 2px solid var(--border-strong);
  border-radius: 50%;
  background: var(--bg-panel);
}
.row {
  display: grid;
  grid-template-columns: 9rem 1fr;
  gap: 0.25rem 0.75rem;
  align-items: baseline;
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 0.375rem;
  background: none;
  color: var(--text-primary);
  font: inherit;
  text-align: left;
}
button.row {
  cursor: pointer;
}
button.row:hover {
  background: var(--bg-selected);
}
button.row:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.when {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.kind {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
}
.what {
  grid-column: 1 / -1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.title {
  font-weight: 600;
}
.val {
  margin-left: 0.375rem;
}
.meta {
  margin-left: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  margin-left: 0.5rem;
  padding: 0 0.375rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}
.gone {
  border-bottom: 1px dashed var(--section-checks);
}
.divider {
  margin: 1rem 0 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.hint {
  margin-bottom: 0.25rem;
}
</style>
