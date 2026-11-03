<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import WordsChart from '../components/stats/WordsChart.vue'
import type { ManuscriptNode } from '../project/schemas/manifest'
import { useProjectStore } from '../project/store'
import { nodeKindLabel } from '../project/kinds'
import { lastDays } from '../stats/series'
import { useClockRefresh } from '../stats/useClockRefresh'
import { useStatsStore, type Progress } from '../stats/store'

const { t, n, locale } = useI18n()
const project = useProjectStore()
const stats = useStatsStore()
useClockRefresh()

const series = computed(() => lastDays(stats.days, stats.today, 30))
const hasWords = computed(() => stats.days.some((d) => d.net > 0))
const bookWords = computed(() => project.wordCounts.get('') ?? 0)

const pct = (p: Progress) => Math.round(p.fraction * 100)

// ---- word totals tree ----
const SCENE_LIMIT = 30
const sceneCount = computed(() => {
  let c = 0
  const walk = (nodes: ManuscriptNode[]) =>
    nodes.forEach((x) => (x.type === 'scene' ? c++ : walk(x.children)))
  walk(project.tree)
  return c
})
// null = default (everything open for a short book, chapters closed for a long one)
const toggled = ref(new Set<string>())
const isOpen = (node: ManuscriptNode) => {
  const byDefault = sceneCount.value <= SCENE_LIMIT || node.type !== 'chapter'
  return toggled.value.has(node.id) ? !byDefault : byDefault
}
function toggle(id: string): void {
  const next = new Set(toggled.value)
  if (!next.delete(id)) next.add(id)
  toggled.value = next
}
const rows = computed(() => {
  const out: { node: ManuscriptNode; depth: number; open: boolean; words: number }[] = []
  const walk = (nodes: ManuscriptNode[], depth: number) => {
    for (const node of nodes) {
      const open = node.children.length > 0 && isOpen(node)
      out.push({ node, depth, open, words: project.wordCounts.get(node.id) ?? 0 })
      if (open) walk(node.children, depth + 1)
    }
  }
  walk(project.tree, 0)
  return out
})

// ---- sessions ----
const SESSION_LIMIT = 10
const showAll = ref(false)
const allSessions = computed(() =>
  [...stats.sessions].sort((a, b) => (a.start < b.start ? 1 : -1)),
)
const sessions = computed(() => (showAll.value ? allSessions.value : allSessions.value.slice(0, SESSION_LIMIT)))
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(locale.value, { year: 'numeric', month: 'short', day: 'numeric' })
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
const signed = (v: number) => (v > 0 ? `+${n(v)}` : n(v))
const liveId = computed(() => stats.liveSession?.id ?? null)
</script>

