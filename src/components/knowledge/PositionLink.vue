<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { jumpToNode } from '../../composables/useJump'
import type { Position } from '../../timeline/order'
import { usePositionText } from './usePositionText'

const props = defineProps<{ position: Position }>()
const { t } = useI18n()
const describe = usePositionText()

const view = computed(() => describe(props.position))
const isNode = computed(() => 'node' in props.position && !view.value.missing)

async function jump(): Promise<void> {
  if (!('node' in props.position)) return
  const { timelineId, nodeId } = props.position.node
  if (!(await jumpToNode(timelineId, nodeId)).ok)
    Notify.create({ type: 'warning', message: t('codex.jumpFailed'), position: 'bottom', timeout: 5000 })
}
</script>

<template>
  <span v-if="view.missing" class="gone">
    <QIcon name="error_outline" size="1rem" aria-hidden="true" />{{ view.text }}
  </span>
  <button
    v-else-if="isNode"
    type="button"
    class="link"
    :aria-label="t('knowledge.jumpToEvent', { event: view.text })"
    @click="jump"
  >
    {{ view.text }}
  </button>
  <span v-else>{{ view.text }}</span>
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
