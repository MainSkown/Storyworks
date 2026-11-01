<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import {
  addEra,
  addMonth,
  addWeekday,
  gregorianCalendar,
  moveMonth,
  moveWeekday,
  removeEra,
  removeMonth,
  removeWeekday,
  toDraft,
  validateDraft,
  type CalendarDraft,
  type LeapDraft,
} from '../calendar'
import { useProjectStore } from '../project/store'
import { useTimelinesStore } from '../timeline/store'

const { t } = useI18n()
const projectStore = useProjectStore()
const store = useTimelinesStore()
const { calendar, calendarWarning, usingFallbackCalendar } = storeToRefs(store)

const draft = ref<CalendarDraft>(toDraft(calendar.value))
const baseline = ref(JSON.stringify(draft.value))
const status = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const confirmReset = ref(false)

const readOnly = computed(() => !!projectStore.readOnly)
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value)
const validation = computed(() => validateDraft(draft.value))
const errors = computed<Record<string, string>>(() =>
  validation.value.ok ? {} : validation.value.errors,
)
const noLongerFit = computed(() =>
  validation.value.ok ? store.datesNoLongerFit(validation.value.calendar) : 0,
)
const canSave = computed(
  () => validation.value.ok && !readOnly.value && (dirty.value || usingFallbackCalendar.value),
)

function load(): void {
  draft.value = toDraft(calendar.value)
  baseline.value = JSON.stringify(draft.value)
}
// Pick up the file when it changes on disk, unless the user is mid-edit.
watch(calendar, () => {
  if (!dirty.value) load()
})
watch(
  () => JSON.stringify(draft.value),
  (now) => {
    if (now !== baseline.value) status.value = null
  },
)

const err = (path: string) => (errors.value[path] ? t(errors.value[path]) : '')
const bad = (path: string) => !!errors.value[path]

const num = (v: string | number | null) => (v === null || v === '' ? NaN : Number(v))
const shown = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? '' : String(n))
const optNum = (v: string | number | null) => (v === null || v === '' ? undefined : Number(v))
function setLeap(key: keyof LeapDraft, v: number | undefined): void {
  draft.value = { ...draft.value, leap: { ...draft.value.leap, [key]: v } }
}

const monthOptions = computed(() =>
  draft.value.months.map((m, i) => ({ value: i, label: m.name || String(i + 1) })),
)

const label = (s: string, i: number) => s.trim() || String(i + 1)

function reset(): void {
  const lang = projectStore.project?.manifest.language.startsWith('pl') ? 'pl' : 'en'
  draft.value = toDraft(gregorianCalendar(draft.value.id, lang))
  confirmReset.value = false
}

async function save(): Promise<void> {
  const v = validation.value
  if (!v.ok) return
  try {
    const r = await store.saveCalendar(v.calendar)
    if (r.ok) {
      load()
      status.value = { kind: 'ok', text: t('calendar.saved') }
    } else {
      status.value = { kind: 'error', text: t(`calendar.saveFailed.${r.reason}`) }
    }
  } catch {
    status.value = { kind: 'error', text: t('calendar.saveFailed.error') }
  }
}
</script>

