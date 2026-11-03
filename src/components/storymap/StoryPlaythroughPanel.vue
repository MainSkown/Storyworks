<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCodexStore } from '../../codex/store'
import { resolveSpeaker, type SpeakerEntry } from '../../editor/game/speakers'
import type { ShownLine } from '../../game/playthrough'
import { describeStoryStop, isChanged, type StoryTextCtx } from '../../game/playthroughText'
import {
  advanceStory,
  chooseStory,
  followArrow,
  startStory,
  viewStory,
  type StoryModel,
  type StoryStart,
} from '../../game/storyPlaythrough'
import type { Variable } from '../../project/schemas/variables'
import { useNodeLabel } from '../conversation/nodeTypes'

const props = defineProps<{ model: StoryModel; start: StoryStart }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const codex = useCodexStore()
const labelOf = useNodeLabel()
const P = 'game.conversation.playthrough'

const state = shallowRef(startStory(props.model, props.start))
const current = computed(() => viewStory(state.value))
// Content changes keep the run going; the player decides when to restart.
const stale = computed(() => state.value.model !== props.model)
const variables = computed(() => state.value.model.variables)

const log = shallowRef<HTMLElement | null>(null)
const root = shallowRef<HTMLElement | null>(null)

function restart(): void {
  state.value = startStory(props.model, props.start)
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

function titleOfItem(itemId: string): string {
  const r = state.value.model.resolve(itemId)
  return r.kind === 'missing' ? t('game.storyPlay.unknownItem') : r.title
}
function ctxFor(itemId?: string): StoryTextCtx {
  const byId = new Map(variables.value.map((v) => [v.id, v.name]))
  const m = state.value.model
  const r = itemId ? m.resolve(itemId) : undefined
  return {
    variableName: (id) => byId.get(id) ?? t(`${P}.deletedVariable`),
    opLabel: (op) => t(`game.conversation.op.${op}`),
    nodeLabel: (id) => {
      const n = r?.kind === 'conversation' ? r.conversation.nodes.find((x) => x.id === id) : undefined
      return n ? labelOf(n) : ''
    },
    joiner: (mode) => t(`${P}.${mode === 'all' ? 'and' : 'or'}`),
    itemTitle: titleOfItem,
    boxTitle: (id) => {
      const box = m.map.boxes.find((b) => b.id === id)
      if (!box) return t('game.storyPlay.unknownItem')
      return box.kind === 'beat' ? box.text : titleOfItem(box.itemId)
    },
  }
}
const stopText = computed(() => {
  const c = current.value
  if (c.kind !== 'stopped') return ''
  const d = describeStoryStop(c.reason, ctxFor(c.itemId))
  return t(d.key, d.params)
})

function valueText(v: Variable): string {
  const x = state.value.values[v.id] ?? v.default
  return v.type === 'flag' ? t(`${P}.${x ? 'true' : 'false'}`) : String(x)
}
function defaultText(v: Variable): string {
  return t(`${P}.default`, {
    value: v.type === 'flag' ? t(`${P}.${v.default ? 'true' : 'false'}`) : String(v.default),
  })
}

function pick(id: string): void {
  state.value = chooseStory(state.value, id)
}
function go(arrowId: string): void {
  state.value = followArrow(state.value, arrowId)
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
  if (e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return
  const n = Number(e.key) - 1
  if (c.kind === 'choice' && c.options[n]) {
    e.preventDefault()
    pick(c.options[n].id)
  } else if (c.kind === 'item-end' && c.arrows[n]) {
    e.preventDefault()
    go(c.arrows[n].id)
  }
}

const hasLoop = computed(() => {
  const c = current.value
  return (c.kind === 'lines' || c.kind === 'choice') && c.loop
})
const canContinue = computed(() => ['lines', 'script', 'beat'].includes(current.value.kind))
</script>

<template>
  <section ref="root" class="play" :aria-label="t(`${P}.title`)" @keydown="onKey">
    <header class="head">
      <h2 class="title">{{ t(`${P}.title`) }}</h2>
      <QBtn flat dense no-caps icon="restart_alt" :label="t(`${P}.restart`)" @click="restart" />
      <QBtn
        flat
        dense
        round
        icon="close"
        :aria-label="t(`${P}.close`)"
        @click="emit('close')"
      />
    </header>

    <div v-if="stale" class="stale" role="status">
      <span>{{ t('game.storyPlay.stale') }}</span>
      <QBtn dense no-caps outline :label="t(`${P}.staleRestart`)" @click="restart" />
    </div>

    <div
      ref="log"
      class="log"
      role="log"
      aria-live="polite"
      :aria-label="t('game.storyPlay.log')"
      tabindex="0"
    >
      <template v-for="(entry, i) in state.log" :key="i">
        <h3 v-if="entry.type === 'item'" class="item-head">{{ entry.title }}</h3>
        <template v-else-if="entry.type === 'lines'">
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
        <p v-else-if="entry.type === 'choice'" class="choice">
          <QIcon name="subdirectory_arrow_right" size="1rem" aria-hidden="true" />
          <span class="sr-only">{{ t('game.storyPlay.youChose') }}</span>
          {{ entry.text }}
        </p>
        <p v-else class="beat">
          <span class="sr-only">{{ t('game.storyPlay.beat') }}</span>
          {{ entry.text }}
        </p>
      </template>
      <p v-if="current.kind === 'end'" class="end">{{ t('game.storyPlay.ended') }}</p>
    </div>

    <div class="actions">
      <p v-if="hasLoop" class="loop">
        <QIcon name="loop" size="1rem" aria-hidden="true" />
        {{ t(`${P}.loop`) }}
      </p>
      <div v-if="current.kind === 'stopped'" class="warn" role="alert">
        <QIcon name="warning_amber" size="1.125rem" aria-hidden="true" />
        <div>
          <strong>{{ t(`${P}.stoppedTitle`) }}</strong>
          <p>{{ stopText }}</p>
        </div>
      </div>
      <QBtn
        v-else-if="canContinue"
        data-primary
        unelevated
        no-caps
        class="act"
        icon="arrow_forward"
        :label="t(`${P}.continue`)"
        @click="state = advanceStory(state)"
      />
      <div
        v-else-if="current.kind === 'choice'"
        class="opts"
        role="group"
        :aria-label="t(`${P}.options`)"
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
      <div
        v-else-if="current.kind === 'item-end'"
        class="opts"
        role="group"
        :aria-label="t('game.storyPlay.next')"
      >
        <QBtn
          v-for="(a, i) in current.arrows"
          :key="a.id"
          :data-primary="i === 0 ? '' : undefined"
          outline
          no-caps
          align="left"
          class="act"
          icon="arrow_forward"
          :label="t('game.storyPlay.continueTo', { title: a.toTitle })"
          :aria-keyshortcuts="i < 9 ? String(i + 1) : undefined"
          @click="go(a.id)"
        />
      </div>
      <QBtn
        v-else
        data-primary
        outline
        no-caps
        class="act"
        icon="restart_alt"
        :label="t(`${P}.restart`)"
        @click="restart"
      />
      <QBtn
        v-if="current.kind === 'stopped'"
        data-primary
        outline
        no-caps
        class="act again"
        icon="restart_alt"
        :label="t(`${P}.restart`)"
        @click="restart"
      />
    </div>

    <div class="vars">
      <h3 class="vars-title">{{ t(`${P}.variables`) }}</h3>
      <p v-if="!variables.length" class="muted">{{ t(`${P}.noVariables`) }}</p>
      <table v-else>
        <thead>
          <tr>
            <th scope="col">{{ t(`${P}.variable`) }}</th>
            <th scope="col">{{ t(`${P}.value`) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in variables" :key="v.id" :class="{ changed: isChanged(v, state.values) }">
            <th scope="row">{{ v.name }}</th>
            <td>
              <span class="val">{{ valueText(v) }}</span>
              <span v-if="isChanged(v, state.values)" class="def">
                ({{ t(`${P}.changed`) }}, {{ defaultText(v) }})
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="muted note">{{ t(`${P}.note`) }}</p>
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
.item-head {
  margin: 0.75rem 0 0.375rem;
  padding-block-end: 0.125rem;
  border-block-end: 1px solid var(--border);
  font-size: 0.8125rem;
  color: var(--text-secondary);
}
.item-head:first-child {
  margin-block-start: 0;
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
.choice {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  margin: 0 0 0.5rem;
  padding-inline-start: 0.5rem;
  border-inline-start: 2px solid var(--border);
  font-size: 0.875rem;
  color: var(--text-secondary);
}
.beat {
  margin: 0 0 0.5rem;
  padding: 0.25rem 0.5rem;
  border: 1px dashed var(--border);
  border-radius: 4px;
  font-size: 0.875rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
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
.again {
  margin-block-start: 0.5rem;
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
