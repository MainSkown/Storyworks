<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { panelSections } from '../panelSections'
import type { SectionId } from '../sections'
import CollapsibleSection from './CollapsibleSection.vue'
import ScenePropertiesPanel from './ScenePropertiesPanel.vue'
import RouteTags from './routes/RouteTags.vue'
import StoryMapInspector from './storymap/StoryMapInspector.vue'
import StoryMapRoutes from './storymap/StoryMapRoutes.vue'
import { useProjectStore } from '../project/store'
import { findNode } from '../project/tree'
import NodeInspector from './timeline/NodeInspector.vue'
import ThisParagraphPanel from './links/ThisParagraphPanel.vue'
import SceneProblemsPanel from './links/SceneProblemsPanel.vue'
import WrittenInPanel from './links/WrittenInPanel.vue'
import LinkedRulesPanel from './links/LinkedRulesPanel.vue'
import RuleUsedInPanel from './links/RuleUsedInPanel.vue'
import InThisScenePanel from './links/InThisScenePanel.vue'
import LinkedEntriesPanel from './links/LinkedEntriesPanel.vue'
import EntryLinksPanel from './links/EntryLinksPanel.vue'
import { useCodexStore } from '../codex/store'
import { nodeEntries, sceneEntries } from '../composables/entryPanels'
import { sceneKnowledgeUses } from '../composables/knowledgePanels'
import { resolveNodeRules } from '../rules/nodeRules'
import { useRulesStore } from '../rules/store'
import { useTimelinesStore } from '../timeline/store'
import { paragraphLinks, passagesForSelectedNode, sceneProblems } from '../composables/contextLinks'

const props = defineProps<{ sectionId: SectionId }>()
const { t } = useI18n()
const openTodos = ref(0)
const tl = useTimelinesStore()
const rulesStore = useRulesStore()
const codexStore = useCodexStore()
const projectStore = useProjectStore()
/** Game scripts: the selected script or conversation can be tagged with routes. */
const routeItemId = computed(() => {
  if (projectStore.project?.manifest.kind !== 'game' || !projectStore.selectedId) return null
  const n = findNode(projectStore.tree, projectStore.selectedId)
  return n && (n.type === 'scene' || n.type === 'conversation') ? n.id : null
})
const list = computed(() => panelSections[props.sectionId] ?? [])

const linkedRuleCount = computed(() => {
  const n = tl.current?.nodes.find((x) => x.id === tl.selectedNodeId)
  return n ? resolveNodeRules(n.ruleIds, rulesStore.rules, rulesStore.categories).length : 0
})

function countOf(id: string): number {
  switch (id) {
    case 'write.thisScene':
      return openTodos.value
    case 'write.thisParagraph':
      return paragraphLinks.value.length
    case 'write.problems':
      return sceneProblems.value.length
    case 'timelines.writtenIn':
      return passagesForSelectedNode.value.length
    case 'write.inThisScene':
      return sceneEntries.value.length + sceneKnowledgeUses.value.length
    case 'timelines.linked':
      return linkedRuleCount.value + nodeEntries.value.length
    case 'codex.links': {
      const e = codexStore.selected
      return e ? codexStore.usedInNodes(e.id).length + e.ruleIds.length : 0
    }
    case 'rules.usedIn':
      return rulesStore.selectedId ? rulesStore.usedIn(rulesStore.selectedId).length : 0
    default:
      return 0
  }
}
</script>

<template>
  <aside class="context-panel" :aria-label="t('a11y.contextPanel')">
    <h2 class="panel-title">{{ t('contextPanel.title') }}</h2>
    <template v-if="list.length">
      <CollapsibleSection
        v-for="p in list"
        :id="p.id"
        :key="p.id"
        :title="t(p.i18nKey)"
        :count="countOf(p.id)"
      >
        <template v-if="p.id === 'write.thisScene'">
          <ScenePropertiesPanel @open-todos="openTodos = $event" />
          <RouteTags v-if="routeItemId" :item-id="routeItemId" />
        </template>
        <ThisParagraphPanel v-else-if="p.id === 'write.thisParagraph'" />
        <SceneProblemsPanel v-else-if="p.id === 'write.problems'" />
        <NodeInspector v-else-if="p.id === 'timelines.selectedEvent'" />
        <WrittenInPanel v-else-if="p.id === 'timelines.writtenIn'" />
        <InThisScenePanel v-else-if="p.id === 'write.inThisScene'" />
        <template v-else-if="p.id === 'timelines.linked'">
          <LinkedRulesPanel />
          <LinkedEntriesPanel />
        </template>
        <StoryMapInspector v-else-if="p.id === 'storymap.selected'" />
        <StoryMapRoutes v-else-if="p.id === 'storymap.routes'" />
        <EntryLinksPanel v-else-if="p.id === 'codex.links'" />
        <RuleUsedInPanel v-else-if="p.id === 'rules.usedIn'" />
        <template v-else>{{ t('sidebar.placeholder') }}</template>
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
