<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { resolveNodeRules } from '../../rules/nodeRules'
import { openRule } from '../../rules/openRule'
import { useRulesStore } from '../../rules/store'
import { useTimelinesStore } from '../../timeline/store'
import LinkCard from './LinkCard.vue'

const { t } = useI18n()
const tl = useTimelinesStore()
const rules = useRulesStore()

const node = computed(() => tl.current?.nodes.find((n) => n.id === tl.selectedNodeId) ?? null)
const linked = computed(() =>
  node.value ? resolveNodeRules(node.value.ruleIds, rules.rules, rules.categories) : [],
)
</script>

<template>
  <p v-if="!node" class="note">{{ t('linksPanel.linkedRules.none') }}</p>
  <ul v-else-if="linked.length" class="cards">
    <LinkCard
      v-for="r in linked"
      :key="r.id"
      :problem="r.missing"
      :tag-kind="r.missing ? undefined : 'rule'"
      :tag="r.missing ? t('linksPanel.linkedRules.problem') : t('linksPanel.linkedRules.tag')"
      :title="
        r.missing
          ? t('linksPanel.linkedRules.missing')
          : r.rule.title || t('nodeRules.untitled')
      "
      :meta="r.missing ? '' : (r.categoryName ?? t('linksPanel.linkedRules.uncategorized'))"
    >
      <button v-if="!r.missing" type="button" class="btn" @click="openRule(r.id)">
        {{ t('linksPanel.linkedRules.open') }}
      </button>
    </LinkCard>
  </ul>
  <p v-else class="note">{{ t('linksPanel.linkedRules.empty') }}</p>
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
