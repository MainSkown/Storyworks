<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { sceneEntries } from '../../composables/entryPanels'
import { useProjectStore } from '../../project/store'
import EntryCards from './EntryCards.vue'

const { t } = useI18n()
const store = useProjectStore()
const povId = computed(() => (store.selectedId ? store.sceneMeta.get(store.selectedId)?.povId : undefined))
</script>

<template>
  <EntryCards v-if="sceneEntries.length" :refs="sceneEntries" :pov-id="povId" />
  <p v-else class="note">{{ t('linksPanel.inScene.empty') }}</p>
</template>

<style scoped>
.note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
</style>
