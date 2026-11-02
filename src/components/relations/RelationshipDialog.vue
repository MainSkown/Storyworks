<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { QSelect } from 'quasar'
import { formatDate } from '../../calendar'
import { useCodexStore } from '../../codex/store'
import { endpoints, entryOptions, rejectionKey, type Direction } from '../../relations/form'
import { useRelationsStore } from '../../relations/store'
import { describeTarget } from '../../timeline/pick'
import { useTimelinesStore } from '../../timeline/store'
import MiniRichText from '../MiniRichText.vue'
import NodePickerDialog from '../NodePickerDialog.vue'

const props = defineProps<{ entryId: string; relationshipId?: string | null }>()
const open = defineModel<boolean>({ required: true })

const { t } = useI18n()
const relations = useRelationsStore()
const codex = useCodexStore()
const timelines = useTimelinesStore()

type NodeRef = { timelineId: string; nodeId: string } | null

const direction = ref<Direction>('out')
const otherId = ref<string | null>(null)
const typeId = ref<string | null>(null)
const newTypeName = ref('')
const newReverse = ref('')
const note = ref<Record<string, unknown>>({ type: 'doc', content: [] })
const nodeRef = ref<NodeRef>(null)
const locked = computed(() => !!relations.readOnly)
const message = ref('')
const saving = ref(false)
const nodePickerOpen = ref(false)
const noteKey = ref('new')
let opened = 0
let original: NodeRef = null

const editing = computed(() => (props.relationshipId ? relations.relationships.find((r) => r.id === props.relationshipId) : undefined))
const self = computed(() => codex.entries.find((e) => e.id === props.entryId))
const selfName = computed(() => self.value?.name || t('codex.untitled'))

watch(open, (v) => {
  if (!v) return
  message.value = ''
  saving.value = false
  newTypeName.value = ''
  newReverse.value = ''
  noteKey.value = `${props.relationshipId ?? 'new'}-${++opened}`
  const r = editing.value
  if (r) {
    direction.value = r.fromId === props.entryId ? 'out' : 'in'
    otherId.value = direction.value === 'out' ? r.toId : r.fromId
    typeId.value = r.typeId
    note.value = r.note
    nodeRef.value = r.nodeRef
    original = r.nodeRef
  } else {
    direction.value = 'out'
    otherId.value = null
    typeId.value = null
    note.value = { type: 'doc', content: [] }
    nodeRef.value = null
    original = null
  }
})

const directionOptions = computed(() => [
  { value: 'out', label: t('relations.dialog.dirOut', { name: selfName.value }) },
  { value: 'in', label: t('relations.dialog.dirIn', { name: selfName.value }) },
])

// ---- other entry ----
const otherQuery = ref('')
const otherOptions = computed(() =>
  entryOptions(codex.entries, codex.types, otherQuery.value, [props.entryId]),
)
const otherLabel = computed(() => {
  if (!otherId.value) return undefined
  const e = codex.entries.find((x) => x.id === otherId.value)
  return e ? e.name || t('codex.untitled') : t('relations.dialog.otherMissing')
})
function filterOther(val: string, update: (fn: () => void) => void): void {
  update(() => {
    otherQuery.value = val
  })
}

// ---- type ----
const typeSelect = ref<QSelect | null>(null)
const typeQuery = ref('')
const typeOptions = computed(() => {
  const q = typeQuery.value.trim().toLowerCase()
  return relations.types
    .filter((x) => !q || x.name.toLowerCase().includes(q))
    .map((x) => ({ value: x.id, label: x.name, color: x.color }))
})
const chosenType = computed(() => relations.types.find((x) => x.id === typeId.value))
const typeLabel = computed(() =>
  newTypeName.value
    ? t('relations.dialog.typeNew', { name: newTypeName.value })
    : chosenType.value?.name,
)
const reverseHint = computed(() => {
  const ty = chosenType.value
  if (!ty) return ''
  return ty.reverseLabel
    ? t('relations.dialog.reverseHint', { label: ty.reverseLabel })
    : t('relations.dialog.reverseSame')
})
function filterType(val: string, update: (fn: () => void) => void): void {
  update(() => {
    typeQuery.value = val
  })
}
function onNewType(val: string, done: () => void): void {
  const name = val.trim()
  if (name) {
    const found = relations.types.find((x) => x.name.toLowerCase() === name.toLowerCase())
    typeId.value = found ? found.id : null
    newTypeName.value = found ? '' : name
  }
  done()
  // Quasar re-opens the menu while clearing the typed text; close it after that settles.
  setTimeout(() => typeSelect.value?.hidePopup(), 50)
}
function onPickType(id: string | null): void {
  typeId.value = id
  newTypeName.value = ''
}

