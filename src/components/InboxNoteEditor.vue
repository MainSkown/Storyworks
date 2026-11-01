<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { JSONContent } from '@tiptap/core'
import { inboxNoteKind } from '../editor/inboxNote'
import { useProjectStore } from '../project/store'
import EditorToolbar from './EditorToolbar.vue'
import InboxNoteActions from './InboxNoteActions.vue'
import '../editor/editor.css'

const props = defineProps<{ noteId: string }>()

const { t } = useI18n()
const store = useProjectStore()

const note = computed(() => store.inboxNotes.find((n) => n.id === props.noteId))
const locked = computed(() => !!store.readOnly)
const title = ref(note.value?.title ?? '')
const label = computed(() => note.value?.title || t('inbox.untitled'))
const inboxPath = computed(() => store.project?.manifest.inbox?.path ?? '')

const editor = useEditor({
  extensions: inboxNoteKind.extensions(),
  editable: !locked.value,
  editorProps: {
    attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('inbox.noteBody') },
  },
  onUpdate: ({ editor: ed }) => {
    store.updateNote(props.noteId, { content: ed.getJSON() as Record<string, unknown> })
  },
})

function load(): void {
  const ed = editor.value
  const n = note.value
  if (!ed || !n) return
  const body = n.content as JSONContent
  ed.chain()
    .setContent(body.content?.length ? body : '', { emitUpdate: false })
    .setMeta('addToHistory', false)
    .run()
  title.value = n.title ?? ''
}

// Loads once the editor exists, and again after the file was reloaded from disk.
watch(() => [editor.value, store.itemVersion(inboxPath.value)] as const, load, { immediate: true })
watch(locked, (v) => editor.value?.setEditable(!v, false))

function onTitle(): void {
  store.updateNote(props.noteId, { title: title.value })
}
</script>

<template>
  <div class="pane">
    <div class="top">
      <EditorToolbar
        class="tools"
        :editor="editor"
        :items="inboxNoteKind.toolbar"
        :disabled="locked || !note"
      />
      <div v-if="note" class="actions"><InboxNoteActions :note-id="noteId" :label="label" /></div>
    </div>
    <div class="scroll">
      <div class="sheet">
        <p v-if="locked" class="notice" role="note">{{ t('inbox.readOnly') }}</p>
        <label class="sr-only" for="note-title">{{ t('inbox.noteTitle') }}</label>
        <input
          id="note-title"
          v-model="title"
          class="title-input"
          :placeholder="t('inbox.untitled')"
          :readonly="locked"
          @input="onTitle"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <EditorContent :editor="editor" class="content" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.top {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}
.tools {
  flex: 1;
  border-bottom: 0;
}
.actions {
  padding-inline-end: 0.75rem;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 1rem 3rem;
  background: var(--bg-editor);
}
.sheet {
  box-sizing: border-box;
  max-width: 37.5rem;
  min-height: 100%;
  margin: 0 auto;
  padding: 2.5rem 3rem;
  border: 1px solid var(--border);
  border-radius: 0.25rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
}
.notice {
  margin: 0 0 1rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.title-input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 1rem;
  padding: 0.25rem 0;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 1.5rem;
  font-weight: 600;
}
.title-input:focus-visible,
.content :deep(.ProseMirror:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.content :deep(.ProseMirror) {
  min-height: 20rem;
  font-size: var(--editor-font-size);
  line-height: 1.7;
}
.content :deep(.ProseMirror > * + *) {
  margin-top: 0.75em;
}
.content :deep(p),
.content :deep(h1),
.content :deep(h2),
.content :deep(h3) {
  margin: 0;
}
.content :deep(h1) {
  font-size: 1.6em;
}
.content :deep(h2) {
  font-size: 1.35em;
}
.content :deep(h3) {
  font-size: 1.15em;
}
.content :deep(blockquote) {
  margin: 0;
  padding-inline-start: 1rem;
  border-inline-start: 3px solid var(--border-strong);
  color: var(--text-secondary);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
