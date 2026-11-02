<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Knows } from '../../knowledge/logic'

defineProps<{ state: Knows }>()
const { t } = useI18n()
const ICON: Record<Knows, string> = {
  known: 'check_circle',
  'not-yet': 'schedule',
  forgotten: 'history',
  unknown: 'help_outline',
}
</script>

<template>
  <span class="kb" :class="state">
    <QIcon :name="ICON[state]" size="1rem" aria-hidden="true" />{{ t(`knowledge.state.${state}`) }}
  </span>
</template>

<style scoped>
.kb {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
}
.kb.known {
  border-color: var(--section-codex);
}
.kb.not-yet,
.kb.forgotten {
  color: var(--text-secondary);
}
.kb.forgotten {
  border-style: dashed;
}
.kb.unknown {
  border-color: var(--section-timelines);
  border-style: dotted;
}
</style>
