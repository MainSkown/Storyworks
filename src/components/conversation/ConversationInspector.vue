<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  addOption,
  connect,
  disconnect,
  moveOption,
  removeOption,
  setNodeCondition,
  setNodeSets,
  setStart,
  updateOption,
  type OptionPatch,
} from '../../game/conversationGraph'
import { setJumpLink, setOptionLink } from '../../game/crossLinks'
import { newId } from '../../project/ids'
import type { Condition, SetOp } from '../../project/schemas/condition'
import type { Conversation, ConversationOption, ItemLink } from '../../project/schemas/conversation'
import ConditionBuilder from './ConditionBuilder.vue'
import ConversationLinesEditor from './ConversationLinesEditor.vue'
import LinkTargetPicker from './LinkTargetPicker.vue'
import { NODE_ICON, useNodeLabel } from './nodeTypes'
import SetsEditor from './SetsEditor.vue'

const props = defineProps<{ conversation: Conversation; nodeId: string; editable: boolean }>()
const emit = defineEmits<{
  update: [change: (c: Conversation) => Conversation]
  /** Escape was pressed in the inspector: the parent returns focus to the node. */
  leave: []
}>()

const { t } = useI18n()
const uid = useId()
const root = ref<HTMLElement | null>(null)
const labelOf = useNodeLabel()

const node = computed(() => props.conversation.nodes.find((n) => n.id === props.nodeId) ?? null)
const isStart = computed(() => props.conversation.startNodeId === props.nodeId)
const off = computed(() => !props.editable)
const ids = computed(() => new Set(props.conversation.nodes.map((n) => n.id)))
const targets = computed(() =>
  props.conversation.nodes.map((n) => ({ id: n.id, label: labelOf(n) })),
)

const PRIMARY = '[contenteditable="true"], .opts input.control, select.control'
const ANY = 'input:not(:disabled), select:not(:disabled), button:not(:disabled)'

/** Focuses the main control (the line editor, the first option, the target); false if none showed up. */
async function focusFirst(): Promise<boolean> {
  for (let i = 0; i < 12; i++) {
    const el =
      root.value?.querySelector<HTMLElement>(PRIMARY) ?? root.value?.querySelector<HTMLElement>(ANY)
    if (el && !el.hasAttribute('disabled')) {
      el.focus()
      return true
    }
    await new Promise((r) => requestAnimationFrame(r))
  }
  return false
}
defineExpose({ focusFirst })

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && !e.defaultPrevented) {
    e.preventDefault()
    emit('leave')
  }
}

const update = (change: (c: Conversation) => Conversation) => emit('update', change)

function setContent(content: Record<string, unknown>): void {
  const id = props.nodeId
  update((c) => ({
    ...c,
    nodes: c.nodes.map((n) => (n.id === id && n.type === 'lines' ? { ...n, content } : n)),
  }))
}

// `next` of a Lines node and the target of a Jump node share one picker.
const singleTarget = computed(() => {
  const n = node.value
  return n?.type === 'lines' ? n.next : n?.type === 'jump' ? (n.target?.nodeId ?? null) : null
})
function pickSingle(to: string): void {
  const n = node.value
  if (!n) return
  const id = n.id
  const edge = n.type === 'lines' ? `next:${id}` : `jump:${id}`
  update((c) => (to ? connect(c, id, to) : disconnect(c, edge)))
}

function pickOptionTarget(optionId: string, to: string): void {
  const id = props.nodeId
  update((c) => (to ? connect(c, id, to, { optionId }) : disconnect(c, `opt:${optionId}`)))
}
const pickJumpLink = (link: ItemLink | null) =>
  update((c) => setJumpLink(c, props.nodeId, link))
const pickOptionLink = (optionId: string, link: ItemLink | null) =>
  update((c) => setOptionLink(c, props.nodeId, optionId, link))
const jump = computed(() => (node.value?.type === 'jump' ? node.value : null))
const patchOption = (optionId: string, patch: OptionPatch) =>
  update((c) => updateOption(c, props.nodeId, optionId, patch))
const newOption = () => {
  const optionId = newId()
  update((c) => addOption(c, props.nodeId, { id: optionId }))
}
const options = computed<ConversationOption[]>(() => {
  const n = node.value
  return n?.type === 'choice' ? n.options : []
})
const setCondition = (c: Condition | undefined) =>
  update((x) => setNodeCondition(x, props.nodeId, c))
const setSets = (s: SetOp[]) => update((x) => setNodeSets(x, props.nodeId, s))
</script>

