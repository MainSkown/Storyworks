<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { JSONContent } from '@tiptap/core'
import { editorKinds } from '../../editor/kinds'
import { docsEqual, toEditorContent } from './linesDoc'
import { useSpellStore } from '../../spell/store'
import { useProjectStore } from '../../project/store'
import { useCodexStore } from '../../codex/store'
import EditorToolbar from '../EditorToolbar.vue'
import SpeakerPicker from '../SpeakerPicker.vue'
import { characterSpeakers, recentSpeakers, resolveSpeaker, type SpeakerEntry } from '../../editor/game/speakers'
import type { SpeakerValue } from '../../editor/game/speakerPlugin'
import '../../editor/editor.css'

// One lines node's body. The parent keys this by node id; `content` may still change from
// outside for the same node (snapshot restore, undo).
const props = defineProps<{
  conversationId: string
  nodeId: string
  content: Record<string, unknown>
  editable: boolean
}>()
const emit = defineEmits<{ change: [content: Record<string, unknown>] }>()

const { t } = useI18n()
const store = useProjectStore()
const codex = useCodexStore()
const spell = useSpellStore()

const kind = editorKinds.game!
const toolbarItems = kind.toolbar.filter((i) => ['speaker', 'undo', 'redo'].includes(i.id))
function openFromToolbar(action: string): void {
  const ed = editor.value
  if (action === 'speaker' && ed) openSpeakerPicker(ed.state.selection.$from.before())
}
const canEdit = computed(() => props.editable && !store.readOnly)

// ---- speakers (resolved live from the codex, as in scripts) ----
const speakerChoices = computed(() => characterSpeakers(codex.types, codex.entries))
const speakerById = computed(
  () => new Map<string, SpeakerEntry>(codex.entries.map((e) => [e.id, { id: e.id, name: e.name, aliases: e.aliases }])),
)
const speakerPick = ref<{ pos: number; x: number; y: number } | null>(null)
const pickedLine = computed(() => {
  const at = speakerPick.value
  const node = at ? editor.value?.state.doc.nodeAt(at.pos) : null
  return node?.type.name === 'line' ? node : null
})
const pickedView = computed(() =>
  resolveSpeaker(
    { speakerId: pickedLine.value?.attrs.speakerId ?? null, speakerName: pickedLine.value?.attrs.speakerName ?? null },
    (id) => speakerById.value.get(id),
  ),
)
const pickedRestorable = computed(
  () => pickedView.value.state === 'broken' && store.trash.some((e) => e.id === (pickedView.value as { id: string }).id && e.type === 'entry'),
)
const pickedRecent = computed(() => (editor.value && speakerPick.value ? recentSpeakers(editor.value.getJSON()) : []))
function openSpeakerPicker(pos: number): void {
  const ed = editor.value
  if (!ed || !canEdit.value) return
  const c = ed.view.coordsAtPos(pos + 1)
  speakerPick.value = { pos, x: c.left, y: c.bottom + 4 }
}
function closeSpeakerPicker(): void {
  speakerPick.value = null
  editor.value?.commands.focus()
}
function pickText(): void {
  const at = speakerPick.value
  if (at) editor.value?.commands.setLineKind(at.pos, 'text')
  closeSpeakerPicker()
}
function pickSpeaker(value: SpeakerValue): void {
  const at = speakerPick.value
  if (at) editor.value?.commands.setSpeaker(at.pos, value)
  closeSpeakerPicker()
}
async function addSpeakerToCodex(name: string): Promise<void> {
  const at = speakerPick.value
  const ed = editor.value
  if (!at || !ed) return
  ed.commands.setSpeaker(at.pos, { speakerName: name })
  const id = await codex.createEntry({ name, typeId: speakerChoices.value.characterTypeId })
  if (id) ed.commands.linkSpeakerName(name, id)
  closeSpeakerPicker()
}
async function restoreSpeaker(id: string): Promise<void> {
  await store.restoreItem(id)
  closeSpeakerPicker()
}
// Chips show codex names; redraw them when the codex changes.
watch(
  () => [codex.entries, store.trash],
  () => {
    const ed = editor.value
    if (ed && !ed.isDestroyed) ed.view.dispatch(ed.state.tr.setMeta('speakers', true))
  },
)

