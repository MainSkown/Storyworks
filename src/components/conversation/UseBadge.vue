<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Problem } from '../../game/conditions'

defineProps<{ problem: Problem['kind'] | null }>()
const { t } = useI18n()
</script>

<template>
  <span v-if="problem" class="use-badge" :title="t('game.conversation.badge.reviewTitle')">
    <QIcon name="warning_amber" size="0.875rem" aria-hidden="true" />
    {{ t(problem === 'undefined-variable' ? 'game.conversation.deletedVariable' : 'game.conversation.needsReview') }}
  </span>
</template>

<style scoped>
.use-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.375rem;
  border: 1px solid var(--tag-problem);
  border-radius: 999px;
  color: var(--tag-problem);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
</style>
