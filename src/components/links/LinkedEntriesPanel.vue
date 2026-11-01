<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { nodeEntries } from '../../composables/entryPanels'
import { useTimelinesStore } from '../../timeline/store'
import EntryCards from './EntryCards.vue'

const { t } = useI18n()
const tl = useTimelinesStore()
</script>

<template>
  <template v-if="tl.selectedNodeId">
    <h4 class="sub">{{ t('linksPanel.entries.heading') }}</h4>
    <EntryCards v-if="nodeEntries.length" :refs="nodeEntries" />
    <p v-else class="note">{{ t('linksPanel.entries.empty') }}</p>
  </template>
</template>

<style scoped>
.sub {
  margin: 0.75rem 0 0.375rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
</style>
