<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { currentBlock } from '../../composables/currentBlock'
import { paragraphLinks } from '../../composables/contextLinks'
import { linkSelectionToNode, relinkLink, unlinkLink } from '../../composables/eventLinks'
import { jumpToNode } from '../../composables/useJump'
import { useProjectStore } from '../../project/store'
import NodePickerDialog from '../NodePickerDialog.vue'
import LinkCard from './LinkCard.vue'

const { t } = useI18n()
const store = useProjectStore()
const canEdit = computed(() => !store.readOnly)
const pickerOpen = ref(false)
const picking = ref<{ mode: 'link' } | { mode: 'relink'; linkId: string }>({ mode: 'link' })

const warn = (message: string) =>
  Notify.create({ type: 'warning', message, position: 'bottom', timeout: 5000 })

function startLink(): void {
  picking.value = { mode: 'link' }
  pickerOpen.value = true
}

function startRelink(linkId: string): void {
  picking.value = { mode: 'relink', linkId }
  pickerOpen.value = true
}

async function onPick(timelineId: string, nodeId: string): Promise<void> {
  const cur = currentBlock.value
  const target = picking.value
  if (target.mode === 'link') {
    if (!cur?.blockId) return
    const r = await linkSelectionToNode(cur.sceneId, [cur.blockId], timelineId, nodeId)
    if (!r.ok) warn(t('eventLink.failed'))
    else if (r.added === 0) warn(t('eventLink.alreadyLinked', 1))
  } else {
    const r = await relinkLink(target.linkId, timelineId, nodeId)
    if (!r.ok) warn(t(r.reason === 'duplicate' ? 'eventLink.alreadyLinked' : 'eventLink.failed', 1))
  }
}

async function unlink(linkId: string): Promise<void> {
  if (!(await unlinkLink(linkId)).ok) warn(t('eventLink.failed'))
}
</script>

<template>
  <p v-if="!currentBlock?.blockId" class="note">{{ t('linksPanel.paragraph.none') }}</p>
  <template v-else>
    <ul v-if="paragraphLinks.length" class="cards">
      <LinkCard
        v-for="r in paragraphLinks"
        :key="r.link.id"
        :problem="r.eventMissing"
        :tag="r.eventMissing ? t('eventLink.popover.problem') : t('eventLink.popover.event')"
        :title="
          r.eventMissing ? t('eventLink.popover.missing') : r.target!.title || t('timelines.untitled')
        "
        :meta="r.eventMissing ? '' : [r.target!.date, r.target!.timelineName].filter(Boolean).join(' · ')"
      >
        <template v-if="r.eventMissing">
          <button v-if="canEdit" type="button" class="btn" @click="startRelink(r.link.id)">
            {{ t('eventLink.popover.relink') }}
          </button>
          <button v-if="canEdit" type="button" class="btn" @click="unlink(r.link.id)">
            {{ t('eventLink.popover.remove') }}
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="btn"
            @click="jumpToNode(r.link.to.item, r.link.to.block!)"
          >
            {{ t('eventLink.popover.jump') }}
          </button>
          <button v-if="canEdit" type="button" class="btn" @click="unlink(r.link.id)">
            {{ t('eventLink.popover.unlink') }}
          </button>
        </template>
      </LinkCard>
    </ul>
    <p v-else class="note">{{ t('linksPanel.paragraph.empty') }}</p>
    <button v-if="canEdit" type="button" class="btn add" @click="startLink">
      {{ t('linksPanel.paragraph.link') }}
    </button>
  </template>
  <NodePickerDialog
    v-model="pickerOpen"
    :title="picking.mode === 'link' ? t('eventLink.picker.titleLink') : t('eventLink.picker.titleRelink')"
    @pick="onPick"
  />
</template>

<style scoped>
.cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
  padding: 0;
}
.note {
  margin: 0 0 0.5rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.add {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.add:hover {
  background: var(--bg-selected);
}
.add:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
