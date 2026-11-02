<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '../calendar'
import { groupPickerEntries } from '../codex/pick'
import { useCodexStore } from '../codex/store'
import { lastPickerTab, type PickerTab } from '../composables/pickerTab'
import { groupPickerNodes } from '../timeline/pick'
import { useTimelinesStore } from '../timeline/store'
import KnowledgePairPicker from './KnowledgePairPicker.vue'

const open = defineModel<boolean>({ required: true })
const props = withDefaults(
  defineProps<{ title: string; tabs?: readonly PickerTab[] }>(),
  { tabs: () => ['events', 'codex'] },
)
const emit = defineEmits<{
  pick: [timelineId: string, nodeId: string]
  pickEntry: [entryId: string]
  pickKnowledge: [itemId: string, entryId: string]
}>()

const { t } = useI18n()
const timelines = useTimelinesStore()
const codex = useCodexStore()

const tab = ref<PickerTab>('events')
const query = ref('')
const active = ref(0)
const listEl = ref<HTMLElement | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)

const eventGroups = computed(() =>
  groupPickerNodes(timelines.loadedTimelines, query.value, (d) => formatDate(timelines.calendar, d)),
)
const entryGroups = computed(() => groupPickerEntries(codex.entries, codex.types, query.value))
const groups = computed(() => (tab.value === 'events' ? eventGroups.value : entryGroups.value))
const rowCount = computed(() => groups.value.reduce((n, g) => n + g.rows.length, 0))
const hasAnyNode = computed(() => timelines.loadedTimelines.some((tl) => tl.nodes.length > 0))
const hasAny = computed(() => (tab.value === 'events' ? hasAnyNode.value : codex.entries.length > 0))

const TAB_LABEL: Record<PickerTab, string> = {
  events: 'eventLink.picker.tabEvents',
  codex: 'eventLink.picker.tabCodex',
  knowledge: 'knowledgeUse.tab',
}

const rowId = (i: number) => `node-picker-row-${i}`

watch(open, (v) => {
  if (!v) return
  query.value = ''
  active.value = 0
  tab.value = props.tabs.includes(lastPickerTab.value) ? lastPickerTab.value : props.tabs[0]!
})
watch([query, tab], () => (active.value = 0))

function setTab(next: PickerTab): void {
  tab.value = next
  if (props.tabs.length > 1) lastPickerTab.value = next
  void nextTick(() => searchEl.value?.focus())
}

function onTabKey(delta: number): void {
  const i = props.tabs.indexOf(tab.value)
  const next = props.tabs[(i + delta + props.tabs.length) % props.tabs.length]!
  setTab(next)
  void nextTick(() => document.getElementById(`node-picker-tab-${next}`)?.focus())
}

function move(delta: number): void {
  if (rowCount.value === 0) return
  active.value = (active.value + delta + rowCount.value) % rowCount.value
  listEl.value?.querySelector(`#${rowId(active.value)}`)?.scrollIntoView({ block: 'nearest' })
}

function choose(i: number): void {
  if (tab.value === 'events') {
    const r = eventGroups.value.flatMap((g) => g.rows)[i]
    if (!r) return
    open.value = false
    emit('pick', r.timelineId, r.nodeId)
  } else {
    const r = entryGroups.value.flatMap((g) => g.rows)[i]
    if (!r) return
    open.value = false
    emit('pickEntry', r.entryId)
  }
}

// Position of a row in the flat list, for grouped rendering.
const offsets = computed(() => {
  let n = 0
  return groups.value.map((g) => {
    const start = n
    n += g.rows.length
    return start
  })
})

const groupKey = (g: (typeof groups.value)[number]) =>
  'timelineId' in g ? g.timelineId : (g.typeId ?? '')
