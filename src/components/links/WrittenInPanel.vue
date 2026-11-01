<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { passagesForSelectedNode, useSnippets } from '../../composables/contextLinks'
import { unlinkLink } from '../../composables/eventLinks'
import { jumpToBlock } from '../../composables/useJump'
import { useProjectStore } from '../../project/store'
import { useTimelinesStore } from '../../timeline/store'
import LinkCard from './LinkCard.vue'

const { t } = useI18n()
const store = useProjectStore()
const tl = useTimelinesStore()
const canEdit = computed(() => !store.readOnly)

const snippets = useSnippets(() =>
  passagesForSelectedNode.value
    .filter((p) => !p.missing)
    .map((p) => ({ linkId: p.link.id, sceneId: p.sceneId, blockId: p.blockId })),
)

async function remove(linkId: string): Promise<void> {
  if (!(await unlinkLink(linkId)).ok)
    Notify.create({ type: 'warning', message: t('eventLink.failed'), position: 'bottom', timeout: 5000 })
}
</script>

<template>
  <p v-if="!tl.selectedNodeId" class="note">{{ t('linksPanel.writtenIn.none') }}</p>
  <ul v-else-if="passagesForSelectedNode.length" class="cards">
    <LinkCard
      v-for="p in passagesForSelectedNode"
      :key="p.link.id"
      :problem="p.missing"
      :tag="p.missing ? t('eventLink.popover.problem') : undefined"
      :title="
        p.missing
          ? t('linksPanel.writtenIn.gone')
          : p.sceneTitle || t('linksPanel.writtenIn.untitledScene')
      "
      :snippet="p.missing ? '' : snippets[p.link.id] || ''"
    >
      <template v-if="p.missing">
        <button v-if="canEdit" type="button" class="btn" @click="remove(p.link.id)">
          {{ t('eventLink.popover.remove') }}
        </button>
      </template>
      <button v-else type="button" class="btn" @click="jumpToBlock(p.sceneId, p.blockId)">
        {{ t('eventLink.popover.jump') }}
      </button>
    </LinkCard>
  </ul>
  <p v-else class="note">{{ t('linksPanel.writtenIn.empty') }}</p>
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