// ---- autosave ----
const SAVE_DELAY = 400
let timer: ReturnType<typeof setTimeout> | undefined
let dirty = false
// The last doc this component sent or applied; a parent echo of it is not an outside change.
let lastSeen = JSON.stringify(toEditorContent(props.content))

function flush(): void {
  clearTimeout(timer)
  timer = undefined
  const ed = editor.value
  if (!dirty || !ed || ed.isDestroyed) return
  dirty = false
  const json = ed.getJSON()
  lastSeen = JSON.stringify(json)
  emit('change', json as Record<string, unknown>)
}

const editor = useEditor({
  extensions: kind.extensions({
    spellcheck: (text) => spell.checkText(text),
    allocateLineId: () => store.reserveLineId(),
    speakers: {
      label: (a) => {
        const v = resolveSpeaker(a, (id) => speakerById.value.get(id))
        if (v.state === 'entry') return { text: v.name, state: 'entry', title: t('speaker.of', { name: v.name }) }
        if (v.state === 'name') return { text: v.name, state: 'name', title: t('speaker.notInCodex', { name: v.name }) }
        if (v.state === 'broken') return { text: t('speaker.deleted'), state: 'broken', title: t('speaker.deletedTitle') }
        return { text: '—', state: 'none', title: t('speaker.narration') }
      },
      onPick: openSpeakerPicker,
      onChip: openSpeakerPicker,
    },
  }),
  content: toEditorContent(props.content) as JSONContent,
  editable: canEdit.value,
  editorProps: {
    attributes: {
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': t('game.conversation.lines.label'),
      class: 'game',
    },
  },
  onUpdate: () => {
    dirty = true
    clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DELAY)
  },
  onBlur: () => flush(),
})

onMounted(() => void spell.start())
watch(
  () => spell.version,
  () => editor.value?.commands.recheckSpelling(),
)
watch(canEdit, (v) => editor.value?.setEditable(v, false))

// An outside change to the same node: apply it unless it is our own echo or the user is mid-edit.
watch(
  () => props.content,
  (next) => {
    const ed = editor.value
    if (!ed || ed.isDestroyed || dirty) return
    const incoming = toEditorContent(next)
    const s = JSON.stringify(incoming)
    if (s === lastSeen || docsEqual(incoming, ed.getJSON())) return
    lastSeen = s
    ed.chain()
      .setContent(incoming as JSONContent, { emitUpdate: false })
      .setMeta('addToHistory', false)
      .run()
  },
  { deep: true },
)

onBeforeUnmount(flush)
</script>

<template>
  <div class="lines-editor">
    <EditorToolbar :editor="editor" :items="toolbarItems" :disabled="!canEdit" @action="openFromToolbar" />
    <EditorContent :editor="editor" class="content" />
    <SpeakerPicker
      v-if="speakerPick && pickedLine"
      :x="speakerPick.x"
      :y="speakerPick.y"
      :entries="speakerChoices.list"
      :recent="pickedRecent"
      :current="pickedView"
      :is-text="pickedLine?.attrs.kind === 'text'"
      :restorable="pickedRestorable"
      :readonly="!canEdit"
      @pick="pickSpeaker"
      @text="pickText"
      @add="addSpeakerToCodex"
      @restore="restoreSpeaker"
      @close="closeSpeakerPicker"
    />
  </div>
</template>

<style scoped>
.lines-editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.content {
  /* Room for the line ids that sit in the left margin of each line. */
  padding: 0.5rem 0.5rem 0.5rem calc(9ch + 0.5rem);
  color: var(--text-primary);
}
.content :deep(.ProseMirror:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
