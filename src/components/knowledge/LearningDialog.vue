<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { povOptions } from '../../codex/entryRefs'
import { useCodexStore } from '../../codex/store'
import { useKnowledgeStore } from '../../knowledge/store'
import { forgottenBeforeLearned } from '../../knowledge/view'
import type { Position } from '../../timeline/order'
import { useOrderContext } from '../../timeline/orderContext'
import PositionField from '../states/PositionField.vue'
import RevealedInField from './RevealedInField.vue'

const NEW_ITEM = '__new__'

const props = defineProps<{
  /** Fixes the item. */
  itemId?: string | null
  /** Fixes the learner. */
  entryId?: string | null
  /** Preset for "Learns at". */
  position?: Position | null
  /** Edits this learning of `itemId`. */
  learningId?: string | null
}>()
const open = defineModel<boolean>({ required: true })

const { t } = useI18n()
const knowledge = useKnowledgeStore()
const codex = useCodexStore()
const ctx = useOrderContext()

const item = ref<string | null>(null)
const learner = ref<string | null>(null)
const at = ref<Position | null>(null)
const note = ref('')
const forgottenAt = ref<Position | null>(null)
const revealed = ref<{ sceneId: string; blockId: string } | null>(null)
const message = ref('')

const locked = computed(() => !!knowledge.readOnly)
const editing = computed(() => {
  if (!props.learningId || !props.itemId) return undefined
  return knowledge.items
    .find((k) => k.id === props.itemId)
    ?.learnings.find((l) => l.id === props.learningId)
})

watch(open, (v) => {
  if (!v) return
  message.value = ''
  itemQuery.value = ''
  entryQuery.value = ''
  const l = editing.value
  item.value = props.itemId ?? null
  if (l) {
    learner.value = l.entryId
    at.value = l.at
    note.value = l.note
    forgottenAt.value = l.forgottenAt
    revealed.value = l.revealedIn
  } else {
    learner.value = props.entryId ?? null
    at.value = props.position ?? null
    note.value = ''
    forgottenAt.value = null
    revealed.value = null
  }
})

// A stale refusal must not outlive the edit that fixes it.
watch([item, learner, at, forgottenAt], () => {
  message.value = ''
})

// ---- item ----
const itemQuery = ref('')
const itemTitle = (id: string | null) =>
  knowledge.items.find((k) => k.id === id)?.title || t('knowledge.untitled')
const itemOptions = computed(() => {
  const q = itemQuery.value.trim()
  const lq = q.toLowerCase()
  const list = knowledge.items
    .filter((k) => !lq || k.title.toLowerCase().includes(lq))
    .map((k) => ({ value: k.id, label: k.title || t('knowledge.untitled') }))
  const exact = knowledge.items.some((k) => k.title.trim().toLowerCase() === lq)
  return q && !exact
    ? [...list, { value: NEW_ITEM, label: t('knowledge.dialog.createItem', { title: q }) }]
    : list
})
function filterItems(val: string, update: (fn: () => void) => void): void {
  update(() => {
    itemQuery.value = val
  })
}
async function pickItem(id: string | null): Promise<void> {
  if (id !== NEW_ITEM) {
    item.value = id
    return
  }
  const created = await knowledge.createItem({ title: itemQuery.value })
  if (created) item.value = created
  else message.value = t('knowledge.dialog.errors.createItem')
}

// ---- learner ----
const entryQuery = ref('')
const typeName = (typeId: string) => codex.types.find((x) => x.id === typeId)?.name ?? ''
const entryChoices = computed(() => {
  const q = entryQuery.value.trim().toLowerCase()
  return povOptions(codex.entries, codex.types)
    .filter(
      (e) =>
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.aliases.some((a) => a.toLowerCase().includes(q)),
    )
    .map((e) => ({ value: e.id, label: e.name || t('codex.untitled'), type: typeName(e.typeId) }))
})
const learnerLabel = computed(() => {
  if (!learner.value) return undefined
  const e = codex.entries.find((x) => x.id === learner.value)
  return e ? e.name || t('codex.untitled') : t('knowledge.missingEntry')
})
function filterEntries(val: string, update: (fn: () => void) => void): void {
  update(() => {
    entryQuery.value = val
  })
}

// ---- save ----
const canSave = computed(() => !locked.value && !!item.value && !!learner.value && !!at.value)

