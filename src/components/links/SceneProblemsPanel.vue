<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { sceneProblems, useSnippets } from '../../composables/contextLinks'
import { relinkLink, unlinkLink } from '../../composables/eventLinks'
import { useProjectStore } from '../../project/store'
import NodePickerDialog from '../NodePickerDialog.vue'
import LinkCard from './LinkCard.vue'

const { t } = useI18n()
const store = useProjectStore()
const canEdit = computed(() => !store.readOnly)
const pickerOpen = ref(false)
const relinking = ref('')

const snippets = useSnippets(() =>
  sceneProblems.value
    .filter((p) => !p.passageMissing && p.link.from.block !== undefined)
    .map((p) => ({ linkId: p.link.id, sceneId: p.link.from.item, blockId: p.link.from.block! })),
)

const warn = (message: string) =>
  Notify.create({ type: 'warning', message, position: 'bottom', timeout: 5000 })

function startRelink(linkId: string): void {
  relinking.value = linkId
  pickerOpen.value = true
}

async function onPick(timelineId: string, nodeId: string): Promise<void> {
  const r = await relinkLink(relinking.value, timelineId, nodeId)
  if (!r.ok) warn(t(r.reason === 'duplicate' ? 'eventLink.alreadyLinked' : 'eventLink.failed', 1))
}

async function remove(linkId: string): Promise<void> {
  if (!(await unlinkLink(linkId)).ok) warn(t('eventLink.failed'))
}
</script>

<template>
  <ul v-if="sceneProblems.length" class="cards">
    <LinkCard
      v-for="p in sceneProblems"
      :key="p.link.id"
      problem
      :tag="t('eventLink.popover.problem')"
      :title="p.passageMissing ? t('linksPanel.passageGone') : t('eventLink.popover.missing')"
      :snippet="snippets[p.link.id]"
    >
      <button v-if="canEdit && p.canRelink" type="button" class="btn" @click="startRelink(p.link.id)">
        {{ t('eventLink.popover.relink') }}
      </button>
      <button v-if="canEdit" type="button" class="btn" @click="remove(p.link.id)">
        {{ t('eventLink.popover.remove') }}
      </button>
    </LinkCard>
  </ul>
  <p v-else class="note">{{ t('linksPanel.problems.empty') }}</p>
  <NodePickerDialog v-model="pickerOpen" :title="t('eventLink.picker.titleRelink')" @pick="onPick" />
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
