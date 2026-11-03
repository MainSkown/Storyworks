<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { firstLineText } from '../../game/conditionEdit'
import type { ConversationNode } from '../../project/schemas/conversation'
import type { GraphNodeModel } from '../graph/types'
import { NODE_ICON } from './nodeTypes'

const props = defineProps<{
  node: GraphNodeModel<ConversationNode>
  start: boolean
  brokenTarget: boolean
  brokenUse: boolean
}>()
const { t } = useI18n()

const data = computed(() => props.node.data)
const detail = computed(() => {
  const n = data.value
  if (n?.type === 'lines') return firstLineText(n.content) || t('game.conversation.summary.emptyLines')
  if (n?.type === 'choice')
    return t('game.conversation.summary.options', { n: n.options.length }, n.options.length)
  return ''
})
const empty = computed(() => data.value?.type === 'lines' && !firstLineText(data.value.content))
const setCount = computed(() => data.value?.sets.length ?? 0)
</script>

<template>
  <div class="body">
    <div class="head">
      <QIcon :name="data ? NODE_ICON[data.type] : 'help'" size="1rem" aria-hidden="true" />
      <span class="type">{{ data ? t(`game.conversation.type.${data.type}`) : '' }}</span>
      <span
        v-if="start"
        class="chip start"
        role="img"
        :aria-label="t('game.conversation.badge.start')"
        :title="t('game.conversation.badge.start')"
      >
        <QIcon name="flag" size="0.75rem" aria-hidden="true" />{{ t('game.conversation.start') }}
      </span>
    </div>
    <div v-if="detail" class="detail" :class="{ empty }">{{ detail }}</div>
    <div v-if="data?.condition || setCount || brokenTarget || brokenUse" class="badges">
      <span
        v-if="data?.condition"
        class="chip"
        role="img"
        :aria-label="t('game.conversation.badge.condition')"
        :title="t('game.conversation.badge.condition')"
      >
        <QIcon name="rule" size="0.875rem" aria-hidden="true" />
      </span>
      <span
        v-if="setCount"
        class="chip"
        role="img"
        :aria-label="t('game.conversation.badge.sets')"
        :title="t('game.conversation.badge.sets')"
      >
        <QIcon name="tune" size="0.875rem" aria-hidden="true" />{{ setCount }}
      </span>
      <span
        v-if="brokenTarget"
        class="chip broken"
        role="img"
        :aria-label="t('game.conversation.badge.brokenTarget')"
        :title="t('game.conversation.badge.brokenTargetTitle')"
      >
        <QIcon name="link_off" size="0.875rem" aria-hidden="true" />{{ t('game.conversation.badge.brokenTarget') }}
      </span>
      <span
        v-if="brokenUse"
        class="chip broken"
        role="img"
        :aria-label="t('game.conversation.badge.review')"
        :title="t('game.conversation.badge.reviewTitle')"
      >
        <QIcon name="warning_amber" size="0.875rem" aria-hidden="true" />{{ t('game.conversation.badge.review') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  text-align: start;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}
.type {
  flex: 1;
  font-weight: 600;
}
.detail {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail.empty {
  font-style: italic;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.125rem;
  padding: 0 0.3rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-primary);
  font-size: 0.6875rem;
  font-weight: 700;
}
.chip.start {
  border-color: var(--section-write);
  color: var(--section-write);
}
.chip.broken {
  border-color: var(--tag-problem);
  color: var(--tag-problem);
}
</style>