function save(): void {
  if (!canSave.value || !item.value || !learner.value || !at.value) return
  const values = {
    entryId: learner.value,
    at: at.value,
    note: note.value.trim(),
    forgottenAt: forgottenAt.value,
    revealedIn: revealed.value,
  }
  const check = forgottenBeforeLearned(ctx.value)
  const r = editing.value
    ? knowledge.updateLearning(item.value, editing.value.id, values, check)
    : knowledge.addLearning(item.value, values, check)
  if (r.ok) open.value = false
  else
    message.value = t(
      ['unknown-entry', 'forgotten-before-learned', 'read-only'].includes(r.reason)
        ? `knowledge.dialog.errors.${r.reason}`
        : 'knowledge.dialog.errors.other',
    )
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="learning-dlg-title">
      <form @submit.prevent="save">
        <QCardSection class="body">
          <h2 id="learning-dlg-title" class="title">
            {{ editing ? t('knowledge.dialog.editTitle') : t('knowledge.dialog.addTitle') }}
          </h2>

          <p v-if="props.itemId" class="given">
            <span class="label">{{ t('knowledge.dialog.item') }}</span>
            {{ itemTitle(props.itemId) }}
          </p>
          <QSelect
            v-else
            :model-value="item"
            :options="itemOptions"
            :label="t('knowledge.dialog.item')"
            :display-value="item ? itemTitle(item) : undefined"
            outlined
            dense
            use-input
            input-debounce="0"
            emit-value
            map-options
            options-dense
            :disable="locked"
            @filter="filterItems"
            @update:model-value="pickItem"
          >
            <template #no-option>
              <QItem>
                <QItemSection class="muted">{{ t('knowledge.dialog.typeToCreate') }}</QItemSection>
              </QItem>
            </template>
          </QSelect>

          <p v-if="props.entryId" class="given">
            <span class="label">{{ t('knowledge.dialog.learner') }}</span>
            {{ learnerLabel }}
          </p>
          <QSelect
            v-else
            v-model="learner"
            :options="entryChoices"
            :label="t('knowledge.dialog.learner')"
            :display-value="learnerLabel"
            outlined
            dense
            use-input
            input-debounce="0"
            emit-value
            map-options
            options-dense
            :disable="locked"
            @filter="filterEntries"
          >
            <template #option="{ opt, itemProps }">
              <QItem v-bind="itemProps">
                <QItemSection>
                  <QItemLabel>{{ opt.label }}</QItemLabel>
                  <QItemLabel v-if="opt.type" caption>{{ opt.type }}</QItemLabel>
                </QItemSection>
              </QItem>
            </template>
            <template #no-option>
              <QItem>
                <QItemSection class="muted">{{ t('knowledge.dialog.noEntries') }}</QItemSection>
              </QItem>
            </template>
          </QSelect>

          <PositionField v-model="at" :label="t('knowledge.dialog.at')" :disabled="locked" />
          <p v-if="!at" class="muted">{{ t('knowledge.dialog.atRequired') }}</p>

          <QInput
            v-model="note"
            type="textarea"
            autogrow
            outlined
            dense
            :label="t('knowledge.dialog.note')"
            :readonly="locked"
          />

          <PositionField
            v-model="forgottenAt"
            :label="t('knowledge.dialog.forgottenAt')"
            :hint="t('knowledge.dialog.forgottenHint')"
            :disabled="locked"
          />

          <span class="label">{{ t('knowledge.dialog.revealedIn') }}</span>
          <RevealedInField v-model="revealed" :disabled="locked" />

          <p v-if="message" class="error" role="alert">
            <QIcon name="error_outline" size="1rem" aria-hidden="true" />
            {{ message }}
          </p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps :label="t('knowledge.dialog.cancel')" @click="open = false" />
          <QBtn
            unelevated
            no-caps
            type="submit"
            class="btn-section"
            :label="editing ? t('knowledge.dialog.save') : t('knowledge.dialog.create')"
            :disable="!canSave"
          />
        </QCardActions>
      </form>
    </QCard>
  </QDialog>
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
  gap: 0.75rem;
  max-height: 75vh;
  overflow-y: auto;
}
.body > * {
  flex-shrink: 0;
}
.title {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
}
.given {
  display: flex;
  flex-direction: column;
  margin: 0;
  overflow-wrap: anywhere;
}
.label {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
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
