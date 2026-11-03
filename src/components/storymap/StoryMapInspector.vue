<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { openTarget } from '../../search/open'
import { useProjectStore } from '../../project/store'
import type { StoryBox } from '../../project/schemas/storyMap'
import { derivedList, selectedArrowId, selectedBoxId, shownMap } from '../../storymap/selection'
import { removeBox, disconnect, setArrowCondition, setBeatText, setStart } from '../../storymap/ops'
import { useStoryMapStore } from '../../storymap/store'
import { useConditionText } from '../../storymap/useConditionText'
import { useStoryItems } from '../../storymap/useItems'
import MechanicsUsing from '../gamedoc/MechanicsUsing.vue'
import ConditionBuilder from '../conversation/ConditionBuilder.vue'

const { t } = useI18n()
const project = useProjectStore()
const store = useStoryMapStore()
const { itemOf, stateOf } = useStoryItems()
const condText = useConditionText()

const map = computed(() => shownMap.value ?? store.map)
const locked = computed(
  () => !!project.readOnly || (store.status !== 'none' && store.status !== 'ok'),
)

const lockKey = computed(() =>
  project.readOnly
    ? 'storymap.readOnly'
    : store.status === 'invalid' || store.status === 'missing'
      ? `storymap.${store.status}`
      : null,
)

const boxTitle = (b: StoryBox | undefined): string =>
  !b
    ? t('storymap.inspector.unknownBox')
    : b.kind === 'beat'
      ? b.text.trim() || t('storymap.emptyBeat')
      : (itemOf(b)?.title ?? t('storymap.badge.deleted'))
const titleOf = (id: string) => boxTitle(map.value.boxes.find((b) => b.id === id))

const box = computed(() => map.value.boxes.find((b) => b.id === selectedBoxId.value))
const item = computed(() => (box.value ? itemOf(box.value) : null))
const state = computed(() => (box.value ? stateOf(box.value) : null))

const arrow = computed(() => {
  const id = selectedArrowId.value
  if (!id) return null
  const manual = map.value.arrows.find((a) => a.id === id)
  if (manual) return { id, from: manual.from, to: manual.to, manual, derived: null }
  const derived = derivedList.value.find((a) => a.id === id)
  return derived ? { id, from: derived.from, to: derived.to, manual: null, derived } : null
})

const outgoing = computed(() => {
  const id = box.value?.id
  if (!id) return []
  const manual = map.value.arrows
    .filter((a) => a.from === id)
    .map((a) => ({
      id: a.id,
      to: a.to,
      auto: false,
      text: a.condition ? condText(a.condition) : '',
    }))
  const auto = derivedList.value
    .filter((a) => a.from === id)
    .map((a) => ({ id: a.id, to: a.to, auto: true, text: '' }))
  return [...manual, ...auto]
})

function sourceText(s: { text: string | undefined; optionId?: string }): string {
  if (s.optionId === undefined) return t('storymap.inspector.sourceJump')
  return s.text?.trim()
    ? t('storymap.inspector.sourceOption', { text: s.text })
    : t('storymap.inspector.sourceOptionEmpty')
}

const edit = (op: Parameters<typeof store.edit>[0]) => void store.edit(op)

function selectArrow(id: string): void {
  selectedBoxId.value = null
  selectedArrowId.value = id
}
function selectBox(id: string): void {
  selectedArrowId.value = null
  selectedBoxId.value = id
}
function removeArrow(id: string): void {
  edit((m) => disconnect(m, id))
  selectedArrowId.value = null
}
function deleteBox(id: string): void {
  edit((m) => removeBox(m, id))
  selectedBoxId.value = null
}
</script>