const groupName = (g: (typeof groups.value)[number]) =>
  'timelineId' in g ? g.name : (g.typeName ?? t('codex.noType'))
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="node-picker-title">
      <QCardSection>
        <h2 id="node-picker-title" class="title">{{ title }}</h2>
        <div v-if="tabs.length > 1" class="tabs" role="tablist" :aria-label="title">
          <button
            v-for="k in tabs"
            :id="`node-picker-tab-${k}`"
            :key="k"
            type="button"
            class="tab"
            :class="{ on: tab === k }"
            role="tab"
            :aria-selected="tab === k"
            :tabindex="tab === k ? 0 : -1"
            aria-controls="node-picker-panel"
            @click="setTab(k)"
            @keydown.left.prevent="onTabKey(-1)"
            @keydown.right.prevent="onTabKey(1)"
          >
            {{ t(TAB_LABEL[k]) }}
          </button>
        </div>
        <div id="node-picker-panel" :role="tabs.length > 1 ? 'tabpanel' : undefined">
          <KnowledgePairPicker
            v-if="tab === 'knowledge'"
            @pick="(itemId, entryId) => ((open = false), emit('pickKnowledge', itemId, entryId))"
          />
          <p v-else-if="!hasAny" class="empty">
            {{ t(tab === 'events' ? 'eventLink.picker.empty' : 'eventLink.picker.emptyCodex') }}
          </p>
          <template v-else>
            <input
              ref="searchEl"
              v-model="query"
              class="search"
              type="search"
              autofocus
              role="combobox"
              aria-expanded="true"
              aria-controls="node-picker-list"
              :aria-activedescendant="rowCount ? rowId(active) : undefined"
              :aria-label="t(tab === 'events' ? 'eventLink.picker.search' : 'eventLink.picker.searchCodex')"
              :placeholder="t(tab === 'events' ? 'eventLink.picker.search' : 'eventLink.picker.searchCodex')"
              @keydown.down.prevent="move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.enter.prevent="choose(active)"
            />
            <p v-if="rowCount === 0" class="empty" role="status">
              {{ t(tab === 'events' ? 'eventLink.picker.noMatch' : 'eventLink.picker.noMatchCodex') }}
            </p>
            <div v-else id="node-picker-list" ref="listEl" class="list" role="listbox">
              <div v-for="(g, gi) in groups" :key="groupKey(g)" role="group" :aria-label="groupName(g)">
                <div class="group-name">{{ groupName(g) }}</div>
                <div
                  v-for="(r, ri) in g.rows"
                  :id="rowId(offsets[gi]! + ri)"
                  :key="'nodeId' in r ? r.nodeId : r.entryId"
                  class="row"
                  :class="{ active: offsets[gi]! + ri === active }"
                  role="option"
                  :aria-selected="offsets[gi]! + ri === active"
                  @click="choose(offsets[gi]! + ri)"
                  @mousemove="active = offsets[gi]! + ri"
                >
                  <template v-if="'nodeId' in r">
                    <span class="name">{{ r.title || t('timelines.untitled') }}</span>
                    <span v-if="r.date" class="date">{{ r.date }}</span>
                    <span v-if="r.chip" class="chip">{{ r.chip }}</span>
                  </template>
                  <template v-else>
                    <span class="name">{{ r.name || t('codex.untitled') }}</span>
                    <span v-if="r.typeName" class="chip">{{ r.typeName }}</span>
                  </template>
                </div>
              </div>
            </div>
          </template>
        </div>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('eventLink.picker.cancel')" @click="open = false" />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  width: min(34rem, 92vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.title {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: 0.3rem 0.75rem;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}
.tab.on {
  border-bottom-color: var(--focus-ring);
  color: var(--text-primary);
  font-weight: 600;
}
.tab:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.empty {
  margin: 0;
  color: var(--text-secondary);
}
.search {
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.search:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.list {
  max-height: min(24rem, 55vh);
  overflow-y: auto;
}
.group-name {
  position: sticky;
  top: 0;
  padding: 0.35rem 0.5rem;
  background: var(--bg-raised);
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.4rem 0.5rem;
  border-inline-start: 3px solid transparent;
  cursor: pointer;
}
.row.active {
  background: var(--bg-selected);
  border-inline-start-color: var(--focus-ring);
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.date {
  color: var(--text-secondary);
  font-size: 0.85rem;
  white-space: nowrap;
}
.chip {
  padding: 0 0.4rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  white-space: nowrap;
}
</style>
