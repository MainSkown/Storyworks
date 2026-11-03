<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMechanicsStore } from '../../gamedoc/mechanicsStore'
import { useLinkContext } from '../../gamedoc/linkContext'
import { linkCandidates } from '../../gamedoc/linkLabels'
import { useLinkNames } from '../../gamedoc/useLinkNames'
import { MECHANIC_LINK_KINDS, type Mechanic, type MechanicLinkKind } from '../../project/schemas/mechanic'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ mechanic: Mechanic }>()

const { t } = useI18n()
const store = useMechanicsStore()
const ctx = useLinkContext()
const names = useLinkNames()

const tab = ref<MechanicLinkKind>('variable')
const query = ref('')
const active = ref(0)
const listEl = ref<HTMLElement | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)

const rows = computed(() =>
  linkCandidates(tab.value, {
    names: names.value,
    ctx: ctx.value,
    linked: props.mechanic.links,
    selfId: props.mechanic.id,
    query: query.value,
  }),
)
const rowId = (i: number) => `mech-link-row-${i}`
const tabLabel = (k: MechanicLinkKind) => t(`gamedoc.links.tabs.${k}`)

watch(open, (v) => {
  if (!v) return
  query.value = ''
  active.value = 0
  tab.value = 'variable'
})
watch([query, tab], () => (active.value = 0))

function setTab(k: MechanicLinkKind): void {
  tab.value = k
  void nextTick(() => searchEl.value?.focus())
}
function onTabKey(delta: number): void {
  const n = MECHANIC_LINK_KINDS.length
  const next = MECHANIC_LINK_KINDS[(MECHANIC_LINK_KINDS.indexOf(tab.value) + delta + n) % n]!
  setTab(next)
  void nextTick(() => document.getElementById(`mech-link-tab-${next}`)?.focus())
}
function move(delta: number): void {
  if (!rows.value.length) return
  active.value = (active.value + delta + rows.value.length) % rows.value.length
  listEl.value?.querySelector(`#${rowId(active.value)}`)?.scrollIntoView({ block: 'nearest' })
}
function choose(i: number): void {
  const r = rows.value[i]
  if (!r) return
  open.value = false
  store.addLink(props.mechanic.id, { kind: tab.value, id: r.id })
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="mech-link-title" data-testid="mechanic-link-picker">
      <QCardSection>
        <h2 id="mech-link-title" class="title">{{ t('gamedoc.links.addTitle') }}</h2>
        <div class="tabs" role="tablist" :aria-label="t('gamedoc.links.addTitle')">
          <button
            v-for="k in MECHANIC_LINK_KINDS"
            :id="`mech-link-tab-${k}`"
            :key="k"
            type="button"
            class="tab"
            :class="{ on: tab === k }"
            role="tab"
            :aria-selected="tab === k"
            :tabindex="tab === k ? 0 : -1"
            aria-controls="mech-link-panel"
            @click="setTab(k)"
            @keydown.left.prevent="onTabKey(-1)"
            @keydown.right.prevent="onTabKey(1)"
          >
            {{ tabLabel(k) }}
          </button>
        </div>
        <div id="mech-link-panel" role="tabpanel" :aria-labelledby="`mech-link-tab-${tab}`">
          <input
            ref="searchEl"
            v-model="query"
            class="search"
            type="search"
            autofocus
            role="combobox"
            :aria-expanded="rows.length > 0"
            aria-controls="mech-link-list"
            :aria-activedescendant="rows.length ? rowId(active) : undefined"
            :aria-label="t('gamedoc.links.search', { kind: tabLabel(tab) })"
            :placeholder="t('gamedoc.links.search', { kind: tabLabel(tab) })"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter.prevent="choose(active)"
          />
          <p v-if="rows.length === 0" class="empty" role="status">
            {{ t(query.trim() ? 'gamedoc.links.noMatch' : 'gamedoc.links.nothingToLink') }}
          </p>
          <div
            v-else
            id="mech-link-list"
            ref="listEl"
            class="list"
            role="listbox"
            :aria-label="tabLabel(tab)"
          >
            <div
              v-for="(r, i) in rows"
              :id="rowId(i)"
              :key="r.id"
              class="row"
              :class="{ active: i === active }"
              role="option"
              :aria-selected="i === active"
              @click="choose(i)"
              @mousemove="active = i"
            >
              {{ r.name.trim() || t('gamedoc.links.untitled') }}
            </div>
          </div>
        </div>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('gamedoc.links.cancel')" @click="open = false" />
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
  flex-wrap: wrap;
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
  border-bottom-color: var(--section-gamedoc);
  color: var(--text-primary);
  font-weight: 600;
}
.tab:focus-visible,
.search:focus-visible {
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
.list {
  max-height: min(24rem, 55vh);
  overflow-y: auto;
}
.row {
  padding: 0.4rem 0.5rem;
  border-radius: 0.25rem;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.row.active {
  background: var(--bg-selected);
  outline: 1px solid var(--section-gamedoc);
}
</style>
