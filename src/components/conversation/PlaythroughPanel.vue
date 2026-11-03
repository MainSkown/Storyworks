<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCodexStore } from '../../codex/store'
import { resolveSpeaker, type SpeakerEntry } from '../../editor/game/speakers'
import {
  advance,
  choose,
  start,
  view,
  type PlayState,
  type ShownLine,
} from '../../game/playthrough'
import { describeStop, isChanged, type TextCtx } from '../../game/playthroughText'
import type { Conversation } from '../../project/schemas/conversation'
import type { Variable } from '../../project/schemas/variables'
import { useVariablesStore } from '../../variables/store'
import { useNodeLabel } from './nodeTypes'

const props = defineProps<{ conversation: Conversation }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const codex = useCodexStore()
const vars = useVariablesStore()
const labelOf = useNodeLabel()

const state = shallowRef<PlayState>(start(props.conversation, vars.variables))
const current = computed(() => view(state.value))
// Content changes keep the run going; the player decides when to restart.
const stale = computed(
  () => state.value.conv !== props.conversation || state.value.variables !== vars.variables,
)

const log = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)

function restart(): void {
  state.value = start(props.conversation, vars.variables)
}

const speakerById = computed(
  () =>
    new Map<string, SpeakerEntry>(
      codex.entries.map((e) => [e.id, { id: e.id, name: e.name, aliases: e.aliases }]),
    ),
)
function speakerOf(l: ShownLine): string {
  if (l.kind === 'text') return ''
  const v = resolveSpeaker(l, (id) => speakerById.value.get(id))
  return v.state === 'entry' || v.state === 'name'
    ? v.name
    : v.state === 'broken'
      ? t('speaker.deleted')
      : ''
}

const ctx = computed<TextCtx>(() => {
  const byId = new Map(state.value.variables.map((v) => [v.id, v.name]))
  return {
    variableName: (id) => byId.get(id) ?? t('game.conversation.playthrough.deletedVariable'),
    opLabel: (op) => t(`game.conversation.op.${op}`),
    nodeLabel: (id) => {
      const n = state.value.conv.nodes.find((x) => x.id === id)
      return n ? labelOf(n) : ''
    },
    joiner: (m) => t(`game.conversation.playthrough.${m === 'all' ? 'and' : 'or'}`),
  }
})
const stopText = computed(() => {
  const c = current.value
  if (c.kind !== 'stopped') return ''
  const d = describeStop(c.reason, ctx.value)
  return t(d.key, d.params)
})

function valueText(v: Variable): string {
  const x = state.value.values[v.id] ?? v.default
  return v.type === 'flag' ? t(`game.conversation.playthrough.${x ? 'true' : 'false'}`) : String(x)
}
function defaultText(v: Variable): string {
  return t('game.conversation.playthrough.default', {
    value:
      v.type === 'flag'
        ? t(`game.conversation.playthrough.${v.default ? 'true' : 'false'}`)
        : String(v.default),
  })
}

function pick(id: string): void {
  state.value = choose(state.value, id)
}

async function afterStep(): Promise<void> {
  await nextTick()
  if (log.value) log.value.scrollTop = log.value.scrollHeight
  root.value?.querySelector<HTMLElement>('[data-primary]')?.focus()
}
watch(state, () => void afterStep())
onMounted(() => void afterStep())

