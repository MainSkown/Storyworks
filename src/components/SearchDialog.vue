<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { areaStyle, AREA_META } from '../search/areaMeta'
import type { Area } from '../search/index'
import { moveActive } from '../search/nav'
import type { SearchHit, SearchResults } from '../search/query'
import { useSearchStore } from '../search/store'
import MatchText from './MatchText.vue'

const open = defineModel<boolean>({ required: true })
const { t } = useI18n()
const store = useSearchStore()

const PAGE = 50
const DELAY_MS = 120

const q = ref('')
const results = shallowRef<SearchResults>({ groups: [] })
const expanded = ref<Set<Area>>(new Set())
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

type Row =
  | { key: string; type: 'hit'; area: Area; hit: SearchHit }
  | { key: string; type: 'more'; area: Area; n: number }

const groups = computed(() =>
  results.value.groups.map((g) => {
    const all = expanded.value.has(g.area)
    const shown = all ? g.hits : g.hits.slice(0, PAGE)
    const rows: Row[] = shown.map((hit) => ({ key: `hit-${hit.id}`, type: 'hit', area: g.area, hit }))
    const more = g.hits.length - shown.length
    if (more > 0) rows.push({ key: `more-${g.area}`, type: 'more', area: g.area, n: more })
    return { area: g.area, total: g.hits.length, rows }
  }),
)
const rows = computed(() => groups.value.flatMap((g) => g.rows))
const total = computed(() => results.value.groups.reduce((n, g) => n + g.hits.length, 0))
const optionId = (key: string) => `search-opt-${key}`
const activeId = computed(() => {
  const r = rows.value[active.value]
  return r ? optionId(r.key) : undefined
})
const rowIndex = (key: string) => rows.value.findIndex((r) => r.key === key)

function run(): void {
  results.value = q.value.trim() ? store.find(q.value) : { groups: [] }
  active.value = Math.min(active.value, Math.max(0, rows.value.length - 1))
}

let timer: ReturnType<typeof setTimeout> | undefined
function schedule(): void {
  clearTimeout(timer)
  timer = setTimeout(run, DELAY_MS)
}
onBeforeUnmount(() => clearTimeout(timer))

watch(q, () => {
  active.value = 0
  expanded.value = new Set()
  schedule()
})
// Scene text keeps arriving while the overlay is open.
watch(() => store.version, () => open.value && schedule())
watch(open, (v) => {
  if (!v) return
  run()
})

async function onShow(): Promise<void> {
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

watch(active, async () => {
  await nextTick()
  list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
})

async function activate(row: Row | undefined): Promise<void> {
  if (!row) return
  if (row.type === 'more') {
    expanded.value = new Set(expanded.value).add(row.area)
    return
  }
  open.value = false
  const { hit } = row
  await store.open({ id: hit.id, kind: hit.kind, parentId: hit.parentId, blockId: hit.blockId, nodeId: hit.nodeId })
}

function onKeydown(e: KeyboardEvent): void {
  if (e.isComposing) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = moveActive(active.value, e.key === 'ArrowDown' ? 1 : -1, rows.value.length)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    void activate(rows.value[active.value])
  }
}

const status = computed(() => {
  if (!q.value.trim()) return ''
  return total.value === 0 ? t('search.none', { query: q.value.trim() }) : t('search.count', total.value)
})
</script>

