<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import NumberField from '../components/NumberField.vue'
import { useSettingsStore } from '../settings/store'
import type { Language, Theme } from '../settings/schema'

const { t } = useI18n()
const store = useSettingsStore()
const { settings, loadError, savingDisabled } = storeToRefs(store)

const ZOOM = { min: 80, max: 150, step: 5 }
const FONT = { min: 12, max: 32, step: 1 }

const themeOptions = computed(() => [
  { value: 'light' as Theme, label: t('settings.themeLight') },
  { value: 'dark' as Theme, label: t('settings.themeDark') },
  { value: 'system' as Theme, label: t('settings.themeSystem') },
])
const languageOptions = computed(() => [
  { value: 'en' as Language, label: t('settings.languageEn') },
  { value: 'pl' as Language, label: t('settings.languagePl') },
])

const theme = computed({
  get: () => settings.value.theme,
  set: (v: Theme | null) => v && store.setTheme(v),
})
const language = computed({
  get: () => settings.value.language,
  set: (v: Language | null) => v && store.setLanguage(v),
})
const uiZoom = computed({
  get: () => settings.value.uiZoom,
  set: (v: number | null) => v !== null && store.setUiZoom(v),
})
const fontSize = computed({
  get: () => settings.value.editorFontSize,
  set: (v: number | null) => v !== null && store.setEditorFontSize(v),
})

const errorText = computed(() =>
  loadError.value?.kind === 'newer-version' ? t('settings.readOnlyNewer') : t('settings.loadError'),
)

function step(current: number, delta: number, r: { min: number; max: number }): number {
  return Math.min(r.max, Math.max(r.min, current + delta))
}
</script>

<template>
  <section class="page">
    <h1>{{ t('settings.title') }}</h1>

    <QBanner v-if="loadError" rounded class="notice warn-banner" role="alert">
      <p>{{ errorText }}</p>
      <p v-if="loadError.kind !== 'newer-version'" class="detail">
        {{ loadError.field ? `${loadError.field}: ` : '' }}{{ loadError.message }}
      </p>
      <p v-if="savingDisabled" class="detail">{{ t('settings.readOnlyHint') }}</p>
    </QBanner>

    <div class="group" role="group" aria-labelledby="set-theme">
      <h2 id="set-theme">{{ t('settings.theme') }}</h2>
      <QBtnToggle
        v-model="theme"
        :options="themeOptions"
        unelevated
        no-caps
        toggle-color="primary"
        :disable="savingDisabled"
      />
    </div>

    <div class="group" role="group" aria-labelledby="set-lang">
      <h2 id="set-lang">{{ t('settings.language') }}</h2>
      <QSelect
        v-model="language"
        :options="languageOptions"
        :aria-labelledby="'set-lang'"
        class="language-select"
        outlined
        dense
        emit-value
        map-options
        options-dense
        :disable="savingDisabled"
      />
    </div>

    <div class="group" role="group" aria-labelledby="set-zoom">
      <h2 id="set-zoom">{{ t('settings.uiZoom') }}</h2>
      <div class="row">
        <QBtn
          icon="remove"
          round
          unelevated
          class="btn-secondary"
          :aria-label="`${t('settings.uiZoom')}: ${t('settings.decrease')}`"
          :disable="savingDisabled || uiZoom <= ZOOM.min"
          @click="uiZoom = step(uiZoom, -ZOOM.step, ZOOM)"
        />
        <QSlider
          v-model="uiZoom"
          class="slider"
          :min="ZOOM.min"
          :max="ZOOM.max"
          :step="ZOOM.step"
          :disable="savingDisabled"
          label
          :label-value="`${uiZoom} %`"
          color="primary"
          :aria-label="t('settings.uiZoom')"
        />
        <QBtn
          icon="add"
          round
          unelevated
          class="btn-secondary"
          :aria-label="`${t('settings.uiZoom')}: ${t('settings.increase')}`"
          :disable="savingDisabled || uiZoom >= ZOOM.max"
          @click="uiZoom = step(uiZoom, ZOOM.step, ZOOM)"
        />
        <NumberField
          v-model="uiZoom"
          :min="ZOOM.min"
          :max="ZOOM.max"
          suffix="%"
          :disabled="savingDisabled"
          labelledby="set-zoom"
        />
      </div>
    </div>

    <div class="group" role="group" aria-labelledby="set-font">
      <h2 id="set-font">{{ t('settings.editorFontSize') }}</h2>
      <div class="row">
        <QBtn
          icon="remove"
          round
          unelevated
          class="btn-secondary"
          :aria-label="`${t('settings.editorFontSize')}: ${t('settings.decrease')}`"
          :disable="savingDisabled || fontSize <= FONT.min"
          @click="fontSize = step(fontSize, -FONT.step, FONT)"
        />
        <NumberField
          v-model="fontSize"
          :min="FONT.min"
          :max="FONT.max"
          suffix="px"
          :disabled="savingDisabled"
          labelledby="set-font"
        />
        <QBtn
          icon="add"
          round
          unelevated
          class="btn-secondary"
          :aria-label="`${t('settings.editorFontSize')}: ${t('settings.increase')}`"
          :disable="savingDisabled || fontSize >= FONT.max"
          @click="fontSize = step(fontSize, FONT.step, FONT)"
        />
      </div>
      <p id="set-sample-label" class="sample-label">{{ t('settings.samplePreview') }}</p>
      <p class="sample" aria-labelledby="set-sample-label">{{ t('settings.editorSample') }}</p>
    </div>
  </section>
</template>

<style scoped>
.page {
  padding: 1.5rem;
  max-width: 44rem;
  color: var(--text-primary);
}
.notice {
  margin-bottom: 1rem;
}
.detail {
  margin: 0.25rem 0 0;
  color: var(--text-secondary);
}
.group {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.group h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.slider {
  flex: 1 1 10rem;
  min-width: 8rem;
}
.sample-label {
  margin: 1rem 0 0.25rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
}
.sample {
  margin: 0;
  padding: 1rem;
  background: var(--bg-sheet);
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  font-family: var(--font-editor);
  font-size: var(--editor-font-size);
  line-height: 1.6;
}
.language-select {
  max-width: 16rem;
}
</style>