<template>
  <div id="calendar" class="group calendar" role="group" aria-labelledby="cal-title">
    <h2 id="cal-title">{{ t('calendar.title') }}</h2>
    <p class="hint">{{ t('calendar.intro') }}</p>

    <QBanner
      v-if="usingFallbackCalendar"
      rounded
      class="notice warn-banner"
      role="alert"
      data-test="calendar-fallback"
    >
      {{
        t(
          calendarWarning?.kind === 'invalid'
            ? 'calendar.fallbackInvalid'
            : 'calendar.fallbackMissing',
        )
      }}
    </QBanner>

    <h3 id="cal-months">{{ t('calendar.months') }}</h3>
    <p v-if="bad('months')" class="field-error" role="alert">{{ err('months') }}</p>
    <ul class="rows" aria-labelledby="cal-months">
      <li v-for="(m, i) in draft.months" :key="i" class="row">
        <QInput
          v-model="m.name"
          :label="t('calendar.monthName')"
          outlined
          dense
          hide-bottom-space
          class="grow"
          :disable="readOnly"
          :error="bad(`months.${i}.name`)"
          :error-message="err(`months.${i}.name`)"
        />
        <QInput
          :model-value="shown(m.days)"
          :label="t('calendar.monthDays')"
          type="number"
          min="1"
          outlined
          dense
          hide-bottom-space
          class="narrow"
          :disable="readOnly"
          :error="bad(`months.${i}.days`)"
          :error-message="err(`months.${i}.days`)"
          @update:model-value="m.days = num($event)"
        />
        <div class="actions">
          <QBtn
            flat
            round
            dense
            hide-bottom-space
            icon="arrow_upward"
            :aria-label="t('calendar.moveUp', { name: label(m.name, i) })"
            :disable="readOnly || i === 0"
            @click="draft = moveMonth(draft, i, -1)"
          />
          <QBtn
            flat
            round
            dense
            hide-bottom-space
            icon="arrow_downward"
            :aria-label="t('calendar.moveDown', { name: label(m.name, i) })"
            :disable="readOnly || i === draft.months.length - 1"
            @click="draft = moveMonth(draft, i, 1)"
          />
          <QBtn
            flat
            round
            dense
            hide-bottom-space
            icon="delete"
            :aria-label="t('calendar.remove', { name: label(m.name, i) })"
            :disable="readOnly || draft.months.length <= 1"
            @click="draft = removeMonth(draft, i)"
          />
        </div>
      </li>
    </ul>
    <QBtn
      flat
      no-caps
      icon="add"
      :label="t('calendar.addMonth')"
      :disable="readOnly"
      @click="draft = addMonth(draft)"
    />

    <h3 id="cal-weekdays">{{ t('calendar.weekdays') }}</h3>
    <p class="hint">{{ t('calendar.weekdaysHint') }}</p>
    <p v-if="bad('weekdays')" class="field-error" role="alert">{{ err('weekdays') }}</p>
    <ul class="rows" aria-labelledby="cal-weekdays">
      <li v-for="(w, i) in draft.weekdays" :key="i" class="row">
        <QInput
          v-model="draft.weekdays[i]"
          :label="t('calendar.weekdayName')"
          outlined
          dense
          hide-bottom-space
          class="grow"
          :disable="readOnly"
          :error="bad(`weekdays.${i}`)"
          :error-message="err(`weekdays.${i}`)"
        />
        <div class="actions">
          <QBtn
            flat
            round
            dense
            hide-bottom-space
            icon="arrow_upward"
            :aria-label="t('calendar.moveUp', { name: label(w, i) })"
            :disable="readOnly || i === 0"
            @click="draft = moveWeekday(draft, i, -1)"
          />
          <QBtn
            flat
            round
            dense
            hide-bottom-space
            icon="arrow_downward"
            :aria-label="t('calendar.moveDown', { name: label(w, i) })"
            :disable="readOnly || i === draft.weekdays.length - 1"
            @click="draft = moveWeekday(draft, i, 1)"
          />
          <QBtn
            flat
            round
            dense
            hide-bottom-space
            icon="delete"
            :aria-label="t('calendar.remove', { name: label(w, i) })"
            :disable="readOnly"
            @click="draft = removeWeekday(draft, i)"
          />
        </div>
      </li>
    </ul>
    <QBtn
      flat
      no-caps
      icon="add"
      :label="t('calendar.addWeekday')"
      :disable="readOnly"
      @click="draft = addWeekday(draft)"
    />

    <h3 id="cal-eras">{{ t('calendar.eras') }}</h3>
    <p class="hint">{{ t('calendar.erasHint') }}</p>
    <p v-if="bad('eras')" class="field-error" role="alert">{{ err('eras') }}</p>
    <ul class="rows" aria-labelledby="cal-eras">
      <li v-for="(e, i) in draft.eras" :key="i" class="row">
        <QInput
          v-model="e.name"
          :label="t('calendar.eraName')"
          outlined
          dense
          hide-bottom-space
          class="grow"
          :disable="readOnly"
          :error="bad(`eras.${i}.name`)"
          :error-message="err(`eras.${i}.name`)"
        />
        <QInput
          :model-value="shown(e.startYear)"
          :label="t('calendar.eraStart')"
          type="number"
          outlined
          dense
          hide-bottom-space
          class="narrow wide"
          :disable="readOnly"
          :error="bad(`eras.${i}.startYear`)"
          :error-message="err(`eras.${i}.startYear`)"
          @update:model-value="e.startYear = num($event)"
        />
        <div class="actions">
          <QBtn
            flat
            round
            dense
            hide-bottom-space
            icon="delete"
            :aria-label="t('calendar.remove', { name: label(e.name, i) })"
            :disable="readOnly"
            @click="draft = removeEra(draft, i)"
          />
        </div>
      </li>
    </ul>
    <QBtn
      flat
      no-caps
      icon="add"
      :label="t('calendar.addEra')"
      :disable="readOnly"
      @click="draft = addEra(draft)"
    />

    <h3 id="cal-epoch">{{ t('calendar.epochLabel') }}</h3>
    <QInput
      v-model="draft.epochLabel"
      :aria-label="t('calendar.epochLabel')"
      :hint="t('calendar.epochHint')"
      outlined
      dense
      class="epoch"
      :disable="readOnly"
    />

    <QToggle
      v-model="draft.leapOn"
      class="leap-toggle"
      :label="t('calendar.leap')"
      :disable="readOnly"
    />
    <div v-if="draft.leapOn" class="leap">
      <QSelect
        :model-value="draft.leap.month"
        :options="monthOptions"
        :label="t('calendar.leapMonth')"
        outlined
        dense
        hide-bottom-space
        emit-value
        map-options
        options-dense
        :disable="readOnly"
        :error="bad('leap.month')"
        :error-message="err('leap.month')"
        @update:model-value="setLeap('month', $event)"
      />
      <QInput
        :model-value="shown(draft.leap.extraDays)"
        :label="t('calendar.leapExtra')"
        type="number"
        min="1"
        outlined
        dense
        :disable="readOnly"
        :error="bad('leap.extraDays')"
        :error-message="err('leap.extraDays')"
        @update:model-value="setLeap('extraDays', num($event))"
      />
      <QInput
        :model-value="shown(draft.leap.every)"
        :label="t('calendar.leapEvery')"
        type="number"
        min="1"
        outlined
        dense
        :disable="readOnly"
        :error="bad('leap.every')"
        :error-message="err('leap.every')"
        @update:model-value="setLeap('every', num($event))"
      />
      <QInput
        :model-value="shown(draft.leap.exceptEvery)"
        :label="t('calendar.leapExcept')"
        type="number"
        min="1"
        outlined
        dense
        :disable="readOnly"
        :error="bad('leap.exceptEvery')"
        :error-message="err('leap.exceptEvery')"
        @update:model-value="setLeap('exceptEvery', optNum($event))"
      />
      <QInput
        :model-value="shown(draft.leap.unlessEvery)"
        :label="t('calendar.leapUnless')"
        type="number"
        min="1"
        outlined
        dense
        :disable="readOnly"
        :error="bad('leap.unlessEvery')"
        :error-message="err('leap.unlessEvery')"
        @update:model-value="setLeap('unlessEvery', optNum($event))"
      />
    </div>

    <p v-if="noLongerFit > 0" class="no-fit" role="status" data-test="no-longer-fit">
      <QIcon name="warning" aria-hidden="true" />
      {{ t('calendar.noLongerFit', noLongerFit) }}
    </p>
    <p v-if="!validation.ok" class="field-error" role="status">{{ t('calendar.fixErrors') }}</p>
    <p v-else-if="dirty" class="hint" role="status">{{ t('calendar.unsaved') }}</p>
    <p
      v-if="status"
      :class="status.kind === 'ok' ? 'hint' : 'field-error'"
      role="status"
      data-test="calendar-status"
    >
      {{ status.text }}
    </p>

    <div class="buttons">
      <QBtn
        unelevated
        no-caps
        color="primary"
        :label="t('calendar.save')"
        :disable="!canSave"
        @click="save"
      />
      <QBtn
        outline
        no-caps
        :label="t('calendar.reset')"
        :disable="readOnly"
        @click="confirmReset = true"
      />
    </div>

    <QDialog v-model="confirmReset">
      <QCard class="dialog" role="dialog" aria-labelledby="cal-reset-title">
        <QCardSection>
          <h2 id="cal-reset-title" class="dialog-title">{{ t('calendar.resetTitle') }}</h2>
          <p>{{ t('calendar.resetBody') }}</p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps :label="t('calendar.cancel')" @click="confirmReset = false" />
          <QBtn
            unelevated
            no-caps
            color="primary"
            :label="t('calendar.resetConfirm')"
            @click="reset"
          />
        </QCardActions>
      </QCard>
    </QDialog>
  </div>
</template>

<style scoped>
.group {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.group h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}
h3 {
  margin: 1.25rem 0 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
}
.hint {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
}
.notice {
  margin: 0.75rem 0;
}
.rows {
  list-style: none;
  margin: 0 0 0.5rem;
  padding: 0;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.grow {
  flex: 1 1 10rem;
  min-width: 8rem;
}
.narrow {
  flex: 0 0 6rem;
}
.narrow.wide {
  flex-basis: 9rem;
}
.actions {
  display: flex;
  flex: 0 0 auto;
  padding-top: 0.25rem;
}
.leap-toggle {
  margin-top: 1.25rem;
  font-weight: 600;
}
.epoch {
  max-width: 16rem;
}
.leap {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0.75rem;
  margin-top: 0.5rem;
}
.field-error {
  margin: 0.25rem 0;
  font-size: 0.875rem;
  color: var(--section-checks);
}
.no-fit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1rem 0 0.25rem;
  font-weight: 600;
}
.buttons {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}
.dialog {
  min-width: min(24rem, 90vw);
  background: var(--bg-sheet);
  color: var(--text-primary);
}
.dialog-title {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
}
</style>