<template>
  <div class="insp" data-testid="storymap-inspector">
    <p v-if="lockKey" class="note">{{ t(lockKey) }}</p>

    <template v-if="arrow">
      <h3 class="title">{{ t('storymap.inspector.arrow') }}</h3>
      <dl class="ft">
        <dt>{{ t('storymap.inspector.from') }}</dt>
        <dd>
          <button type="button" class="link" @click="selectBox(arrow.from)">
            {{ titleOf(arrow.from) }}
          </button>
        </dd>
        <dt>{{ t('storymap.inspector.to') }}</dt>
        <dd>
          <button type="button" class="link" @click="selectBox(arrow.to)">
            {{ titleOf(arrow.to) }}
          </button>
        </dd>
      </dl>
      <template v-if="arrow.manual">
        <h4 class="label">{{ t('storymap.inspector.condition') }}</h4>
        <ConditionBuilder
          :model-value="arrow.manual.condition"
          :label="
            t('storymap.inspector.conditionLabel', {
              from: titleOf(arrow.from),
              to: titleOf(arrow.to),
            })
          "
          :disabled="locked"
          @update:model-value="edit((m) => setArrowCondition(m, arrow!.id, $event))"
        />
        <p v-if="!arrow.manual.condition" class="note">{{ t('storymap.inspector.noCondition') }}</p>
        <QBtn
          outline
          dense
          no-caps
          icon="delete"
          :label="t('storymap.inspector.deleteArrow')"
          :disable="locked"
          @click="removeArrow(arrow.id)"
        />
      </template>
      <template v-else-if="arrow.derived">
        <p class="note">{{ t('storymap.inspector.autoNote') }}</p>
        <h4 class="label">{{ t('storymap.inspector.sources') }}</h4>
        <ul class="plain">
          <li v-for="s in arrow.derived.sources" :key="`${s.nodeId}/${s.optionId ?? ''}`">
            {{ sourceText(s) }}
            <span v-if="s.condition" class="cond">{{ condText(s.condition) }}</span>
          </li>
        </ul>
      </template>
    </template>

    <template v-else-if="box">
      <h3 class="title">{{ boxTitle(box) }}</h3>
      <p v-if="state === 'trashed' || state === 'deleted'" class="note">
        {{ t(state === 'trashed' ? 'storymap.badge.trash' : 'storymap.badge.deleted') }}.
        {{ t('storymap.inspector.openGone') }}
      </p>
      <QBtn
        v-if="box.kind === 'item'"
        outline
        dense
        no-caps
        icon="edit"
        :label="t('storymap.inspector.open')"
        :disable="!item || item.trashed"
        @click="item && openTarget({ id: item.id, kind: item.type })"
      />

      <template v-if="box.kind === 'beat'">
        <label class="label" for="storymap-beat-text">{{ t('storymap.inspector.beatText') }}</label>
        <textarea
          id="storymap-beat-text"
          class="control"
          rows="4"
          :value="box.text"
          :disabled="locked"
          @input="
            edit((m) => setBeatText(m, box!.id, ($event.target as HTMLTextAreaElement).value))
          "
        />
      </template>

      <label class="check">
        <input
          type="checkbox"
          :checked="box.start"
          :disabled="locked"
          @change="edit((m) => setStart(m, box!.id, ($event.target as HTMLInputElement).checked))"
        />
        {{ t('storymap.inspector.start') }}
      </label>
      <p class="note">{{ t('storymap.inspector.startHint') }}</p>

      <QBtn
        v-if="box.kind === 'beat' || state === 'deleted'"
        outline
        dense
        no-caps
        icon="delete"
        :label="
          box.kind === 'beat' ? t('storymap.delete.confirm') : t('storymap.inspector.removeBox')
        "
        :disable="locked"
        @click="deleteBox(box.id)"
      />

      <h4 class="label">{{ t('storymap.inspector.mechanics') }}</h4>
      <MechanicsUsing
        :id="box.kind === 'beat' ? box.id : box.itemId"
        :kind="box.kind === 'beat' ? 'beat' : 'item'"
      />

      <h4 class="label">{{ t('storymap.inspector.arrowsOut') }}</h4>
      <p v-if="!outgoing.length" class="note">{{ t('storymap.inspector.noArrows') }}</p>
      <ul v-else class="plain">
        <li v-for="a in outgoing" :key="a.id">
          <button
            type="button"
            class="link"
            :aria-label="t('storymap.inspector.selectArrow', { title: titleOf(a.to) })"
            @click="selectArrow(a.id)"
          >
            {{ t('storymap.inspector.arrowItem', { title: titleOf(a.to) }) }}
          </button>
          <span v-if="a.auto" class="tag">{{ t('storymap.inspector.autoTag') }}</span>
          <span v-if="a.text" class="cond">{{ a.text }}</span>
        </li>
      </ul>
    </template>

    <p v-else class="note">{{ t('storymap.inspector.none') }}</p>
  </div>
</template>

<style scoped>
.insp {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  color: var(--text-primary);
}
.title {
  margin: 0;
  font-size: 1.0625rem;
  overflow-wrap: anywhere;
}
.note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.label {
  margin: 0.25rem 0 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
  resize: vertical;
}
.control:focus-visible,
.check input:focus-visible,
.link:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.ft {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 0.5rem;
  margin: 0;
}
.ft dt {
  color: var(--text-secondary);
}
.ft dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.plain {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--section-storymap);
  font: inherit;
  text-align: start;
  text-decoration: underline;
  cursor: pointer;
}
.tag {
  margin-inline-start: 0.375rem;
  padding: 0 0.375rem;
  border: 1px dashed var(--border-strong);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 0.6875rem;
}
.cond {
  display: block;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
</style>
