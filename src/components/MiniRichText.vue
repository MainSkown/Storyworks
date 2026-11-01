<script setup lang="ts">
import { watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { JSONContent } from '@tiptap/core'
import { inboxNoteKind } from '../editor/inboxNote'
import EditorToolbar from './EditorToolbar.vue'
import '../editor/editor.css'

const props = defineProps<{
  modelValue: Record<string, unknown>
  /** Changes when another item is shown: the editor reloads even if the text looks the same. */
  itemKey: string
  label: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [doc: Record<string, unknown>] }>()

let emitted: unknown = null
const editor = useEditor({
  extensions: inboxNoteKind.extensions(),
  editable: !props.disabled,
  editorProps: {
    attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': props.label },
  },
  onUpdate: ({ editor: ed }) => {
    emitted = ed.getJSON()
    emit('update:modelValue', emitted as Record<string, unknown>)
  },
})

let shownKey: string | undefined
watch(
  () => [editor.value, props.itemKey, props.modelValue] as const,
  ([ed, key, value]) => {
    if (key !== shownKey) emitted = null
    shownKey = key
    if (!ed || value === emitted) return
    const body = value as JSONContent
    ed.chain()
      .setContent(body.content?.length ? body : '', { emitUpdate: false })
      .setMeta('addToHistory', false)
      .run()
  },
  { immediate: true },
)
watch(
  () => props.disabled,
  (v) => editor.value?.setEditable(!v, false),
)
</script>

<template>
  <div class="mini">
    <EditorToolbar
      class="tools"
      :editor="editor"
      :items="inboxNoteKind.toolbar"
      :disabled="disabled"
    />
    <EditorContent :editor="editor" class="content" />
  </div>
</template>

<style scoped>
.mini {
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
}
.tools {
  padding: 0.25rem;
}
.mini :deep(.group) {
  padding-inline-start: 0.25rem;
}
.mini :deep(.ProseMirror:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.content :deep(.ProseMirror) {
  min-height: 6rem;
  max-height: 20rem;
  overflow-y: auto;
  padding: 0.375rem 0.5rem;
  color: var(--text-primary);
  font-size: 0.9375rem;
  line-height: 1.5;
}
.content :deep(.ProseMirror > * + *) {
  margin-top: 0.5em;
}
.content :deep(p),
.content :deep(h1),
.content :deep(h2),
.content :deep(h3) {
  margin: 0;
}
.content :deep(h1) {
  font-size: 1.25em;
}
.content :deep(h2) {
  font-size: 1.15em;
}
.content :deep(h3) {
  font-size: 1.05em;
}
</style>
