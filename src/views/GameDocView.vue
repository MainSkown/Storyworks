<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import GlossaryTab from '../components/gamedoc/GlossaryTab.vue'
import MechanicsTab from '../components/gamedoc/MechanicsTab.vue'
import OverviewTab from '../components/gamedoc/OverviewTab.vue'
import { useGlossaryStore } from '../gamedoc/glossaryStore'
import { useMechanicsStore } from '../gamedoc/mechanicsStore'
import { useOverviewStore } from '../gamedoc/overviewStore'
import { gameDocWords } from '../gamedoc/words'

const TABS = ['overview', 'mechanics', 'glossary'] as const
type Tab = (typeof TABS)[number]

const { t } = useI18n()
const route = useRoute()
const words = computed(() =>
  gameDocWords({
    overview: useOverviewStore().content,
    mechanics: useMechanicsStore().mechanics,
    glossary: useGlossaryStore().entries,
  }),
)
const router = useRouter()

// Unknown ?tab= values fall back to the overview.
const tab = computed<Tab>(() => {
  const q = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
  return TABS.find((x) => x === q) ?? 'overview'
})

function setTab(next: Tab): void {
  void router.replace({ query: { ...route.query, tab: next } })
}

function onTabKey(delta: number): void {
  const next = TABS[(TABS.indexOf(tab.value) + delta + TABS.length) % TABS.length]!
  setTab(next)
  void nextTick(() => document.getElementById(`gamedoc-tab-${next}`)?.focus())
}
</script>

<template>
  <section class="gamedoc">
    <div class="tabs" role="tablist" :aria-label="t('gamedoc.tabs')">
      <button
        v-for="k in TABS"
        :id="`gamedoc-tab-${k}`"
        :key="k"
        type="button"
        class="tab"
        :class="{ on: tab === k }"
        role="tab"
        :aria-selected="tab === k"
        :tabindex="tab === k ? 0 : -1"
        aria-controls="gamedoc-panel"
        :data-testid="`gamedoc-tab-${k}`"
        @click="setTab(k)"
        @keydown.left.prevent="onTabKey(-1)"
        @keydown.right.prevent="onTabKey(1)"
      >
        {{ t(`gamedoc.${k}`) }}
      </button>
      <span class="words" data-testid="gamedoc-words">{{ t('gamedoc.words', { n: words }) }}</span>
    </div>
    <div id="gamedoc-panel" role="tabpanel" :aria-labelledby="`gamedoc-tab-${tab}`">
      <OverviewTab v-if="tab === 'overview'" data-testid="gamedoc-overview" />
      <MechanicsTab v-else-if="tab === 'mechanics'" data-testid="gamedoc-mechanics" />
      <GlossaryTab v-else data-testid="gamedoc-glossary" />
    </div>
  </section>
</template>

<style scoped>
.gamedoc {
  padding: 1rem 1.5rem;
}
.tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: 0.4rem 0.9rem;
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
.words {
  margin-left: auto;
  align-self: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
}
.tab:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
