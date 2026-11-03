<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { displayCombo } from '../shortcuts/match'
import {
  actionLabelKey,
  FIXED_SHORTCUTS,
  fixedLabelKey,
  SHORTCUTS,
  type ShortcutScope,
} from '../shortcuts/registry'
import { useCombos } from '../shortcuts/useShortcuts'

const open = defineModel<boolean>({ required: true })
const { t } = useI18n()
const { combos } = useCombos()

const groups = computed(() => {
  const app = (scope: ShortcutScope) =>
    SHORTCUTS.filter((s) => s.scope === scope).map((s) => ({
      id: s.id,
      label: t(actionLabelKey(s.id)),
      keys: displayCombo(combos.value[s.id]),
    }))
  return [
    { id: 'app', rows: app('app') },
    { id: 'write', rows: app('write') },
    {
      id: 'editor',
      rows: FIXED_SHORTCUTS.map((f) => ({
        id: f.id,
        label: t(fixedLabelKey(f.id)),
        keys: displayCombo(f.combo),
      })),
    },
  ]
})
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="shortcuts-title">
      <QCardSection class="body">
        <h2 id="shortcuts-title" class="title">{{ t('shortcuts.overlayTitle') }}</h2>
        <section v-for="g in groups" :key="g.id" class="group">
          <h3>{{ t(`shortcuts.groups.${g.id}`) }}</h3>
          <dl class="list">
            <div v-for="r in g.rows" :key="r.id" class="row">
              <dt>{{ r.label }}</dt>
              <dd>
                <kbd>{{ r.keys }}</kbd>
              </dd>
            </div>
          </dl>
        </section>
        <p class="hint">{{ t('shortcuts.rebindHint') }}</p>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('shortcuts.close')" @click="open = false" />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  width: min(34rem, 92vw);
  max-height: 85vh;
  overflow: auto;
  background: var(--bg-raised);
  color: var(--text-primary);
}
.title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
.group h3 {
  margin: 1rem 0 0.25rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
}
.list {
  margin: 0;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--border);
}
dt,
dd {
  margin: 0;
}
kbd {
  font-family: inherit;
  font-size: 0.85rem;
  padding: 0.1rem 0.45rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.25rem;
  background: var(--bg-sheet);
  white-space: nowrap;
}
.hint {
  margin: 1rem 0 0;
  color: var(--text-secondary);
}
</style>
