<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Day } from '../../stats/days'

const props = defineProps<{ days: Day[]; goal: number | null }>()
const { t, n, locale } = useI18n()
const uid = useId()
const tableOpen = ref(false)

const W = 640
const H = 220
const M = { l: 44, r: 12, t: 12, b: 28 }
const plotW = W - M.l - M.r
const plotH = H - M.t - M.b

/** Round the top of the axis up to 1, 2, 5 x 10^k so the ticks are readable. */
function niceMax(v: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(v, 1)))
  for (const m of [1, 2, 5, 10]) if (v <= m * pow) return m * pow
  return 10 * pow
}

const goal = computed(() => (props.goal && props.goal > 0 ? props.goal : null))
const top = computed(() => niceMax(Math.max(10, goal.value ?? 0, ...props.days.map((d) => d.net))))
const ticks = computed(() => [0, top.value / 2, top.value])
const y = (v: number) => M.t + plotH - (v / top.value) * plotH
const step = computed(() => plotW / props.days.length)
const bars = computed(() =>
  props.days.map((d, i) => ({
    ...d,
    x: M.l + i * step.value + step.value * 0.15,
    w: step.value * 0.7,
    y: y(d.net),
    h: (d.net / top.value) * plotH,
    label: t('stats.chart.bar', { date: fmt(d.date), n: n(d.net) }),
  })),
)
const labelIdx = computed(() => [0, Math.floor((props.days.length - 1) / 2), props.days.length - 1])
const max = computed(() => Math.max(0, ...props.days.map((d) => d.net)))
const summary = computed(() =>
  t('stats.chart.summary', {
    from: fmt(props.days[0]?.date),
    to: fmt(props.days[props.days.length - 1]?.date),
    max: n(max.value),
  }),
)

function fmt(date: string | undefined): string {
  if (!date) return ''
  const [yy, m, d] = date.split('-').map(Number)
  return new Date(yy, m - 1, d).toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="chart">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-labelledby="`${uid}-t`" class="svg">
      <title :id="`${uid}-t`">{{ summary }}</title>
      <g aria-hidden="true">
        <g v-for="tk in ticks" :key="tk">
          <line :x1="M.l" :x2="W - M.r" :y1="y(tk)" :y2="y(tk)" class="grid" />
          <text :x="M.l - 6" :y="y(tk)" class="axis" text-anchor="end" dominant-baseline="middle">
            {{ n(tk) }}
          </text>
        </g>
        <rect v-for="b in bars" :key="b.date" :x="b.x" :y="b.y" :width="b.w" :height="b.h" class="bar">
          <title>{{ b.label }}</title>
        </rect>
        <text
          v-for="i in labelIdx"
          :key="i"
          :x="M.l + i * step + step / 2"
          :y="H - 8"
          class="axis"
          :text-anchor="i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'"
        >
          {{ fmt(days[i]?.date) }}
        </text>
        <template v-if="goal !== null">
          <line :x1="M.l" :x2="W - M.r" :y1="y(goal)" :y2="y(goal)" class="goal" />
          <text :x="W - M.r" :y="y(goal) - 4" class="goal-label" text-anchor="end">
            {{ t('stats.chart.goalLine', { n: n(goal) }) }}
          </text>
        </template>
      </g>
    </svg>
    <button
      type="button"
      class="toggle"
      :aria-expanded="tableOpen"
      :aria-controls="`${uid}-table`"
      @click="tableOpen = !tableOpen"
    >
      {{ tableOpen ? t('stats.chart.hideTable') : t('stats.chart.showTable') }}
    </button>
    <table :id="`${uid}-table`" :class="{ 'sr-only': !tableOpen }">
      <caption>
        {{ t('stats.chart.tableCaption') }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ t('stats.chart.date') }}</th>
          <th scope="col">{{ t('stats.chart.words') }}</th>
          <th v-if="goal !== null" scope="col">{{ t('stats.chart.goalMet') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in [...days].reverse()" :key="d.date">
          <th scope="row">{{ fmt(d.date) }}</th>
          <td>{{ n(d.net) }}</td>
          <td v-if="goal !== null">{{ d.net >= goal ? t('stats.chart.yes') : t('stats.chart.no') }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.chart {
  position: relative;
}
.svg {
  display: block;
  width: 100%;
  height: auto;
  max-height: 16rem;
}
.grid {
  stroke: var(--border);
  stroke-width: 1;
}
.axis {
  fill: var(--text-secondary);
  font-size: 11px;
}
.bar {
  fill: var(--section-write);
}
.goal {
  stroke: var(--section-timelines);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
}
.goal-label {
  fill: var(--section-timelines);
  font-size: 11px;
  font-weight: 600;
  /* halo keeps the label readable over bars */
  paint-order: stroke;
  stroke: var(--bg-sheet);
  stroke-width: 3px;
  stroke-linejoin: round;
}
.toggle {
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
.toggle:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
table {
  width: 100%;
  margin-top: 0.5rem;
  border-collapse: collapse;
  font-size: 0.875rem;
}
caption {
  text-align: start;
  color: var(--text-secondary);
  padding-bottom: 0.25rem;
}
th,
td {
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--border);
  text-align: start;
  font-weight: 400;
}
thead th {
  font-weight: 600;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
