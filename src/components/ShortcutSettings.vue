<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '../settings/store'
import { findConflict, validateCombo } from '../shortcuts/conflicts'
import { comboFromEvent, displayCombo } from '../shortcuts/match'
import { actionLabelKey, fixedLabelKey, SHORTCUTS, type ShortcutId } from '../shortcuts/registry'
import { overlayOpen, useCombos } from '../shortcuts/useShortcuts'

const { t } = useI18n()
const store = useSettingsStore()
const { settings, savingDisabled } = storeToRefs(store)
const { combos } = useCombos()

const capturing = ref<ShortcutId | null>(null)
const message = ref('')

const rows = computed(() =>
  SHORTCUTS.map((s) => ({
    id: s.id,
    label: t(actionLabelKey(s.id)),
    keys: displayCombo(combos.value[s.id]),
    custom: combos.value[s.id] !== s.combo,
  })),
)
const hasOverrides = computed(() => Object.keys(settings.value.shortcuts).length > 0)

function startCapture(id: ShortcutId): void {
  capturing.value = id
  message.value = ''
}
function stopCapture(): void {
  capturing.value = null
}

function conflictText(id: ShortcutId, combo: string): string {
  const bad = validateCombo(combo)
  if (bad) return t(`shortcuts.settings.error.${bad}`)
  const c = findConflict(id, combo, combos.value)
  if (!c) return ''
  const name =
    c.kind === 'shortcut' ? t(actionLabelKey(c.id)) : c.kind === 'fixed' ? t(fixedLabelKey(c.id)) : ''
  return t(`shortcuts.settings.error.${c.kind}`, { combo: displayCombo(combo), name })
}

function onKey(e: KeyboardEvent, id: ShortcutId): void {
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    stopCapture()
    return
  }
  const combo = comboFromEvent(e)
  if (!combo) return // lone modifier: keep waiting
  const err = conflictText(id, combo)
  message.value = err
  if (err) return
  store.setShortcut(id, combo)
  stopCapture()
}

function reset(id: ShortcutId): void {
  message.value = ''
  store.setShortcut(id, SHORTCUTS.find((s) => s.id === id)!.combo)
}
function restoreDefaults(): void {
  message.value = ''
  stopCapture()
  store.resetShortcuts()
}
</script>

<template>
  <div id="shortcuts" class="group" role="group" aria-labelledby="set-shortcuts">
    <h2 id="set-shortcuts">{{ t('shortcuts.settings.title') }}</h2>
    <p class="hint">{{ t('shortcuts.settings.hint') }}</p>
    <div v-for="r in rows" :key="r.id" class="row">
      <span :id="`set-sc-${r.id}`" class="name">{{ r.label }}</span>
      <button
        type="button"
        class="key"
        :class="{ capturing: capturing === r.id }"
        :disabled="savingDisabled"
        :aria-labelledby="`set-sc-${r.id}`"
        :aria-describedby="`set-sc-${r.id}-keys`"
        @click="startCapture(r.id)"
        @keydown="capturing === r.id && onKey($event, r.id)"
        @blur="capturing === r.id && stopCapture()"
      >
        <span :id="`set-sc-${r.id}-keys`">
          {{ capturing === r.id ? t('shortcuts.settings.capturing') : r.keys }}
        </span>
      </button>
      <QBtn
        v-if="r.custom"
        flat
        dense
        no-caps
        class="btn-secondary"
        :label="t('shortcuts.settings.reset')"
        :aria-label="t('shortcuts.settings.resetOne', { name: r.label })"
        :disable="savingDisabled"
        @click="reset(r.id)"
      />
    </div>
    <p class="msg" role="alert" aria-live="assertive">{{ message }}</p>
    <div class="row">
      <QBtn
        no-caps
        class="btn-secondary"
        :label="t('shortcuts.settings.restoreDefaults')"
        :disable="savingDisabled || !hasOverrides"
        @click="restoreDefaults"
      />
      <QBtn
        flat
        no-caps
        class="btn-secondary"
        :label="t('shortcuts.settings.showAll')"
        @click="overlayOpen = true"
      />
    </div>
  </div>
</template>

<style scoped>
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
.hint {
  margin: 0 0 0.5rem;
  color: var(--text-secondary);
}
.row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}
.name {
  min-width: 14rem;
}
.key {
  min-width: 11rem;
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.25rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.key.capturing {
  border-color: var(--focus-ring);
  outline: 2px solid var(--focus-ring);
}
.msg {
  min-height: 1.25rem;
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
}
</style>
