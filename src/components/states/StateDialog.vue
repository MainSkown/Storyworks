<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCodexStore } from '../../codex/store'
import { entryOptions } from '../../relations/form'
import { useStatesStore } from '../../states/store'
import { compare, type Position } from '../../timeline/order'
import { useOrderContext } from '../../timeline/orderContext'
import PositionField from './PositionField.vue'

const props = defineProps<{ entryId: string; stateId?: string | null }>()
const open = defineModel<boolean>({ required: true })

const { t } = useI18n()
const states = useStatesStore()
const codex = useCodexStore()
const ctx = useOrderContext()

const kindId = ref<string | null>(null)
const value = ref('')
const from = ref<Position | null>(null)
const until = ref<Position | null>(null)
const final = ref(false)
const message = ref('')

const locked = computed(() => !!states.readOnly)
const editing = computed(() =>
  props.stateId ? states.statesFor(props.entryId).find((s) => s.id === props.stateId) : undefined,
)

watch(open, (v) => {
  if (!v) return
  message.value = ''
  entryQuery.value = ''
  const s = editing.value
  if (s) {
    kindId.value = states.kinds.some((k) => k.id === s.kindId) ? s.kindId : null
    value.value = s.value
    from.value = s.from
    until.value = s.until
    final.value = s.final
  } else {
    kindId.value = states.kinds[0]?.id ?? null
    value.value = ''
    from.value = null
    until.value = null
    final.value = false
  }
})

// A stale refusal message must not outlive the edit that fixes it.
watch([kindId, value, from, until], () => {
  message.value = ''
})

const kindOptions = computed(() =>
  states.kinds.map((k) => ({
    value: k.id,
    label: t('states.dialog.kindOption', {
      name: k.name,
      type: t(k.valueType === 'entry' ? 'states.dialog.entry' : 'states.dialog.text'),
    }),
  })),
)
const kind = computed(() => states.kinds.find((k) => k.id === kindId.value))

function onKind(id: string | null): void {
  const prev = kind.value?.valueType
  kindId.value = id
  if (prev !== kind.value?.valueType) value.value = ''
}

// ---- entry value ----
const entryQuery = ref('')
const entryChoices = computed(() =>
  entryOptions(codex.entries, codex.types, entryQuery.value, [props.entryId]),
)
const entryLabel = computed(() => {
  if (!value.value) return undefined
  const e = codex.entries.find((x) => x.id === value.value)
  return e ? e.name || t('codex.untitled') : t('states.missingEntry')
})
function filterEntries(val: string, update: (fn: () => void) => void): void {
  update(() => {
    entryQuery.value = val
  })
}

// ---- save ----
const untilBeforeFrom = (a: Position, b: Position) => compare(b, a, ctx.value) === 'before'
const canSave = computed(
  () => !locked.value && !!kind.value && value.value.trim() !== '' && !!from.value,
)

function save(): void {
  if (!canSave.value || !kindId.value || !from.value) return
  const base = {
    kindId: kindId.value,
    value: kind.value?.valueType === 'entry' ? value.value : value.value.trim(),
    from: from.value,
    final: final.value,
  }
  const r = editing.value
    ? states.updateState(props.entryId, editing.value.id, { ...base, until: until.value }, untilBeforeFrom)
    : states.addState(
        props.entryId,
        { ...base, ...(until.value ? { until: until.value } : {}) },
        untilBeforeFrom,
      )
  if (r.ok) open.value = false
  else message.value = t(`states.dialog.errors.${r.reason}`)
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="state-dlg-title">
      <form @submit.prevent="save">
        <QCardSection class="body">
          <h2 id="state-dlg-title" class="title">
            {{ editing ? t('states.dialog.editTitle') : t('states.dialog.addTitle') }}
          </h2>

          <QSelect
            :model-value="kindId"
            :options="kindOptions"
            :label="t('states.dialog.kind')"
            outlined
            dense
            emit-value
            map-options
            options-dense
            :disable="locked"
            @update:model-value="onKind"
          />

          <QSelect
            v-if="kind?.valueType === 'entry'"
            v-model="value"
            :options="entryChoices"
            :label="t('states.dialog.valueEntry')"
            :display-value="entryLabel"
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
                <QItemSection>{{ opt.label }}</QItemSection>
                <QItemSection v-if="opt.typeName" side>
                  <span class="type-tag">
                    <span class="dot" :style="{ background: opt.typeColor ?? undefined }" aria-hidden="true" />{{ opt.typeName }}
                  </span>
                </QItemSection>
              </QItem>
            </template>
            <template #no-option>
              <QItem><QItemSection class="muted">{{ t('states.dialog.noEntries') }}</QItemSection></QItem>
            </template>
          </QSelect>
          <QInput
            v-else
            v-model="value"
            :label="t('states.dialog.valueText')"
            outlined
            dense
            :disable="locked || !kind"
          />

          <PositionField v-model="from" :label="t('states.dialog.from')" :disabled="locked" />
          <p v-if="!from" class="muted">{{ t('states.dialog.fromRequired') }}</p>
          <PositionField
            v-model="until"
            :label="t('states.dialog.until')"
            :hint="t('states.dialog.untilHint')"
            :disabled="locked"
          />

          <QCheckbox
            v-model="final"
            :label="t('states.dialog.final')"
            :disable="locked"
          />
          <p class="muted hint">{{ t('states.dialog.finalHint') }}</p>

          <p v-if="message" class="error" role="alert">
            <QIcon name="error_outline" size="1rem" aria-hidden="true" />
            {{ message }}
          </p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps :label="t('states.dialog.cancel')" @click="open = false" />
          <QBtn
            unelevated
            no-caps
            type="submit"
            class="btn-section"
            :label="editing ? t('states.dialog.save') : t('states.dialog.create')"
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
.title {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
}
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.hint {
  margin-top: -0.75rem;
  padding-inline-start: 2.5rem;
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
