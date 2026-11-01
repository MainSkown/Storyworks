<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '../calendar'
import { groupPickerNodes } from '../timeline/pick'
import { useTimelinesStore } from '../timeline/store'

const open = defineModel<boolean>({ required: true })
defineProps<{ title: string }>()
const emit = defineEmits<{ pick: [timelineId: string, nodeId: string] }>()

const { t } = useI18n()
const timelines = useTimelinesStore()

const query = ref('')
const active = ref(0)
const listEl = ref<HTMLElement | null>(null)

const groups = computed(() =>
  groupPickerNodes(timelines.loadedTimelines, query.value, (d) => formatDate(timelines.calendar, d)),
)
const rows = computed(() => groups.value.flatMap((g) => g.rows))
const hasAnyNode = computed(() => timelines.loadedTimelines.some((tl) => tl.nodes.length > 0))

const rowId = (i: number) => `node-picker-row-${i}`

watch(open, (v) => {
  if (v) {
    query.value = ''
    active.value = 0
  }
})
watch(query, () => (active.value = 0))

function move(delta: number): void {
  if (rows.value.length === 0) return
  active.value = (active.value + delta + rows.value.length) % rows.value.length
  listEl.value?.querySelector(`#${rowId(active.value)}`)?.scrollIntoView({ block: 'nearest' })
}

function choose(i: number): void {
  const r = rows.value[i]
  if (!r) return
  open.value = false
  emit('pick', r.timelineId, r.nodeId)
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
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="node-picker-title">
      <QCardSection>
        <h2 id="node-picker-title" class="title">{{ title }}</h2>
        <p v-if="!hasAnyNode" class="empty">{{ t('eventLink.picker.empty') }}</p>
        <template v-else>
          <input
            v-model="query"
            class="search"
            type="search"
            autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls="node-picker-list"
            :aria-activedescendant="rows.length ? rowId(active) : undefined"
            :aria-label="t('eventLink.picker.search')"
            :placeholder="t('eventLink.picker.search')"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter.prevent="choose(active)"
          />
          <p v-if="rows.length === 0" class="empty" role="status">{{ t('eventLink.picker.noMatch') }}</p>
          <div v-else id="node-picker-list" ref="listEl" class="list" role="listbox">
            <div
              v-for="(g, gi) in groups"
              :key="g.timelineId"
              role="group"
              :aria-label="g.name"
            >
              <div class="group-name">{{ g.name }}</div>
              <div
                v-for="(r, ri) in g.rows"
                :id="rowId(offsets[gi]! + ri)"
                :key="r.nodeId"
                class="row"
                :class="{ active: offsets[gi]! + ri === active }"
                role="option"
                :aria-selected="offsets[gi]! + ri === active"
                @click="choose(offsets[gi]! + ri)"
                @mousemove="active = offsets[gi]! + ri"
              >
                <span class="name">{{ r.title || t('timelines.untitled') }}</span>
                <span v-if="r.date" class="date">{{ r.date }}</span>
                <span v-if="r.chip" class="chip">{{ r.chip }}</span>
              </div>
            </div>
          </div>
        </template>
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
