<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '../../calendar'
import { readDateInput, dateToInput } from '../../timeline/dateInput'
import type { Position } from '../../timeline/order'
import { useTimelinesStore } from '../../timeline/store'
import NodePickerDialog from '../NodePickerDialog.vue'
import { describePosition } from './position'

const props = defineProps<{ label: string; disabled?: boolean; hint?: string }>()
const model = defineModel<Position | null>({ required: true })

const { t } = useI18n()
const timelines = useTimelinesStore()
const uid = useId()

type Mode = 'event' | 'date'
const mode = ref<Mode>(model.value && 'date' in model.value ? 'date' : 'event')
const dateText = ref('')
const dateError = ref('')
const pickerOpen = ref(false)

// Follow outside changes (dialog reopened on another state).
watch(
  model,
  (p) => {
    if (p) mode.value = 'date' in p ? 'date' : 'event'
    if (!(p && 'date' in p) || dateToInput(timelines.calendar, p.date) !== dateText.value) {
      dateText.value = p && 'date' in p ? dateToInput(timelines.calendar, p.date) : ''
      dateError.value = ''
    }
  },
  { immediate: true },
)

const modeOptions = computed(() => [
  { value: 'event', label: t('states.position.event') },
  { value: 'date', label: t('states.position.date') },
])

function setMode(m: Mode): void {
  if (m === mode.value) return
  mode.value = m
  model.value = null
  dateText.value = ''
  dateError.value = ''
}

const view = computed(() =>
  model.value && 'node' in model.value
    ? describePosition(model.value, timelines.loadedTimelines, (d) => formatDate(timelines.calendar, d))
    : null,
)

function pickEvent(timelineId: string, nodeId: string): void {
  model.value = { node: { timelineId, nodeId } }
}

function commitDate(): void {
  const r = readDateInput(timelines.calendar, dateText.value)
  if (r.kind === 'error') {
    dateError.value = t(`timelines.inspector.dateError.${r.reason}`)
    model.value = null
    return
  }
  dateError.value = ''
  model.value = r.kind === 'set' ? { date: r.date } : null
}

function clear(): void {
  model.value = null
  dateText.value = ''
  dateError.value = ''
}
</script>

<template>
  <div class="pos" role="group" :aria-labelledby="`${uid}-label`">
    <span :id="`${uid}-label`" class="label">{{ props.label }}</span>
    <div class="line">
      <QBtnToggle
        :model-value="mode"
        :options="modeOptions"
        unelevated
        no-caps
        dense
        toggle-color="primary"
        :disable="props.disabled"
        :aria-label="t('states.position.mode')"
        @update:model-value="setMode"
      />

      <template v-if="mode === 'event'">
        <span v-if="view?.kind === 'event'" class="chosen">
          <QIcon name="event" size="1rem" aria-hidden="true" />
          {{ view.title || t('states.position.untitledEvent') }}
          <span class="muted">· {{ view.timelineName }}<template v-if="view.date"> · {{ view.date }}</template></span>
        </span>
        <span v-else-if="view?.kind === 'missing-event'" class="chosen gone">
          <QIcon name="error_outline" size="1rem" aria-hidden="true" />
          {{ t('states.position.missingEvent') }}
        </span>
        <span v-else class="muted">{{ t('states.position.none') }}</span>
        <QBtn
          v-if="!props.disabled"
          flat
          no-caps
          dense
          icon="link"
          :label="view ? t('states.position.changeEvent') : t('states.position.pickEvent')"
          @click="pickerOpen = true"
        />
      </template>

      <template v-else>
        <input
          :id="`${uid}-date`"
          v-model="dateText"
          class="control"
          :aria-labelledby="`${uid}-label`"
          :placeholder="t('states.position.datePlaceholder')"
          :readonly="props.disabled"
          :aria-invalid="dateError ? 'true' : undefined"
          :aria-describedby="dateError ? `${uid}-err` : undefined"
          @change="commitDate"
          @keydown.enter.prevent="commitDate"
        />
      </template>

      <QBtn
        v-if="model && !props.disabled"
        flat
        round
        dense
        icon="close"
        :aria-label="t('states.position.clear')"
        @click="clear"
      />
    </div>
    <p v-if="dateError" :id="`${uid}-err`" class="error" role="alert">
      <QIcon name="error_outline" size="1rem" aria-hidden="true" />
      {{ dateError }}
    </p>
    <p v-else-if="props.hint" class="muted">{{ props.hint }}</p>

    <NodePickerDialog
      v-model="pickerOpen"
      :title="t('states.position.pickerTitle')"
      :tabs="['events']"
      @pick="pickEvent"
    />
  </div>
</template>

<style scoped>
.pos {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.label {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.chosen {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  overflow-wrap: anywhere;
}
.chosen.gone {
  color: var(--section-checks);
  font-weight: 600;
}
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.control {
  flex: 1;
  min-width: 10rem;
  box-sizing: border-box;
  padding: 0.3rem 0.5rem;
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
.error {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0;
  color: var(--section-checks);
  font-size: 0.875rem;
  font-weight: 600;
}
</style>
