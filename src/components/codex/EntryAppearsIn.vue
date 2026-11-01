<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { orderPassages } from '../../codex/appearsIn'
import { jumpToBlock } from '../../composables/useJump'
import { blockSnippet } from '../../project/linkProblems'
import { removeLink } from '../../project/links'
import type { ManuscriptNode } from '../../project/schemas/manifest'
import { blockIds } from '../../project/schemas/scene'
import { useProjectStore } from '../../project/store'
import { findNode } from '../../project/tree'
import LinkCard from '../links/LinkCard.vue'

const props = defineProps<{ entryId: string }>()
const { t } = useI18n()
const project = useProjectStore()
const canEdit = computed(() => !project.readOnly)

interface Row {
  linkId: string
  sceneId: string
  blockId: string
  sceneTitle: string | null
  missing: boolean
  snippet: string
}
const rows = ref<Row[]>([])
let token = 0

function sceneOrder(nodes: ManuscriptNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'scene') out.push(n.id)
    sceneOrder(n.children, out)
  }
  return out
}

async function build(): Promise<void> {
  const mine = ++token
  const ix = project.linkIndex()
  if (!ix) {
    rows.value = []
    return
  }
  const links = ix.linksTo({ item: props.entryId })
  const sceneIds = [...new Set(links.map((l) => l.from.item))]
  const blocks = new Map<string, string[]>()
  const contents = new Map<string, unknown>()
  for (const id of sceneIds) {
    const path = findNode(project.tree, id)?.path
    const r = path ? await project.loadScene(path) : null
    if (r?.ok) {
      contents.set(id, r.value.content)
      blocks.set(id, blockIds(r.value.content))
    }
  }
  if (mine !== token) return
  rows.value = orderPassages(links, props.entryId, sceneOrder(project.tree), blocks).map((l) => ({
    linkId: l.id,
    sceneId: l.from.item,
    blockId: l.from.block!,
    sceneTitle: findNode(project.tree, l.from.item)?.title ?? null,
    missing: ix.isPassageBroken(l),
    snippet: contents.has(l.from.item)
      ? (blockSnippet(contents.get(l.from.item), l.from.block!) ?? '')
      : '',
  }))
}
watch(() => [props.entryId, project.linkRevision] as const, build, { immediate: true })

async function jump(r: Row): Promise<void> {
  if (!(await jumpToBlock(r.sceneId, r.blockId)).ok)
    Notify.create({
      type: 'warning',
      message: t('codex.passageGone'),
      position: 'bottom',
      timeout: 5000,
    })
}
async function remove(r: Row): Promise<void> {
  if (!(await project.updateSceneLinks(r.sceneId, (ls) => removeLink(ls, r.linkId))))
    Notify.create({
      type: 'warning',
      message: t('codex.passageRemoveFailed'),
      position: 'bottom',
      timeout: 5000,
    })
}
</script>

<template>
  <p v-if="!rows.length" class="note">{{ t('codex.appearsInNone') }}</p>
  <ul v-else class="cards" :aria-label="t('codex.appearsIn')">
    <LinkCard
      v-for="r in rows"
      :key="r.linkId"
      :problem="r.missing"
      :tag="r.missing ? t('codex.passageProblem') : undefined"
      :title="r.missing ? t('codex.passageGone') : r.sceneTitle || t('codex.untitledScene')"
      :meta="r.missing && r.sceneTitle ? r.sceneTitle : undefined"
      :snippet="r.missing ? '' : r.snippet"
    >
      <button v-if="!r.missing" type="button" class="btn" @click="jump(r)">
        {{ t('codex.jump') }}
      </button>
      <button v-else-if="canEdit" type="button" class="btn" @click="remove(r)">
        {{ t('codex.removeLink') }}
      </button>
    </LinkCard>
  </ul>
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
  font-size: 0.875rem;
}
</style>