// ---- event link ----
const nodeInfo = computed(() =>
  nodeRef.value
    ? describeTarget(
        timelines.loadedTimelines,
        { item: nodeRef.value.timelineId, block: nodeRef.value.nodeId },
        (d) => formatDate(timelines.calendar, d),
      )
    : null,
)
function onPickNode(timelineId: string, nodeId: string): void {
  nodeRef.value = { timelineId, nodeId }
}

// ---- save ----
const sameRef = (a: NodeRef, b: NodeRef) =>
  a === b || (!!a && !!b && a.timelineId === b.timelineId && a.nodeId === b.nodeId)
const canSave = computed(
  () =>
    !locked.value &&
    !saving.value &&
    !!otherId.value &&
    (!!typeId.value || !!newTypeName.value.trim()),
)

async function save(): Promise<void> {
  if (!canSave.value || !otherId.value) return
  saving.value = true
  message.value = ''
  try {
    let tid = typeId.value
    if (!tid) {
      const known = new Set(relations.types.map((x) => x.id))
      tid = await relations.findOrCreateTypeByName(newTypeName.value)
      if (!tid) {
        message.value = t(rejectionKey('other'))
        return
      }
      if (!known.has(tid) && newReverse.value.trim())
        relations.updateType(tid, { reverseLabel: newReverse.value })
      typeId.value = tid
      newTypeName.value = ''
    }
    const ends = endpoints(props.entryId, otherId.value, direction.value)
    const r = editing.value
      ? relations.updateRelationship(editing.value.id, {
          ...ends,
          typeId: tid,
          note: note.value,
          ...(sameRef(nodeRef.value, original) ? {} : { nodeRef: nodeRef.value }),
        })
      : await relations.createRelationship({
          ...ends,
          typeId: tid,
          note: note.value,
          nodeRef: nodeRef.value,
        })
    if (r.ok) open.value = false
    else message.value = t(rejectionKey(r.reason))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="rel-dlg-title">
      <form @submit.prevent="save">
        <QCardSection class="body">
          <h2 id="rel-dlg-title" class="title">
            {{ editing ? t('relations.dialog.editTitle') : t('relations.dialog.addTitle') }}
          </h2>

          <QOptionGroup
            v-model="direction"
            type="radio"
            :options="directionOptions"
            :aria-label="t('relations.dialog.direction')"
            :disable="locked"
          />

          <QSelect
            v-model="otherId"
            :options="otherOptions"
            :label="t('relations.dialog.other')"
            :display-value="otherLabel"
            outlined
            dense
            use-input
            input-debounce="0"
            emit-value
            map-options
            options-dense
            :disable="locked"
            @filter="filterOther"
          >
            <template #option="{ opt, itemProps }">
              <QItem v-bind="itemProps">
                <QItemSection>{{ opt.label }}</QItemSection>
                <QItemSection v-if="opt.typeName" side>
                  <span class="type-tag">
                    <span class="dot" :style="{ background: opt.typeColor ?? undefined }" aria-hidden="true" />{{ opt.typeName }}
                  </span>
                </QItemSection>
              </QItem>
            </template>
            <template #no-option>
              <QItem><QItemSection class="muted">{{ t('relations.dialog.otherNone') }}</QItemSection></QItem>
            </template>
          </QSelect>

          <QSelect
            ref="typeSelect"
            :model-value="typeId"
            :options="typeOptions"
            :label="t('relations.dialog.type')"
            :hint="t('relations.dialog.typeHint')"
            :display-value="typeLabel"
            outlined
            dense
            use-input
            input-debounce="0"
            new-value-mode="add"
            emit-value
            map-options
            options-dense
            :disable="locked"
            @filter="filterType"
            @new-value="onNewType"
            @update:model-value="onPickType"
          >
            <template #option="{ opt, itemProps }">
              <QItem v-bind="itemProps">
                <QItemSection avatar>
                  <span class="dot" :style="{ background: opt.color }" aria-hidden="true" />
                </QItemSection>
                <QItemSection>{{ opt.label }}</QItemSection>
              </QItem>
            </template>
            <template #no-option>
              <QItem><QItemSection class="muted">{{ t('relations.dialog.typeNone') }}</QItemSection></QItem>
            </template>
          </QSelect>
          <p v-if="reverseHint" class="muted">{{ reverseHint }}</p>
          <input
            v-if="newTypeName"
            v-model="newReverse"
            class="control"
            :placeholder="t('relations.dialog.newReverse')"
            :aria-label="t('relations.dialog.newReverse')"
          />

          <span class="label">{{ t('relations.dialog.note') }}</span>
          <MiniRichText
            v-model="note"
            :item-key="noteKey"
            :label="t('relations.dialog.note')"
            :disabled="locked"
          />

          <span class="label">{{ t('relations.dialog.node') }}</span>
          <div class="node-row">
            <template v-if="nodeRef">
              <span v-if="nodeInfo" class="node-name">
                <QIcon name="event" size="1rem" aria-hidden="true" />
                {{ nodeInfo.title || t('relations.untitledEvent') }}
                <span class="muted">· {{ nodeInfo.timelineName }}<template v-if="nodeInfo.date"> · {{ nodeInfo.date }}</template></span>
              </span>
              <span v-else class="node-name gone">
                <QIcon name="error_outline" size="1rem" aria-hidden="true" />
                {{ t('relations.dialog.nodeMissing') }}
              </span>
            </template>
            <span v-else class="muted">{{ t('relations.dialog.nodeNone') }}</span>
            <QBtn
              v-if="!locked"
              flat
              no-caps
              icon="link"
              :label="nodeRef ? t('relations.dialog.nodeChange') : t('relations.dialog.nodePick')"
              @click="nodePickerOpen = true"
            />
            <QBtn
              v-if="nodeRef && !locked"
              flat
              round
              dense
              icon="close"
              :aria-label="t('relations.dialog.nodeClear')"
              @click="nodeRef = null"
            />
          </div>

          <p v-if="message" class="error" role="alert">
            <QIcon name="error_outline" size="1rem" aria-hidden="true" />
            {{ message }}
          </p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps :label="t('relations.dialog.cancel')" @click="open = false" />
          <QBtn
            unelevated
            no-caps
            type="submit"
            class="btn-section"
            :label="editing ? t('relations.dialog.save') : t('relations.dialog.create')"
            :disable="!canSave"
          />
        </QCardActions>
      </form>
    </QCard>
  </QDialog>

  <NodePickerDialog
    v-model="nodePickerOpen"
    :title="t('relations.dialog.nodePickerTitle')"
    :tabs="['events']"
    @pick="onPickNode"
  />
</template>

<style scoped>
.dialog {
  width: min(36rem, 94vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 75vh;
  overflow-y: auto;
}
.title {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
}
.label {
  margin-top: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.type-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.dot {
  display: inline-block;
  flex: none;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  background: var(--text-secondary);
}
.control {
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.control:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.node-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.node-name {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  overflow-wrap: anywhere;
}
.node-name.gone {
  color: var(--section-checks);
}
.error {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0;
  color: var(--section-checks);
  font-size: 0.875rem;
  font-weight: 600;
}
.btn-section {
  background: var(--section-codex);
  color: var(--section-codex-on);
}
</style>
