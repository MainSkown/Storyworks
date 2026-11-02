<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { jumpToBlock } from '../../composables/useJump'
import { useProjectStore } from '../../project/store'
import { findNode } from '../../project/tree'

const props = defineProps<{ passage: { sceneId: string; blockId: string } }>()
const { t } = useI18n()
const project = useProjectStore()

const title = computed(() => {
  const n = findNode(project.tree, props.passage.sceneId)
  return n ? n.title || t('knowledge.untitledScene') : null
})

async function jump(): Promise<void> {
  if (!(await jumpToBlock(props.passage.sceneId, props.passage.blockId)).ok)
    Notify.create({ type: 'warning', message: t('knowledge.passageGone'), position: 'bottom', timeout: 5000 })
}
</script>

<template>
  <span v-if="title === null" class="gone">
    <QIcon name="error_outline" size="1rem" aria-hidden="true" />{{ t('knowledge.passageMissing') }}
  </span>
  <button
    v-else
    type="button"
    class="link"
    :aria-label="t('knowledge.jumpToPassage', { scene: title })"
    @click="jump"
  >
    {{ title }}
  </button>
</template>

<style scoped>
.link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--section-codex);
  font: inherit;
  text-align: start;
  text-decoration: underline;
  cursor: pointer;
}
.link:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.gone {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--section-checks);
  font-weight: 600;
}
</style>