<template>
  <QDialog v-model="open" position="top" @show="onShow">
    <QCard class="card" role="dialog" aria-modal="true" :aria-label="t('search.title')">
      <div class="head">
        <QIcon name="search" class="head-icon" aria-hidden="true" />
        <input
          ref="input"
          v-model="q"
          class="input"
          type="text"
          role="combobox"
          autocomplete="off"
          spellcheck="false"
          aria-autocomplete="list"
          aria-controls="search-listbox"
          :aria-expanded="rows.length > 0"
          :aria-activedescendant="activeId"
          :aria-label="t('search.inputLabel')"
          :placeholder="t('search.placeholder')"
          @keydown="onKeydown"
        />
      </div>

      <div ref="list" class="body">
        <div
          id="search-listbox"
          role="listbox"
          :aria-label="t('search.results')"
          class="listbox"
        >
          <div
            v-for="g in groups"
            :key="g.area"
            role="group"
            :aria-labelledby="`search-h-${g.area}`"
            :style="areaStyle(g.area)"
          >
            <div :id="`search-h-${g.area}`" class="heading">
              <span class="swatch" aria-hidden="true"><QIcon :name="AREA_META[g.area].icon" /></span>
              {{ t(`search.area.${g.area}`) }}
              <span class="count">{{ g.total }}</span>
            </div>
            <template v-for="row in g.rows" :key="row.key">
              <div
                v-if="row.type === 'hit'"
                :id="optionId(row.key)"
                role="option"
                class="option"
                :class="{ active: rowIndex(row.key) === active }"
                :aria-selected="rowIndex(row.key) === active"
                @click="activate(row)"
                @mousemove="active = rowIndex(row.key)"
              >
                <div class="line">
                  <span class="title">
                    <MatchText
                      v-if="row.hit.field === 'title'"
                      :text="row.hit.snippet"
                      :start="row.hit.matchStart"
                      :end="row.hit.matchEnd"
                    />
                    <template v-else>{{ row.hit.title || t('search.untitled') }}</template>
                  </span>
                  <span class="kind">{{ t(`search.kind.${row.hit.kind}`) }}</span>
                </div>
                <div v-if="row.hit.field !== 'title'" class="snippet">
                  <template v-if="row.hit.field === 'alias'">{{ t('search.also') }}{{ ' ' }}</template>
                  <MatchText
                    :text="row.hit.snippet"
                    :start="row.hit.matchStart"
                    :end="row.hit.matchEnd"
                  />
                </div>
              </div>
              <div
                v-else
                :id="optionId(row.key)"
                role="option"
                class="option more"
                :class="{ active: rowIndex(row.key) === active }"
                :aria-selected="rowIndex(row.key) === active"
                @click="activate(row)"
                @mousemove="active = rowIndex(row.key)"
              >
                {{ t('search.more', { n: row.n }) }}
              </div>
            </template>
          </div>
        </div>
        <p v-if="!q.trim()" class="note">{{ t('search.hint') }}</p>
        <p v-else-if="total === 0 && !store.loadingBodies" class="note">{{ status }}</p>
        <p v-if="q.trim() && store.loadingBodies" class="note">{{ t('search.loading') }}</p>
      </div>

      <div class="sr-only" role="status" aria-live="polite">{{ status }}</div>
      <div class="foot" aria-hidden="true">{{ t('search.keys') }}</div>
    </QCard>
  </QDialog>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  width: min(44rem, 94vw);
  max-height: 80vh;
  margin-top: 8vh;
  background: var(--bg-raised);
  color: var(--text-primary);
}
.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  border-bottom: 1px solid var(--border);
}
.head-icon {
  color: var(--text-secondary);
  font-size: 1.375rem;
}
.input {
  flex: 1;
  min-width: 0;
  padding: 0.375rem 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 1.0625rem;
}
.input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.25rem 0.5rem;
}
.heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.5rem 0.25rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.swatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.25rem;
  background: var(--area);
  color: var(--area-on);
  font-size: 0.875rem;
}
.count {
  font-weight: 400;
}
.option {
  padding: 0.375rem 0.5rem;
  border-radius: 0.375rem;
  border-inline-start: 3px solid transparent;
  cursor: pointer;
}
.option.active {
  background: var(--bg-selected);
  border-inline-start-color: var(--area);
}
.line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kind {
  flex: none;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.snippet {
  margin-top: 0.125rem;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.more {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-style: italic;
}
.note {
  margin: 0;
  padding: 0.75rem 0.5rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.foot {
  padding: 0.375rem 0.875rem;
  border-top: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.75rem;
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
