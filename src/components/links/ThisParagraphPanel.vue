<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { currentBlock } from '../../composables/currentBlock'
import { paragraphLinks } from '../../composables/contextLinks'
import {
  linkSelectionToEntry,
  linkSelectionToKnowledge,
  linkSelectionToNode,
  relinkLink,
  relinkLinkToEntry,
  unlinkLink,
  type BlockLink,
} from '../../composables/eventLinks'
import { jumpToEntry, jumpToNode } from '../../composables/useJump'
import { openKnowledgeItem } from '../../knowledge/openItem'
import { useProjectStore } from '../../project/store'
import NodePickerDialog from '../NodePickerDialog.vue'
import LinkCard from './LinkCard.vue'

const { t } = useI18n()
const store = useProjectStore()
const canEdit = computed(() => !store.readOnly)
const pickerOpen = ref(false)
const picking = ref<{ mode: 'link' } | { mode: 'relink'; linkId: string; kind: 'event' | 'entry' }>({
  mode: 'link',
})
const pickerTabs = computed<('events' | 'codex' | 'knowledge')[]>(() =>
  picking.value.mode === 'link'
    ? ['events', 'codex', 'knowledge']
    : picking.value.kind === 'entry'
      ? ['codex']
      : ['events'],
)
const pickerTitle = computed(() =>
  picking.value.mode === 'link'
    ? t('eventLink.picker.titleLink')
    : t(picking.value.kind === 'entry' ? 'eventLink.picker.titleRelinkEntry' : 'eventLink.picker.titleRelink'),
)

const warn = (message: string) =>
  Notify.create({ type: 'warning', message, position: 'bottom', timeout: 5000 })

const isMissing = (r: BlockLink) => r.eventMissing || r.entryMissing || r.knowledgeMissing !== null
const KNOWLEDGE_MISSING = {
  item: 'knowledgeUse.missingItem',
  entry: 'knowledgeUse.missingEntry',
  both: 'knowledgeUse.missingBoth',
} as const

function cardTag(r: BlockLink): string {
  if (isMissing(r)) return t('eventLink.popover.problem')
  if (r.knowledge) return t('knowledgeUse.tag')
  if (r.entry) return r.entry.typeName ?? t('eventLink.popover.entry')
  return t('eventLink.popover.event')
}

function cardTitle(r: BlockLink): string {
  if (r.knowledgeMissing) return t(KNOWLEDGE_MISSING[r.knowledgeMissing])
  if (r.knowledge)
    return t('knowledgeUse.pair', {
      item: r.knowledge.itemTitle || t('knowledgeMatrix.untitledItem'),
      entry: r.knowledge.entryName || t('codex.untitled'),
    })
  if (r.entryMissing) return t('eventLink.popover.missingEntry')
  if (r.eventMissing) return t('eventLink.popover.missing')
  if (r.entry) return r.entry.name || t('codex.untitled')
  return r.target!.title || t('timelines.untitled')
}

function startLink(): void {
  picking.value = { mode: 'link' }
  pickerOpen.value = true
}

function startRelink(linkId: string, kind: 'event' | 'entry'): void {
  picking.value = { mode: 'relink', linkId, kind }
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

async function onPickEntry(entryId: string): Promise<void> {
  const cur = currentBlock.value
  const target = picking.value
  if (target.mode === 'link') {
    if (!cur?.blockId) return
    const r = await linkSelectionToEntry(cur.sceneId, [cur.blockId], entryId)
    if (!r.ok) warn(t('eventLink.failed'))
    else if (r.added === 0) warn(t('eventLink.alreadyLinked', 1))
  } else {
    const r = await relinkLinkToEntry(target.linkId, entryId)
    if (!r.ok) warn(t(r.reason === 'duplicate' ? 'eventLink.alreadyLinked' : 'eventLink.failed', 1))
  }
}

async function onPickKnowledge(itemId: string, entryId: string): Promise<void> {
  const cur = currentBlock.value
  if (picking.value.mode !== 'link' || !cur?.blockId) return
  const r = await linkSelectionToKnowledge(cur.sceneId, [cur.blockId], itemId, entryId)
  if (!r.ok) warn(t('eventLink.failed'))
  else if (r.added === 0) warn(t('eventLink.alreadyLinked', 1))
}

function cardMeta(r: BlockLink): string {
  if (r.knowledge)
    return [r.knowledge.typeName, r.knowledge.learns ? '' : t('knowledgeUse.notLearned')]
      .filter(Boolean)
      .join(' · ')
  return r.target ? [r.target.date, r.target.timelineName].filter(Boolean).join(' · ') : ''
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
        :problem="isMissing(r)"
        :tag-kind="r.knowledge ? 'knowledge' : r.entry ? 'codex' : undefined"
        :tag="cardTag(r)"
        :title="cardTitle(r)"
        :meta="cardMeta(r)"
      >
        <template v-if="isMissing(r)">
          <button
            v-if="canEdit && r.kind !== 'knowledge'"
            type="button"
            class="btn"
            @click="startRelink(r.link.id, r.kind === 'entry' ? 'entry' : 'event')"
          >
            {{ t('eventLink.popover.relink') }}
          </button>
          <button v-if="canEdit" type="button" class="btn" @click="unlink(r.link.id)">
            {{ t('eventLink.popover.remove') }}
          </button>
        </template>
        <template v-else-if="r.knowledge">
          <button type="button" class="btn" @click="openKnowledgeItem(r.knowledge.itemId)">
            {{ t('eventLink.popover.open') }}
          </button>
          <button v-if="canEdit" type="button" class="btn" @click="unlink(r.link.id)">
            {{ t('eventLink.popover.unlink') }}
          </button>
        </template>
        <template v-else-if="r.entry">
          <button type="button" class="btn" @click="jumpToEntry(r.entry.id)">
            {{ t('eventLink.popover.open') }}
          </button>
          <button v-if="canEdit" type="button" class="btn" @click="unlink(r.link.id)">
            {{ t('eventLink.popover.unlink') }}
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
    :title="pickerTitle"
    :tabs="pickerTabs"
    @pick="onPick"
    @pick-entry="onPickEntry"
    @pick-knowledge="onPickKnowledge"
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
