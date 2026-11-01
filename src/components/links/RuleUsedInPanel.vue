<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { jumpToNode } from '../../composables/useJump'
import { useRulesStore } from '../../rules/store'
import LinkCard from './LinkCard.vue'

const { t } = useI18n()
const rules = useRulesStore()

const usage = computed(() => (rules.selectedId ? rules.usedIn(rules.selectedId) : []))
</script>

<template>
  <p v-if="!rules.selectedId" class="note">{{ t('linksPanel.ruleUsedIn.none') }}</p>
  <ul v-else-if="usage.length" class="cards">
    <LinkCard
      v-for="u in usage"
      :key="`${u.timelineId}:${u.nodeId}`"
      :tag="t('linksPanel.ruleUsedIn.tag')"
      :title="u.nodeTitle || t('linksPanel.ruleUsedIn.untitled')"
      :meta="u.timelineName"
    >
      <button type="button" class="btn" @click="jumpToNode(u.timelineId, u.nodeId)">
        {{ t('linksPanel.ruleUsedIn.jump') }}
      </button>
    </LinkCard>
  </ul>
  <p v-else class="note">{{ t('linksPanel.ruleUsedIn.empty') }}</p>
</template>

<style scoped>
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