function onKey(e: KeyboardEvent): void {
  const c = current.value
  if (c.kind !== 'choice' || e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return
  const o = c.options[Number(e.key) - 1]
  if (o) {
    e.preventDefault()
    pick(o.id)
  }
}
</script>

<template>
  <section
    ref="root"
    class="play"
    :aria-label="t('game.conversation.playthrough.title')"
    @keydown="onKey"
  >
    <header class="head">
      <h2 class="title">{{ t('game.conversation.playthrough.title') }}</h2>
      <QBtn
        flat
        dense
        no-caps
        icon="restart_alt"
        :label="t('game.conversation.playthrough.restart')"
        @click="restart"
      />
      <QBtn
        flat
        dense
        round
        icon="close"
        :aria-label="t('game.conversation.playthrough.close')"
        @click="emit('close')"
      />
    </header>

    <div v-if="stale" class="stale" role="status">
      <span>{{ t('game.conversation.playthrough.stale') }}</span>
      <QBtn
        dense
        no-caps
        outline
        :label="t('game.conversation.playthrough.staleRestart')"
        @click="restart"
      />
    </div>

    <div
      ref="log"
      class="log"
      role="log"
      aria-live="polite"
      :aria-label="t('game.conversation.playthrough.log')"
      tabindex="0"
    >
      <template v-for="(entry, i) in state.log" :key="i">
        <p
          v-for="l in entry.lines"
          :key="`${i}-${l.lineId}`"
          class="line"
          :class="{ narration: l.kind === 'text' || !speakerOf(l) }"
        >
          <strong v-if="speakerOf(l)" class="who">{{ speakerOf(l) }}</strong>
          <span class="said">{{ l.text }}</span>
        </p>
      </template>
      <p v-if="current.kind === 'end'" class="end">
        {{ t('game.conversation.playthrough.ended') }}
      </p>
    </div>

    <div class="actions">
      <p v-if="current.kind !== 'stopped' && current.kind !== 'end' && current.loop" class="loop">
        <QIcon name="loop" size="1rem" aria-hidden="true" />
        {{ t('game.conversation.playthrough.loop') }}
      </p>
      <div v-if="current.kind === 'stopped'" class="warn" role="alert">
        <QIcon name="warning_amber" size="1.125rem" aria-hidden="true" />
        <div>
          <strong>{{ t('game.conversation.playthrough.stoppedTitle') }}</strong>
          <p>{{ stopText }}</p>
        </div>
      </div>
      <QBtn
        v-else-if="current.kind === 'lines'"
        data-primary
        unelevated
        no-caps
        class="act"
        icon="arrow_forward"
        :label="t('game.conversation.playthrough.continue')"
        @click="state = advance(state)"
      />
      <div
        v-else-if="current.kind === 'choice'"
        class="opts"
        role="group"
        :aria-label="t('game.conversation.playthrough.options')"
      >
        <QBtn
          v-for="(o, i) in current.options"
          :key="o.id"
          :data-primary="i === 0 ? '' : undefined"
          outline
          no-caps
          align="left"
          class="act"
          :label="`${i + 1}. ${o.text}`"
          :aria-keyshortcuts="i < 9 ? String(i + 1) : undefined"
          @click="pick(o.id)"
        />
      </div>
      <QBtn
        v-else
        data-primary
        outline
        no-caps
        class="act"
        icon="restart_alt"
        :label="t('game.conversation.playthrough.restart')"
        @click="restart"
      />
    </div>

    <div class="vars">
      <h3 class="vars-title">{{ t('game.conversation.playthrough.variables') }}</h3>
      <p v-if="!state.variables.length" class="muted">
        {{ t('game.conversation.playthrough.noVariables') }}
      </p>
      <table v-else>
        <thead>
          <tr>
            <th scope="col">{{ t('game.conversation.playthrough.variable') }}</th>
            <th scope="col">{{ t('game.conversation.playthrough.value') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="v in state.variables"
            :key="v.id"
            :class="{ changed: isChanged(v, state.values) }"
          >
            <th scope="row">{{ v.name }}</th>
            <td>
              <span class="val">{{ valueText(v) }}</span>
              <span v-if="isChanged(v, state.values)" class="def">
                ({{ t('game.conversation.playthrough.changed') }}, {{ defaultText(v) }})
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="muted note">{{ t('game.conversation.playthrough.note') }}</p>
    </div>
  </section>
</template>

<style scoped>
.play {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-panel);
  color: var(--text-primary);
}
.head {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border-block-end: 1px solid var(--border);
}
.title {
  flex: 1;
  margin: 0;
  font-size: 1rem;
}
.stale {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-block-end: 1px solid var(--border);
  background: var(--bg-raised);
  font-size: 0.8125rem;
}
.log {
  flex: 1 1 0;
  min-height: 6rem;
  overflow: auto;
  padding: 0.75rem;
  background: var(--bg-raised);
}
.log:focus-visible,
.act:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.line {
  margin: 0 0 0.5rem;
}
.who {
  display: block;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}
.narration .said {
  font-style: italic;
  color: var(--text-secondary);
}
.end {
  margin: 0.5rem 0 0;
  font-weight: 600;
}
.actions {
  flex: none;
  padding: 0.5rem 0.75rem;
  border-block-start: 1px solid var(--border);
}
.opts {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.act {
  width: 100%;
}
.loop {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0 0 0.375rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.warn {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--tag-problem);
  border-inline-start-width: 4px;
  border-radius: 4px;
  background: var(--bg-raised);
  color: var(--text-primary);
}
.warn :deep(.q-icon) {
  flex: none;
  margin-block-start: 0.125rem;
  color: var(--tag-problem);
}
.warn p {
  margin: 0.125rem 0 0;
  font-size: 0.875rem;
}
.vars {
  flex: none;
  max-height: 35%;
  overflow: auto;
  padding: 0.5rem 0.75rem;
  border-block-start: 1px solid var(--border);
}
.vars-title {
  margin: 0 0 0.25rem;
  font-size: 0.8125rem;
  text-transform: none;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}
th,
td {
  padding: 0.125rem 0.25rem;
  text-align: start;
  font-weight: 400;
  vertical-align: top;
}
thead th {
  color: var(--text-secondary);
  border-block-end: 1px solid var(--border);
}
.changed {
  background: var(--bg-selected);
}
.changed .val {
  font-weight: 700;
}
.def,
.muted {
  color: var(--text-secondary);
}
.def {
  margin-inline-start: 0.25rem;
  font-size: 0.75rem;
}
.muted {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
}
</style>
