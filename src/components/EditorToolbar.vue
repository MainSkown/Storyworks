<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Editor } from '@tiptap/core'
import type { ToolbarItem } from '../editor/kinds'
import { ELEMENTS, type ElementType } from '../editor/screenplay/rules'
import { currentElement } from '../editor/screenplay/extension'

const props = defineProps<{
  editor: Editor | undefined
  items: ToolbarItem[]
  disabled?: boolean
}>()
const emit = defineEmits<{ action: [action: NonNullable<ToolbarItem['action']>] }>()
const { t } = useI18n()

// Item ids per toolbar group; ids not listed land in the last group.
const GROUPS = [
  ['h1', 'h2', 'h3'],
  ['bold', 'italic', 'underline'],
  ['bulletList', 'orderedList', 'blockquote'],
  ['align-left', 'align-center', 'align-right', 'align-justify'],
]
// Shortcuts defined by the editor extensions (TextAlign), shown in tooltips.
const SHORTCUTS: Record<string, string> = {
  bold: 'Ctrl+B',
  italic: 'Ctrl+I',
  underline: 'Ctrl+U',
  'align-left': 'Ctrl+Shift+L',
  'align-center': 'Ctrl+Shift+E',
  'align-right': 'Ctrl+Shift+R',
  'align-justify': 'Ctrl+Shift+J',
  eventLink: 'Ctrl+Shift+K',
}

// Screenplay: the element dropdown (the item only marks where it sits).
const hasElement = computed(() => props.items.some((i) => i.action === 'element'))
const activeElement = computed(() =>
  props.editor ? (currentElement(props.editor.state) ?? '') : '',
)
function setElement(type: string): void {
  props.editor
    ?.chain()
    .focus()
    .setElement(type as ElementType)
    .run()
}

const styleItems = computed(() => props.items.filter((i) => GROUPS[0]!.includes(i.id)))
const groups = computed(() => {
  const listed = new Set(GROUPS.flat())
  return [
    ...GROUPS.slice(1).map((ids) => props.items.filter((i) => ids.includes(i.id))),
    props.items.filter((i) => !listed.has(i.id) && i.action !== 'element'),
  ].filter((g) => g.length)
})

// Read inside render: the vue-3 Editor refreshes its state on every transaction.
const activeStyle = computed(() => {
  const ed = props.editor
  return ed ? (styleItems.value.find((i) => i.isActive?.(ed))?.id ?? '') : ''
})

function setStyle(id: string): void {
  const ed = props.editor
  if (!ed) return
  // Toggling the active heading turns it back into a paragraph.
  const target = id || activeStyle.value
  styleItems.value.find((i) => i.id === target)?.run(ed)
}

const blocked = (i: ToolbarItem): boolean =>
  !!props.disabled || !props.editor || (!!i.canRun && !i.canRun(props.editor))
function click(i: ToolbarItem): void {
  if (!props.editor) return
  if (i.action) emit('action', i.action)
  else i.run(props.editor)
}
const isActive = (i: ToolbarItem): boolean => !!props.editor && !!i.isActive?.(props.editor)
const tip = (i: ToolbarItem): string =>
  SHORTCUTS[i.id] ? `${t(i.labelKey)} (${SHORTCUTS[i.id]})` : t(i.labelKey)
</script>

<template>
  <div class="toolbar-wrap">
    <div class="toolbar" role="toolbar" :aria-label="t('editor.toolbar.label')">
      <select
        v-if="styleItems.length"
        class="style-select"
        :aria-label="t('editor.toolbar.paragraphStyle')"
        :value="activeStyle"
        :disabled="disabled || !editor"
        @change="setStyle(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ t('editor.toolbar.paragraph') }}</option>
        <option v-for="i in styleItems" :key="i.id" :value="i.id">{{ t(i.labelKey) }}</option>
      </select>
      <select
        v-if="hasElement"
        class="style-select"
        :aria-label="t('editor.toolbar.element')"
        :title="t('editor.toolbar.elementHint')"
        :value="activeElement"
        :disabled="disabled || !editor"
        @change="setElement(($event.target as HTMLSelectElement).value)"
      >
        <option v-if="!activeElement" value="" disabled>{{ t('editor.toolbar.element') }}</option>
        <option v-for="el in ELEMENTS" :key="el" :value="el">
          {{ t(`editor.element.${el}`) }}
        </option>
      </select>
      <div v-for="(g, n) in groups" :key="n" class="group" role="group">
        <button
          v-for="i in g"
          :key="i.id"
          type="button"
          class="tool"
          :class="{ active: isActive(i), accent: i.accent }"
          :aria-label="t(i.labelKey)"
          :aria-pressed="i.isActive ? isActive(i) : undefined"
          :aria-keyshortcuts="SHORTCUTS[i.id]"
          :title="tip(i)"
          :disabled="blocked(i)"
          @mousedown.prevent
          @click="click(i)"
        >
          <QIcon :name="i.icon" aria-hidden="true" />
          <span v-if="i.accent" class="tool-label">{{ t(i.labelKey) }}</span>
        </button>
      </div>
      <div v-if="$slots.end" class="end"><slot name="end" /></div>
    </div>
  </div>
</template>

<style scoped>
.toolbar-wrap {
  container-type: inline-size;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}
.end {
  margin-inline-start: auto;
}
.group {
  display: flex;
  gap: 0.125rem;
  padding-inline-start: 0.5rem;
  border-inline-start: 1px solid var(--border);
}
.style-select {
  height: 2rem;
  padding: 0 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.875rem;
  height: 2rem;
  border: 1px solid transparent;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font-size: 1.25rem;
  cursor: pointer;
}
.tool:hover:not(:disabled) {
  background: var(--bg-selected);
}
.tool.active {
  border-color: var(--border-strong);
  background: var(--bg-selected);
}
.tool.accent {
  width: auto;
  gap: 0.375rem;
  padding: 0 0.625rem;
  border-color: var(--tag-event);
  background: var(--tag-event);
  color: var(--tag-event-on);
}
.tool.accent:hover:not(:disabled) {
  background: var(--tag-event);
  filter: brightness(1.12);
}
.tool-label {
  font-size: 0.875rem;
  font-weight: 600;
}
/* Narrow editor: icon only (name stays in the tooltip and aria-label) so the toolbar stays one row. */
@container (max-width: 52rem) {
  .tool.accent {
    width: 1.875rem;
    padding: 0;
  }
  .tool-label {
    display: none;
  }
}
.tool:disabled,
.style-select:disabled {
  opacity: 0.5;
  cursor: default;
}
.tool:focus-visible,
.style-select:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