<template>
  <aside
    v-if="node"
    ref="root"
    class="insp"
    :aria-label="t('game.conversation.inspector')"
    @keydown="onKeydown"
  >
    <h2 class="title">
      <QIcon :name="NODE_ICON[node.type]" size="1.25rem" aria-hidden="true" />
      {{ t(`game.conversation.type.${node.type}`) }}
    </h2>
    <p class="note">{{ t(`game.conversation.typeHint.${node.type}`) }}</p>

    <label class="check">
      <input
        type="checkbox"
        :checked="isStart"
        :disabled="off || isStart"
        @change="update((c) => setStart(c, node!.id))"
      />
      {{ t('game.conversation.startHere') }}
    </label>
    <p v-if="isStart" class="note">{{ t('game.conversation.startIs') }}</p>

    <section v-if="node.type === 'lines'" class="block">
      <ConversationLinesEditor
        :key="node.id"
        :conversation-id="conversation.id"
        :node-id="node.id"
        :content="node.content"
        :editable="editable"
        @change="setContent"
      />
    </section>

    <section v-if="node.type === 'lines'" class="block">
      <label class="label" :for="`${uid}-target`">{{ t('game.conversation.target.label') }}</label>
      <select
        :id="`${uid}-target`"
        class="control"
        :value="singleTarget ?? ''"
        :disabled="off"
        @change="pickSingle(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ t('game.conversation.target.none') }}</option>
        <option v-if="singleTarget && !ids.has(singleTarget)" :value="singleTarget">
          {{ t('game.conversation.target.missing') }}
        </option>
        <option v-for="x in targets" :key="x.id" :value="x.id">{{ x.label }}</option>
      </select>
    </section>

    <section v-if="jump" class="block">
      <h3 class="label">{{ t('game.conversation.target.label') }}</h3>
      <LinkTargetPicker
        :target="singleTarget"
        :link="jump.link"
        :nodes="targets"
        suffix=""
        :disabled="off"
        @node="pickSingle"
        @link="pickJumpLink"
      />
    </section>

    <section v-if="node.type === 'choice'" class="block" aria-labelledby="opt-title">
      <h3 id="opt-title" class="label">{{ t('game.conversation.options.title') }}</h3>
      <p v-if="!options.length" class="note">{{ t('game.conversation.options.empty') }}</p>
      <ol class="opts">
        <li v-for="(o, i) in options" :key="o.id" class="opt">
          <div class="opt-head">
            <span class="opt-n">{{ t('game.conversation.options.label', { n: i + 1 }) }}</span>
            <QBtn
              flat
              dense
              round
              icon="arrow_upward"
              :aria-label="t('game.conversation.options.up', { n: i + 1 })"
              :title="t('game.conversation.options.up', { n: i + 1 })"
              :disable="off || i === 0"
              @click="update((c) => moveOption(c, node!.id, o.id, i - 1))"
            />
            <QBtn
              flat
              dense
              round
              icon="arrow_downward"
              :aria-label="t('game.conversation.options.down', { n: i + 1 })"
              :title="t('game.conversation.options.down', { n: i + 1 })"
              :disable="off || i === options.length - 1"
              @click="update((c) => moveOption(c, node!.id, o.id, i + 1))"
            />
            <QBtn
              flat
              dense
              round
              icon="close"
              :aria-label="t('game.conversation.options.remove', { n: i + 1 })"
              :title="t('game.conversation.options.remove', { n: i + 1 })"
              :disable="off"
              @click="update((c) => removeOption(c, node!.id, o.id))"
            />
          </div>
          <input
            class="control"
            type="text"
            :aria-label="t('game.conversation.options.text', { n: i + 1 })"
            :value="o.text"
            :disabled="off"
            @input="patchOption(o.id, { text: ($event.target as HTMLInputElement).value })"
          />
          <LinkTargetPicker
            :target="o.target ?? null"
            :link="o.link"
            :nodes="targets"
            :suffix="t('game.conversation.options.label', { n: i + 1 })"
            :disabled="off"
            @node="pickOptionTarget(o.id, $event)"
            @link="pickOptionLink(o.id, $event)"
          />
          <p class="label">{{ t('game.conversation.optionCondition') }}</p>
          <ConditionBuilder
            :model-value="o.condition"
            :label="`${t('game.conversation.optionCondition')} (${t('game.conversation.options.label', { n: i + 1 })})`"
            :disabled="off"
            @update:model-value="patchOption(o.id, { condition: $event })"
          />
          <p class="label">{{ t('game.conversation.optionSets') }}</p>
          <SetsEditor
            :model-value="o.sets"
            :label="`${t('game.conversation.optionSets')} (${t('game.conversation.options.label', { n: i + 1 })})`"
            :disabled="off"
            @update:model-value="patchOption(o.id, { sets: $event })"
          />
        </li>
      </ol>
      <QBtn
        outline
        dense
        no-caps
        icon="add"
        :label="t('game.conversation.options.add')"
        :disable="off"
        @click="newOption"
      />
    </section>

    <p v-if="node.type === 'end'" class="note">{{ t('game.conversation.endNote') }}</p>

    <section class="block">
      <h3 class="label">{{ t('game.conversation.entryCondition') }}</h3>
      <ConditionBuilder
        :model-value="node.condition"
        :label="t('game.conversation.entryCondition')"
        :disabled="off"
        @update:model-value="setCondition"
      />
    </section>
    <section class="block">
      <h3 class="label">{{ t('game.conversation.sets') }}</h3>
      <SetsEditor
        :model-value="node.sets"
        :label="t('game.conversation.sets')"
        :disabled="off"
        @update:model-value="setSets"
      />
    </section>
  </aside>
</template>

<style scoped>
.insp {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
  padding: 0.75rem;
  overflow-y: auto;
  background: var(--bg-panel);
  color: var(--text-primary);
}
.title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0;
  font-size: 1.0625rem;
}
.note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
.label {
  margin: 0.25rem 0 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.control {
  width: 100%;
  box-sizing: border-box;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.control:focus-visible,
.check input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.opts {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.opt {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
}
.opt-head {
  display: flex;
  align-items: center;
}
.opt-n {
  flex: 1;
  font-weight: 600;
  font-size: 0.8125rem;
}
</style>
