<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { formatDate } from '../../calendar'
import { useCodexStore } from '../../codex/store'
import { overlappingStates } from '../../project/stateChecks'
import { useStatesStore } from '../../states/store'
import type { Position } from '../../timeline/order'
import { useOrderContext } from '../../timeline/orderContext'
import { useTimelinesStore } from '../../timeline/store'
import InvalidFiles from '../relations/InvalidFiles.vue'
import StateDialog from './StateDialog.vue'
import StateKindsDialog from './StateKindsDialog.vue'
import { describePosition } from './position'

const props = defineProps<{ entryId: string }>()
const { t } = useI18n()
const states = useStatesStore()
const codex = useCodexStore()
const timelines = useTimelinesStore()
const ctx = useOrderContext()

const locked = computed(() => !!states.readOnly)

function posText(p: Position): string {
  const v = describePosition(p, timelines.loadedTimelines, (d) => formatDate(timelines.calendar, d))
  if (v.kind === 'date') return v.date
  if (v.kind === 'missing-event') return t('states.position.missingEvent')
  return `${v.title || t('states.position.untitledEvent')} (${v.timelineName})`
}
const periodText = (from: Position, until: Position | null): string =>
  until
    ? t('states.period', { from: posText(from), until: posText(until) })
    : t('states.periodOngoing', { from: posText(from) })

const entryName = (id: string) => {
  const e = codex.entries.find((x) => x.id === id)
  return e ? e.name || t('codex.untitled') : ''
}
const kindName = (id: string) => states.kinds.find((k) => k.id === id)?.name

const own = computed(() => states.statesFor(props.entryId))
const brokenValues = computed(
  () => new Set(states.brokenStateValueIds.filter((b) => b.entryId === props.entryId).map((b) => b.stateId)),
)
const brokenKinds = computed(
  () => new Set(states.brokenStateKindIds.filter((b) => b.entryId === props.entryId).map((b) => b.stateId)),
)

const valueLabel = (s: { value: string }) => s.value || t('states.untitled')
const stateValueLabel = (s: { kindId: string; value: string }) =>
  states.kinds.find((k) => k.id === s.kindId)?.valueType === 'entry'
    ? entryName(s.value) || t('states.missingEntry')
    : valueLabel(s)

const overlaps = computed(() => {
  const map = new Map<string, string[]>()
  const add = (id: string, other: (typeof own.value)[number]) => {
    const text = `${stateValueLabel(other)}, ${periodText(other.from, other.until)}`
    map.set(id, [...(map.get(id) ?? []), text])
  }
  for (const o of overlappingStates(own.value, states.kinds, ctx.value)) {
    add(o.a.id, o.b)
    add(o.b.id, o.a)
  }
  return map
})

interface Row {
  id: string
  value: string
  isEntry: boolean
  entryId: string | null
  brokenValue: boolean
  period: string
  final: boolean
  overlaps: string[]
}
interface Group {
  key: string
  name: string
  exclusive: boolean
  missing: boolean
  rows: Row[]
}

const groups = computed<Group[]>(() => {
  const toRow = (s: (typeof own.value)[number], isEntry: boolean): Row => {
    const broken = brokenValues.value.has(s.id)
    return {
      id: s.id,
      value: isEntry ? (broken ? t('states.missingEntry') : entryName(s.value)) : valueLabel(s),
      isEntry,
      entryId: isEntry && !broken ? s.value : null,
      brokenValue: broken,
      period: periodText(s.from, s.until),
      final: s.final,
      overlaps: overlaps.value.get(s.id) ?? [],
    }
  }
  const out: Group[] = []
  for (const k of states.kinds) {
    const rows = own.value.filter((s) => s.kindId === k.id).map((s) => toRow(s, k.valueType === 'entry'))
    if (rows.length) out.push({ key: k.id, name: k.name, exclusive: k.exclusive, missing: false, rows })
  }
  const orphans = own.value.filter((s) => brokenKinds.value.has(s.id))
  if (orphans.length)
    out.push({
      key: '__missing',
      name: t('states.missingKind'),
      exclusive: false,
      missing: true,
      rows: orphans.map((s) => toRow(s, false)),
    })
  return out
})

// ---- reverse view ----
const pointing = computed(() =>
  states.statesPointingAt(props.entryId).map((r) => ({
    key: r.stateId,
    ownerId: r.ownerId,
    owner: entryName(r.ownerId),
    live: codex.entryList.some((e) => e.id === r.ownerId),
    kind: kindName(r.kindId) ?? t('states.missingKind'),
    period: periodText(r.from, r.until),
    final: r.final,
  })),
)

// ---- dialogs ----
const dialogOpen = ref(false)
const kindsOpen = ref(false)
const editId = ref<string | null>(null)
function openAdd(): void {
  editId.value = null
  dialogOpen.value = true
}
function openEdit(id: string): void {
  editId.value = id
  dialogOpen.value = true
}
function remove(id: string): void {
  if (!states.removeState(props.entryId, id).ok)
    Notify.create({ type: 'negative', message: t('states.failed'), position: 'bottom', timeout: 5000 })
}

const invalidKinds = computed(() => states.kindList.filter((e) => e.status !== 'ok'))
</script>