<template>
  <section class="page" :aria-label="t('stats.title')">
    <header class="head">
      <h1 class="title">{{ t('stats.title') }}</h1>
      <RouterLink class="goals-link" :to="{ name: 'settings', hash: '#goals' }">
        {{ t('stats.setGoals') }}
      </RouterLink>
    </header>
    <p class="intro">{{ t('stats.intro') }}</p>
    <p v-if="project.readOnly" class="notice" role="status">{{ t('stats.readOnly') }}</p>
    <p v-if="stats.invalid" class="notice err" role="alert">{{ t('stats.invalid') }}</p>

    <div class="cards">
      <section class="card" aria-labelledby="st-today">
        <h2 id="st-today">{{ t('stats.today.title') }}</h2>
        <p class="big">{{ t('stats.today.words', { n: n(stats.todayNet) }) }}</p>
        <template v-if="stats.goalProgress">
          <div
            class="bar"
            role="progressbar"
            :aria-label="t('stats.today.title')"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="pct(stats.goalProgress)"
          >
            <span :style="{ inlineSize: `${pct(stats.goalProgress)}%` }" />
          </div>
          <p class="sub">
            {{ t('stats.today.goal', { goal: n(stats.goalProgress.goal) }) }} ({{ pct(stats.goalProgress) }}%)
            <strong v-if="stats.goalProgress.met"> · {{ t('stats.today.met') }}</strong>
          </p>
        </template>
        <p v-else class="sub">{{ t('stats.today.noGoal') }}</p>
      </section>

      <section class="card" aria-labelledby="st-book">
        <h2 id="st-book">{{ t('stats.book.title') }}</h2>
        <p class="big">{{ t('stats.book.words', { n: n(bookWords) }) }}</p>
        <template v-if="stats.bookProgress">
          <div
            class="bar"
            role="progressbar"
            :aria-label="t('stats.book.title')"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="pct(stats.bookProgress)"
          >
            <span :style="{ inlineSize: `${pct(stats.bookProgress)}%` }" />
          </div>
          <p class="sub">
            {{ t('stats.book.goal', { goal: n(stats.bookProgress.goal) }) }} ({{ pct(stats.bookProgress) }}%)
            <strong v-if="stats.bookProgress.met"> · {{ t('stats.book.met') }}</strong>
          </p>
        </template>
        <p v-else class="sub">{{ t('stats.book.noGoal') }}</p>
      </section>

      <section class="card" aria-labelledby="st-streak">
        <h2 id="st-streak">{{ t('stats.streak.title') }}</h2>
        <dl class="streaks">
          <div>
            <dt>{{ t('stats.streak.current') }}</dt>
            <dd class="big">{{ t('stats.streak.days', { n: stats.streaks.current }, stats.streaks.current) }}</dd>
          </div>
          <div>
            <dt>{{ t('stats.streak.longest') }}</dt>
            <dd class="big">{{ t('stats.streak.days', { n: stats.streaks.longest }, stats.streaks.longest) }}</dd>
          </div>
        </dl>
        <p class="sub">{{ stats.dailyGoal ? t('stats.streak.ruleGoal') : t('stats.streak.ruleAny') }}</p>
      </section>
    </div>

    <section class="block" aria-labelledby="st-chart">
      <h2 id="st-chart">{{ t('stats.chart.title') }}</h2>
      <p v-if="!hasWords" class="empty">{{ t('stats.chart.empty') }}</p>
      <WordsChart v-else :days="series" :goal="stats.dailyGoal" />
    </section>

    <section class="block" aria-labelledby="st-totals">
      <h2 id="st-totals">{{ t('stats.totals.title') }}</h2>
      <p v-if="rows.length === 0" class="empty">{{ t('stats.totals.empty') }}</p>
      <ul v-else class="totals">
        <li v-for="r in rows" :key="r.node.id" :style="{ paddingInlineStart: `${r.depth * 1.25}rem` }">
          <button
            v-if="r.node.children.length"
            type="button"
            class="chev"
            :aria-expanded="r.open"
            :aria-label="t(r.open ? 'stats.totals.collapse' : 'stats.totals.expand', { title: r.node.title })"
            @click="toggle(r.node.id)"
          >
            <QIcon :name="r.open ? 'expand_more' : 'chevron_right'" aria-hidden="true" />
          </button>
          <span v-else class="chev-gap" aria-hidden="true" />
          <span class="kind">{{ t(`stats.totals.kind.${nodeKindLabel(project.project?.manifest.kind ?? 'book', r.node.type)}`) }}</span>
          <span class="name">{{ r.node.title }}</span>
          <span class="num">{{ n(r.words) }}</span>
        </li>
        <li class="sum">
          <span class="chev-gap" aria-hidden="true" />
          <span class="name">{{ t('stats.totals.total') }}</span>
          <span class="num">{{ n(bookWords) }}</span>
        </li>
      </ul>
    </section>

    <section class="block" aria-labelledby="st-sessions">
      <h2 id="st-sessions">{{ t('stats.sessions.title') }}</h2>
      <p v-if="sessions.length === 0" class="empty">{{ t('stats.sessions.empty') }}</p>
      <table v-else class="sessions">
        <thead>
          <tr>
            <th scope="col">{{ t('stats.sessions.date') }}</th>
            <th scope="col">{{ t('stats.sessions.time') }}</th>
            <th scope="col" class="r">{{ t('stats.sessions.net') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sessions" :key="s.id">
            <td>{{ fmtDate(s.start) }}</td>
            <td>
              {{ fmtTime(s.start) }}–{{ fmtTime(s.end) }}
              <em v-if="s.id === liveId" class="live">{{ t('stats.sessions.live') }}</em>
            </td>
            <td class="r">{{ signed(s.net) }}</td>
          </tr>
        </tbody>
      </table>
      <button
        v-if="allSessions.length > SESSION_LIMIT"
        type="button"
        class="more"
        @click="showAll = !showAll"
      >
        {{ showAll ? t('stats.sessions.showLess') : t('stats.sessions.showAll', { n: allSessions.length }) }}
      </button>
    </section>
  </section>
</template>

<style scoped>
.page {
  max-width: 64rem;
  margin-inline: auto;
  padding: 1.25rem 1.5rem;
  color: var(--text-primary);
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
.title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
.goals-link {
  color: var(--focus-ring);
  text-underline-offset: 2px;
}
.intro {
  margin: 0 0 0.75rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.notice {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--bg-sheet);
  font-size: 0.875rem;
}
.notice.err {
  border-color: var(--section-checks);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.card,
.block {
  padding: 0.75rem 1rem 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-sheet);
}
.block {
  margin-bottom: 1rem;
}
h2 {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.big {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}
.sub {
  margin: 0.375rem 0 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.bar {
  margin-top: 0.5rem;
  block-size: 0.5rem;
  border-radius: 999px;
  background: var(--bg-selected);
  overflow: hidden;
}
.bar span {
  display: block;
  block-size: 100%;
  background: var(--section-write);
}
.streaks {
  display: flex;
  gap: 1.5rem;
  margin: 0;
}
.streaks dt {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.streaks dd {
  margin: 0;
}
.empty {
  margin: 0;
  color: var(--text-secondary);
}
.totals {
  list-style: none;
  margin: 0;
  padding: 0;
}
.totals li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-block: 0.125rem;
  border-bottom: 1px solid var(--border);
}
.totals .sum {
  padding-inline-start: 0 !important;
  font-weight: 600;
}
.chev,
.chev-gap {
  flex: none;
  inline-size: 1.75rem;
  block-size: 1.75rem;
}
.chev {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}
.chev:focus-visible,
.more:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.kind {
  flex: none;
  inline-size: 4.5rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.name {
  flex: 1;
  min-inline-size: 0;
  overflow-wrap: anywhere;
}
.num {
  font-variant-numeric: tabular-nums;
}
.sessions {
  inline-size: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.sessions th,
.sessions td {
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--border);
  text-align: start;
  font-weight: 400;
}
.sessions thead th {
  font-weight: 600;
}
.sessions .r {
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.live {
  margin-inline-start: 0.5rem;
  color: var(--section-rules);
  font-size: 0.75rem;
}
.more {
  margin-top: 0.5rem;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
</style>
