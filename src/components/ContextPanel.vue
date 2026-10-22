<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { panelSections } from '../panelSections'
import type { SectionId } from '../sections'
import CollapsibleSection from './CollapsibleSection.vue'

const props = defineProps<{ sectionId: SectionId }>()
const { t } = useI18n()
const list = computed(() => panelSections[props.sectionId] ?? [])
</script>

<template>
  <aside class="context-panel" :aria-label="t('a11y.contextPanel')">
    <h2 class="panel-title">{{ t('contextPanel.title') }}</h2>
    <template v-if="list.length">
      <CollapsibleSection v-for="p in list" :id="p.id" :key="p.id" :title="t(p.i18nKey)">
        {{ t('sidebar.placeholder') }}
      </CollapsibleSection>
    </template>
    <p v-else class="empty">{{ t('contextPanel.empty') }}</p>
  </aside>
</template>

<style scoped>
.context-panel {
  width: 17.5rem;
  height: 100%;
  overflow-y: auto;
  border-inline-start: 1px solid var(--border);
  background: var(--bg-panel);
}
.panel-title {
  margin: 0;
  padding: 0.75rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.empty {
  margin: 0;
  padding: 0.75rem;
  color: var(--text-secondary);
}
</style>