<template>
  <div class="st">
    <div class="actions">
      <QBtn
        unelevated
        no-caps
        icon="add"
        class="btn-section"
        :label="t('states.add')"
        :disable="locked || !states.kinds.length"
        @click="openAdd"
      />
      <QBtn flat no-caps icon="tune" :label="t('states.manageKinds')" @click="kindsOpen = true" />
    </div>
    <p v-if="!states.kinds.length" class="muted">{{ t('states.noKinds') }}</p>

    <h2 class="label section-title first">{{ t('states.heading') }}</h2>
    <p v-if="!groups.length" class="muted">{{ t('states.none') }}</p>
    <section v-for="g in groups" :key="g.key" class="group" :aria-labelledby="`st-g-${g.key}`">
      <h3 :id="`st-g-${g.key}`" class="group-head" :class="{ gone: g.missing }">
        <QIcon v-if="g.missing" name="error_outline" size="1rem" aria-hidden="true" />
        {{ g.name }}
        <span v-if="g.exclusive" class="badge">
          <QIcon name="looks_one" size="0.875rem" aria-hidden="true" />{{ t('states.exclusiveBadge') }}
        </span>
      </h3>
      <ul class="rows">
        <li
          v-for="r in g.rows"
          :key="r.id"
          class="row"
          :class="{ broken: r.brokenValue || g.missing, warn: r.overlaps.length > 0 }"
        >
          <div class="body">
            <div class="main">
              <span v-if="r.brokenValue" class="gone">
                <QIcon name="error_outline" size="1rem" aria-hidden="true" />
                {{ r.value }}
              </span>
              <button
                v-else-if="r.entryId"
                type="button"
                class="link"
                :aria-label="t('states.open', { name: r.value })"
                @click="codex.select(r.entryId)"
              >
                {{ r.value }}
              </button>
              <span v-else class="value">{{ r.value }}</span>
              <span v-if="r.final" class="badge final" :title="t('states.finalTitle')">
                <QIcon name="flag" size="0.875rem" aria-hidden="true" />{{ t('states.finalBadge') }}
              </span>
            </div>
            <span class="muted">{{ r.period }}</span>
            <span v-if="r.brokenValue" class="muted">{{ t('states.brokenValue') }}</span>
            <span v-if="g.missing" class="muted">{{ t('states.missingKindHint') }}</span>
            <p v-for="o in r.overlaps" :key="o" class="overlap" role="status">
              <QIcon name="warning" size="1rem" aria-hidden="true" />
              {{ t('states.overlap', { other: o }) }}
            </p>
          </div>
          <template v-if="!locked">
            <QBtn
              flat
              round
              dense
              icon="edit"
              :aria-label="t('states.edit', { kind: g.name, value: r.value })"
              @click="openEdit(r.id)"
            />
            <QBtn
              flat
              round
              dense
              icon="delete_outline"
              :aria-label="t('states.remove', { kind: g.name, value: r.value })"
              @click="remove(r.id)"
            />
          </template>
        </li>
      </ul>
    </section>
    <InvalidFiles :items="invalidKinds" :heading="t('stateKinds.invalidHeading')" />

    <h2 class="label section-title">{{ t('states.pointing.heading') }}</h2>
    <p v-if="!pointing.length" class="muted">{{ t('states.pointing.none') }}</p>
    <ul v-else class="rows">
      <li v-for="p in pointing" :key="p.key" class="row" :class="{ broken: !p.live }">
        <div class="body">
          <div class="main">
            <span class="muted">{{ p.kind }}:</span>
            <span v-if="!p.live" class="gone">
              <QIcon name="error_outline" size="1rem" aria-hidden="true" />
              {{ p.owner || t('states.missingEntry') }}
            </span>
            <button
              v-else
              type="button"
              class="link"
              :aria-label="t('states.open', { name: p.owner })"
              @click="codex.select(p.ownerId)"
            >
              {{ p.owner }}
            </button>
            <span v-if="p.final" class="badge final" :title="t('states.finalTitle')">
              <QIcon name="flag" size="0.875rem" aria-hidden="true" />{{ t('states.finalBadge') }}
            </span>
          </div>
          <span class="muted">{{ p.period }}</span>
        </div>
      </li>
    </ul>

    <StateDialog v-model="dialogOpen" :entry-id="entryId" :state-id="editId" />
    <StateKindsDialog v-model="kindsOpen" />
  </div>
</template>

<style scoped>
.st {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.btn-section {
  background: var(--section-codex);
  color: var(--section-codex-on);
}
.label {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.section-title {
  margin-top: 1rem;
}
.section-title.first {
  margin-top: 0.5rem;
}
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.group {
  margin-top: 0.25rem;
}
.group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.25rem;
  font-size: 0.9375rem;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
}
.row.broken {
  border-style: dashed;
  border-color: var(--section-checks);
}
.row.warn {
  border-color: var(--section-timelines);
  border-inline-start-width: 4px;
}
.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  overflow-wrap: anywhere;
}
.main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.badge.final {
  border-color: var(--section-codex);
  color: var(--text-primary);
}
.overlap {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0.125rem 0 0;
  color: var(--text-primary);
  font-size: 0.8125rem;
  font-weight: 600;
}
.link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--section-codex);
  font: inherit;
  text-align: start;
  text-decoration: underline;
  cursor: pointer;
}
.link:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.gone {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--section-checks);
  font-size: 0.875rem;
}
.group-head.gone {
  font-size: 0.9375rem;
}
</style>
