<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { blockSnippet } from '../../project/linkProblems'
import type { ManuscriptNode } from '../../project/schemas/manifest'
import { blockIds } from '../../project/schemas/scene'
import { useProjectStore } from '../../project/store'
import { findNode } from '../../project/tree'

type Passage = { sceneId: string; blockId: string }
const props = defineProps<{ disabled?: boolean }>()
const model = defineModel<Passage | null>({ required: true })

const { t } = useI18n()
const project = useProjectStore()

function scenesOf(nodes: ManuscriptNode[], out: { value: string; label: string }[] = []) {
  for (const n of nodes) {
    if (n.type === 'scene') out.push({ value: n.id, label: n.title || t('knowledge.untitledScene') })
    scenesOf(n.children, out)
  }
  return out
}
const allScenes = computed(() => scenesOf(project.tree))
const sceneQuery = ref('')
const sceneOptions = computed(() => {
  const q = sceneQuery.value.trim().toLowerCase()
  return q ? allScenes.value.filter((s) => s.label.toLowerCase().includes(q)) : allScenes.value
})
function filterScenes(val: string, update: (fn: () => void) => void): void {
  update(() => {
    sceneQuery.value = val
  })
}

// The scene is picked first; the passage is only set once a block is chosen.
const sceneId = ref<string | null>(model.value?.sceneId ?? null)
const blocks = ref<{ value: string; label: string }[]>([])
const loading = ref(false)
const sceneGone = computed(() => !!sceneId.value && !findNode(project.tree, sceneId.value))
let token = 0

async function loadBlocks(id: string | null): Promise<void> {
  const mine = ++token
  blocks.value = []
  const path = id ? findNode(project.tree, id)?.path : null
  if (!id || !path) return
  loading.value = true
  const r = await project.loadScene(path)
  if (mine !== token) return
  loading.value = false
  if (!r.ok) return
  blocks.value = blockIds(r.value.content).map((b, i) => ({
    value: b,
    label: `${i + 1}. ${blockSnippet(r.value.content, b) || t('knowledge.dialog.noText')}`,
  }))
}
watch(sceneId, loadBlocks, { immediate: true })
watch(
  () => model.value?.sceneId ?? null,
  (id) => {
    if (id !== sceneId.value && (id || !sceneId.value)) sceneId.value = id
  },
)

const blockQuery = ref('')
const blockOptions = computed(() => {
  const q = blockQuery.value.trim().toLowerCase()
  return q ? blocks.value.filter((b) => b.label.toLowerCase().includes(q)) : blocks.value
})
function filterBlocks(val: string, update: (fn: () => void) => void): void {
  update(() => {
    blockQuery.value = val
  })
}
const blockLabel = computed(() =>
  model.value
    ? (blocks.value.find((b) => b.value === model.value?.blockId)?.label ??
      t('knowledge.dialog.revealedMissing'))
    : undefined,
)

function pickScene(id: string | null): void {
  sceneId.value = id
  model.value = null
}
function pickBlock(id: string | null): void {
  model.value = id && sceneId.value ? { sceneId: sceneId.value, blockId: id } : null
}
function clear(): void {
  sceneId.value = null
  model.value = null
}
</script>

<template>
  <div class="rev">
    <QSelect
      :model-value="sceneId"
      :options="sceneOptions"
      :label="t('knowledge.dialog.revealedScene')"
      outlined
      dense
      clearable
      use-input
      input-debounce="0"
      emit-value
      map-options
      options-dense
      :disable="props.disabled"
      :display-value="sceneGone ? t('knowledge.dialog.revealedMissing') : undefined"
      @filter="filterScenes"
      @update:model-value="pickScene"
      @clear="clear"
    />
    <QSelect
      v-if="sceneId && !sceneGone"
      :model-value="model?.blockId ?? null"
      :options="blockOptions"
      :label="t('knowledge.dialog.revealedBlock')"
      :display-value="blockLabel"
      :loading="loading"
      outlined
      dense
      use-input
      input-debounce="0"
      emit-value
      map-options
      options-dense
      :disable="props.disabled"
      @filter="filterBlocks"
      @update:model-value="pickBlock"
    >
      <template #no-option>
        <QItem><QItemSection class="muted">{{ t('knowledge.dialog.noBlocks') }}</QItemSection></QItem>
      </template>
    </QSelect>
  </div>
</template>

<style scoped>
.rev {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.muted {
  color: var(--text-secondary);
}
</style>
