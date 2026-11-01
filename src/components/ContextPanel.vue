<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { panelSections } from '../panelSections'
import type { SectionId } from '../sections'
import CollapsibleSection from './CollapsibleSection.vue'
import ScenePropertiesPanel from './ScenePropertiesPanel.vue'
import NodeInspector from './timeline/NodeInspector.vue'
import ThisParagraphPanel from './links/ThisParagraphPanel.vue'
import SceneProblemsPanel from './links/SceneProblemsPanel.vue'
import WrittenInPanel from './links/WrittenInPanel.vue'
import { paragraphLinks, passagesForSelectedNode, sceneProblems } from '../composables/contextLinks'

const props = defineProps<{ sectionId: SectionId }>()
const { t } = useI18n()
const openTodos = ref(0)
const list = computed(() => panelSections[props.sectionId] ?? [])

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
        <ScenePropertiesPanel v-if="p.id === 'write.thisScene'" @open-todos="openTodos = $event" />
        <ThisParagraphPanel v-else-if="p.id === 'write.thisParagraph'" />
        <SceneProblemsPanel v-else-if="p.id === 'write.problems'" />
        <NodeInspector v-else-if="p.id === 'timelines.selectedEvent'" />
        <WrittenInPanel v-else-if="p.id === 'timelines.writtenIn'" />
        <p v-else-if="p.id.startsWith('timelines.')" class="later">{{ t('contextPanel.later') }}</p>
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
.later {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.empty {
  margin: 0;
  padding: 0.75rem;
  color: var(--text-secondary);
}
</style>
