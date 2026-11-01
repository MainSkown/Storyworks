<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCodexStore } from '../../codex/store'
import { jumpToNode } from '../../composables/useJump'
import { resolveNodeRules } from '../../rules/nodeRules'
import { openRule } from '../../rules/openRule'
import { useRulesStore } from '../../rules/store'
import LinkCard from './LinkCard.vue'

const { t } = useI18n()
const codex = useCodexStore()
const rules = useRulesStore()

const nodes = computed(() => (codex.selectedId ? codex.usedInNodes(codex.selectedId) : []))
const ruleRefs = computed(() =>
  codex.selected ? resolveNodeRules(codex.selected.ruleIds, rules.rules, rules.categories) : [],
)
</script>

<template>
  <p v-if="!codex.selected" class="note">{{ t('linksPanel.entryLinks.none') }}</p>
  <template v-else>
    <h4 class="sub">{{ t('linksPanel.entryLinks.events') }}</h4>
    <ul v-if="nodes.length" class="cards">
      <LinkCard
        v-for="u in nodes"
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
    <p v-else class="note">{{ t('linksPanel.entryLinks.noEvents') }}</p>

    <h4 class="sub">{{ t('linksPanel.entryLinks.rules') }}</h4>
    <ul v-if="ruleRefs.length" class="cards">
      <LinkCard
        v-for="r in ruleRefs"
        :key="r.id"
        :problem="r.missing"
        :tag-kind="r.missing ? undefined : 'rule'"
        :tag="r.missing ? t('linksPanel.linkedRules.problem') : t('linksPanel.linkedRules.tag')"
        :title="
          r.missing ? t('linksPanel.linkedRules.missing') : r.rule.title || t('nodeRules.untitled')
        "
        :meta="r.missing ? '' : (r.categoryName ?? t('linksPanel.linkedRules.uncategorized'))"
      >
        <button v-if="!r.missing" type="button" class="btn" @click="openRule(r.id)">
          {{ t('linksPanel.linkedRules.open') }}
        </button>
      </LinkCard>
    </ul>
    <p v-else class="note">{{ t('linksPanel.entryLinks.noRules') }}</p>
  </template>
</template>

<style scoped>
.cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
}
.sub {
  margin: 0.75rem 0 0.375rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.sub:first-child {
  margin-top: 0;
}
.note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
</style>
