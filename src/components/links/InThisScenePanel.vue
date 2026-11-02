<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { sceneEntries } from '../../composables/entryPanels'
import { sceneKnowledgeUses } from '../../composables/knowledgePanels'
import { openKnowledgeItem } from '../../knowledge/openItem'
import { useProjectStore } from '../../project/store'
import EntryCards from './EntryCards.vue'
import LinkCard from './LinkCard.vue'

const { t } = useI18n()
const store = useProjectStore()
const MISSING_TEXT = {
  item: 'knowledgeUse.missingItem',
  entry: 'knowledgeUse.missingEntry',
  both: 'knowledgeUse.missingBoth',
} as const
const povId = computed(() => (store.selectedId ? store.sceneMeta.get(store.selectedId)?.povId : undefined))
</script>

<template>
  <EntryCards v-if="sceneEntries.length" :refs="sceneEntries" :pov-id="povId" />
  <p v-else-if="!sceneKnowledgeUses.length" class="note">{{ t('linksPanel.inScene.empty') }}</p>
  <template v-if="sceneKnowledgeUses.length">
    <h3 class="sub">{{ t('knowledgeUse.inScene.heading') }}</h3>
    <ul class="cards">
      <LinkCard
        v-for="u in sceneKnowledgeUses"
        :key="`${u.itemId}:${u.entryId}`"
        tag-kind="knowledge"
        :problem="u.missing !== null"
        :tag="u.missing ? t('eventLink.popover.problem') : t('knowledgeUse.tag')"
        :title="
          u.missing
            ? t(MISSING_TEXT[u.missing])
            : t('knowledgeUse.pair', {
                item: u.itemTitle || t('knowledgeMatrix.untitledItem'),
                entry: u.entryName || t('codex.untitled'),
              })
        "
      >
        <button v-if="!u.missing" type="button" class="btn" @click="openKnowledgeItem(u.itemId)">
          {{ t('eventLink.popover.open') }}
        </button>
      </LinkCard>
    </ul>
  </template>
</template>

<style scoped>
.sub {
  margin: 0.5rem 0 0.25rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
}
.note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
</style>
