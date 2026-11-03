<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ItemLink } from '../../project/schemas/conversation'
import { useCrossLinks } from './crossLinkContext'
import LinkChip from './LinkChip.vue'

const props = defineProps<{
  /** Node target in this conversation. */
  target: string | null
  link: ItemLink | undefined
  /** Nodes of this conversation. */
  nodes: { id: string; label: string }[]
  /** Accessible-name suffix, e.g. "Option 2"; empty for a Jump node. */
  suffix: string
  disabled: boolean
}>()
const emit = defineEmits<{ node: [to: string]; link: [link: ItemLink | null] }>()

const { t } = useI18n()
const uid = useId()
const xl = useCrossLinks()

const mode = ref<'node' | 'item'>(props.link ? 'item' : 'node')
watch(
  () => props.link,
  (l) => {
    if (l) mode.value = 'item'
  },
)
const name = (key: string) =>
  props.suffix ? `${t(key)} (${props.suffix})` : t(key)

const ids = computed(() => new Set(props.nodes.map((n) => n.id)))

function setMode(m: 'node' | 'item'): void {
  mode.value = m
  if (m === 'node' && props.link) emit('link', null)
}

// ---- item picker ----
const grouped = computed(() => {
  const groups = new Map<string, typeof xl.items.value>()
  for (const i of xl.items.value) {
    if (i.trashed || i.id === xl.currentId.value) continue
    const key = i.folder.join(' / ')
    groups.set(key, [...(groups.get(key) ?? []), i])
  }
  return [...groups.entries()].map(([folder, list]) => ({ folder, list }))
})
const linkedItem = computed(() => (props.link ? xl.itemById.value.get(props.link.itemId) : undefined))
/** The linked item is gone or in the trash: not selectable, but shown as it is. */
const brokenItem = computed(() => !!props.link && (!linkedItem.value || linkedItem.value.trashed))
const typeText = (type: 'scene' | 'conversation') =>
  t(type === 'scene' ? 'game.crossLink.type.scene' : 'game.crossLink.type.conversation')
const optionText = (i: { title: string; type: 'scene' | 'conversation' }) =>
  `${i.title} (${typeText(i.type)})`

function pickItem(id: string): void {
  if (!id) return emit('link', null)
  if (id !== props.link?.itemId) emit('link', { itemId: id })
}

// ---- node picker (conversation targets only) ----
const targetNodes = computed(() => {
  const l = props.link
  if (!l || linkedItem.value?.type !== 'conversation' || linkedItem.value.trashed) return null
  const list = xl.nodesOf(l.itemId)
  return list ? list.map((n) => ({ id: n.id, label: xl.nodeLabel(n) })) : []
})
const missingNode = computed(
  () =>
    !!props.link?.nodeId &&
    !!targetNodes.value &&
    targetNodes.value.length > 0 &&
    !targetNodes.value.some((n) => n.id === props.link!.nodeId),
)
function pickNode(id: string): void {
  if (!props.link) return
  emit('link', id ? { itemId: props.link.itemId, nodeId: id } : { itemId: props.link.itemId })
}
</script>

<template>
  <div class="picker">
    <select
      class="control"
      :aria-label="name('game.crossLink.mode')"
      :value="mode"
      :disabled="disabled"
      @change="setMode(($event.target as HTMLSelectElement).value as 'node' | 'item')"
    >
      <option value="node">{{ t('game.crossLink.thisConversation') }}</option>
      <option value="item">{{ t('game.crossLink.anotherItem') }}</option>
    </select>

    <select
      v-if="mode === 'node'"
      class="control"
      :aria-label="name('game.conversation.target.label')"
      :value="target ?? ''"
      :disabled="disabled"
      @change="emit('node', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ t('game.conversation.target.none') }}</option>
      <option v-if="target && !ids.has(target)" :value="target">
        {{ t('game.conversation.target.missing') }}
      </option>
      <option v-for="x in nodes" :key="x.id" :value="x.id">{{ x.label }}</option>
    </select>

    <template v-else>
      <select
        :id="`${uid}-item`"
        class="control"
        :aria-label="name('game.crossLink.item')"
        :value="link?.itemId ?? ''"
        :disabled="disabled"
        @change="pickItem(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ t('game.crossLink.chooseItem') }}</option>
        <option v-if="brokenItem && link" :value="link.itemId">
          {{
            linkedItem
              ? t('game.crossLink.inTrashOption', { title: linkedItem.title })
              : t('game.crossLink.deletedItem')
          }}
        </option>
        <template v-for="g in grouped" :key="g.folder">
          <optgroup v-if="g.folder" :label="g.folder">
            <option v-for="i in g.list" :key="i.id" :value="i.id">{{ optionText(i) }}</option>
          </optgroup>
          <template v-else>
            <option v-for="i in g.list" :key="i.id" :value="i.id">{{ optionText(i) }}</option>
          </template>
        </template>
      </select>
      <p v-if="!grouped.length && !link" class="note">{{ t('game.crossLink.noItems') }}</p>

      <select
        v-if="targetNodes"
        class="control"
        :aria-label="name('game.crossLink.node')"
        :value="link?.nodeId ?? ''"
        :disabled="disabled"
        @change="pickNode(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ t('game.crossLink.start') }}</option>
        <option v-if="missingNode && link?.nodeId" :value="link.nodeId">
          {{ t('game.conversation.target.missing') }}
        </option>
        <option v-for="x in targetNodes" :key="x.id" :value="x.id">{{ x.label }}</option>
      </select>
      <LinkChip v-if="link" :link="link" interactive />
    </template>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: flex-start;
}
.control {
  width: 100%;
  box-sizing: border-box;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.control:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
</style>
