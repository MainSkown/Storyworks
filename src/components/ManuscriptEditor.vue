<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { JSONContent } from '@tiptap/core'
import { editorKinds } from '../editor/kinds'
import { NodeSelection } from '@tiptap/pm/state'
import { countWords } from '../editor/wordCount'
import { commentRanges } from '../editor/comments'
import { cursorBlockId, linkedBlocks, selectedBlockIds } from '../editor/eventLinks'
import { imageExt } from '../editor/projectImage'
import { newId } from '../project/ids'
import { pickImage } from '../project/pickImage'
import type { Scene } from '../project/schemas/scene'
import { focusMode } from '../composables/focusMode'
import { commentRailOpen } from '../composables/commentRail'
import {
  blockLinkInfoMap,
  linksForBlock,
  linkSelectionToEntry,
  linkSelectionToNode,
  relinkLink,
  relinkLinkToEntry,
  unlinkLink,
  type BlockLink,
} from '../composables/eventLinks'
import { jumpToEntry, jumpToNode } from '../composables/useJump'
import { currentBlock } from '../composables/currentBlock'
import { Notify } from 'quasar'
import { useProjectStore } from '../project/store'
import EditorToolbar from './EditorToolbar.vue'
import FootnotePopover from './FootnotePopover.vue'
import CommentRail from './CommentRail.vue'
import NodePickerDialog from './NodePickerDialog.vue'
import EventLinkGutter, { type GutterMarker } from './EventLinkGutter.vue'
import EventLinkPopover from './EventLinkPopover.vue'
import '../editor/editor.css'

const props = defineProps<{ sceneId: string; path: string; nodeTitle: string }>()

const { t } = useI18n()
const store = useProjectStore()

const kind = editorKinds[store.project?.manifest.kind ?? 'book'] ?? editorKinds.book!
const locked = computed(() => !!store.readOnly)
const loadError = ref('')
const title = ref(props.nodeTitle)

// The scene currently shown in the editor.
const loaded = shallowRef<{ id: string } | null>(null)
let loadToken = 0
let lastSave: Promise<unknown> = Promise.resolve()
let titleDirty = false
let lastTitle = props.nodeTitle

// Link count / broken flag per block of the open scene; changes only on link actions and saves.
const linkInfo = computed(() => (loaded.value ? blockLinkInfoMap(loaded.value.id) : new Map()))

const actionError = ref('')
const editor = useEditor({
  extensions: kind.extensions({
    readAsset: (path) => store.readAsset(path),
    missingLabel: (path) => t('image.missing', { path }),
    eventLinkInfo: (blockId) => linkInfo.value.get(blockId) ?? null,
  }),
  editable: false,
  editorProps: {
    attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('editor.body') },
    handleClickOn: (_view, _pos, node, nodePos) => {
      if (node.type.name !== 'footnote') return false
      openFootnote(nodePos)
      return true
    },
    handleClick: () => {
      closeFootnote(false)
      return false
    },
    handleKeyDown: (view, event) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.code === 'KeyK') {
        event.preventDefault()
        startEventLink()
        return true
      }
      const sel = view.state.selection
      if (event.key !== 'Enter' || !(sel instanceof NodeSelection)) return false
      if (sel.node.type.name !== 'footnote') return false
      openFootnote(sel.from)
      return true
    },
  },
  onUpdate: ({ editor: ed }) => {
    if (!loaded.value) return
    const content = ed.getJSON()
    // The store applies writes in order, on top of the scene's current metadata.
    lastSave = store
      .setSceneContent(loaded.value.id, content, countWords(content))
      .catch(() => undefined)
  },
})

const canEdit = computed(() => !locked.value && !loadError.value && !!loaded.value)
const refreshEditable = () => editor.value?.setEditable(canEdit.value, false)
watch(locked, refreshEditable)

// ---- footnote popover ----
const footnote = ref<{ pos: number; text: string; x: number; y: number } | null>(null)

const POPOVER_HEIGHT = 150

function openFootnote(pos: number): void {
  const ed = editor.value
  const node = ed?.state.doc.nodeAt(pos)
  if (!ed || node?.type.name !== 'footnote') return
  const dom = ed.view.nodeDOM(pos)
  const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null
  footnote.value = {
    pos,
    text: node.textContent,
    x: Math.max(8, Math.min(rect?.left ?? 8, window.innerWidth - 328)),
    // Flip above the footnote when the popover would run off the bottom of the window.
    y:
      (rect?.bottom ?? 0) + POPOVER_HEIGHT + 6 > window.innerHeight
        ? Math.max(8, (rect?.top ?? 0) - POPOVER_HEIGHT - 6)
        : (rect?.bottom ?? 0) + 6,
  }
}

function closeFootnote(refocus = true): void {
  const ed = editor.value
  const fn = footnote.value
  footnote.value = null
  if (!refocus || !ed || !fn) return
  const node = ed.state.doc.nodeAt(fn.pos)
  if (node)
    ed.chain()
      .focus(fn.pos + node.nodeSize)
      .run()
}

function editFootnote(text: string): void {
  const fn = footnote.value
  if (!fn || !canEdit.value) return
  editor.value
    ?.chain()
    .command(({ tr, state }) => {
      const node = state.doc.nodeAt(fn.pos)
      if (node?.type.name !== 'footnote') return false
      const from = fn.pos + 1
      const to = from + node.content.size
      if (text) tr.replaceWith(from, to, state.schema.text(text))
      else tr.delete(from, to)
      return true
    })
    .run()
  fn.text = text
}

function removeFootnote(): void {
  const fn = footnote.value
  if (!fn || !canEdit.value) return
  footnote.value = null
  editor.value
    ?.chain()
    .focus()
    .command(({ tr, state }) => {
      const node = state.doc.nodeAt(fn.pos)
      if (node?.type.name !== 'footnote') return false
      tr.delete(fn.pos, fn.pos + node.nodeSize)
      return true
    })
    .run()
}

function addFootnote(): void {
  const ed = editor.value
  if (!ed) return
  ed.chain().focus().insertFootnote().run()
  const before = ed.state.selection.$from.nodeBefore
  if (before?.type.name === 'footnote') openFootnote(ed.state.selection.from - before.nodeSize)
}

// ---- images ----
async function addImageFile(): Promise<void> {
  const ed = editor.value
  actionError.value = ''
  try {
    const file = await pickImage()
    if (!file || !ed) return
    const ext = imageExt(file.name)
    if (!ext) {
      actionError.value = t('image.badType', { name: file.name })
      return
    }
    const src = await store.addAsset(file.bytes, ext)
    ed.chain()
      .focus()
      .setImage({ src, alt: file.name.replace(/\.[^.]+$/, '') })
      .run()
  } catch (e) {
    actionError.value = t('image.failed', { message: e instanceof Error ? e.message : String(e) })
  }
}

// ---- comments ----
type SceneComment = Scene['comments'][number]
const comments = ref<SceneComment[]>([])
const ranges = shallowRef(new Map<string, { from: number; to: number }>())
const anchors = ref<Record<string, number>>({})
const activeId = ref<string | null>(null)
const draft = ref<{ from: number; to: number } | null>(null)
const layoutEl = ref<HTMLElement | null>(null)

// Comments whose mark is gone are orphans: hidden here, dropped from the file on the next save.
const visibleComments = computed(() => comments.value.filter((c) => ranges.value.has(c.id)))
const showRail = computed(() => commentRailOpen.value && !focusMode.value)

function refreshActive(): void {
  const sel = editor.value?.state.selection
  if (!sel) return
  activeId.value =
    [...ranges.value].find(([, r]) => r.from <= sel.from && sel.to <= r.to)?.[0] ?? null
}

function layoutRail(docChanged = true): void {
  const ed = editor.value
  const wrap = layoutEl.value
  if (!ed || !wrap) return
  if (docChanged) ranges.value = commentRanges(ed.state.doc)
  refreshActive()
  try {
    const base = wrap.getBoundingClientRect().top
    const next: Record<string, number> = {}
    const top = (pos: number) => Math.max(0, ed.view.coordsAtPos(pos).top - base)
    for (const [id, r] of ranges.value) next[id] = top(r.from)
    if (draft.value) next.draft = top(draft.value.from)
    anchors.value = next
  } catch {
    // Editor view not ready or detached; the next update lays it out.
  }
  layoutMarkers()
}

function startComment(): void {
  const ed = editor.value
  if (!ed || !canEdit.value || ed.state.selection.empty) return
  const { from, to } = ed.state.selection
  draft.value = { from, to }
  commentRailOpen.value = true
  void nextTick(() => layoutRail(false))
}

async function submitComment(text: string): Promise<void> {
  const ed = editor.value
  const d = draft.value
  const scene = loaded.value
  if (!ed || !d || !scene) return
  const id = newId()
  draft.value = null
  // Body first, then the mark: the save that carries the mark never finds an orphan.
  if (!(await store.addSceneComment(scene.id, { id, text }))) return
  if (loaded.value?.id !== scene.id) return
  comments.value = [
    ...comments.value,
    { id, text, createdAt: new Date().toISOString(), resolved: false },
  ]
  ed.chain().focus().setTextSelection({ from: d.from, to: d.to }).setComment(id).run()
}

function editComment(id: string, text: string): void {
  if (!loaded.value || !canEdit.value) return
  comments.value = comments.value.map((c) => (c.id === id ? { ...c, text } : c))
  void store.updateSceneComment(loaded.value.id, id, { text })
}

function resolveComment(id: string, resolved: boolean): void {
  if (!loaded.value || !canEdit.value) return
  comments.value = comments.value.map((c) => (c.id === id ? { ...c, resolved } : c))
  void store.updateSceneComment(loaded.value.id, id, { resolved })
}

function removeComment(id: string): void {
  if (!loaded.value || !canEdit.value) return
  editor.value?.commands.unsetComment(id)
  comments.value = comments.value.filter((c) => c.id !== id)
  void store.deleteSceneComment(loaded.value.id, id)
}

function jumpToComment(id: string): void {
  const r = ranges.value.get(id)
  if (r) editor.value?.chain().focus().setTextSelection(r).scrollIntoView().run()
}

function onToolbarAction(action: 'footnote' | 'image' | 'comment' | 'eventLink'): void {
  if (action === 'footnote') addFootnote()
  else if (action === 'image') void addImageFile()
  else if (action === 'eventLink') startEventLink()
  else startComment()
}

// ---- event links ----
const sheetEl = ref<HTMLElement | null>(null)
const markers = ref<GutterMarker[]>([])
const pickerOpen = ref(false)
const picking = ref<
  { mode: 'link'; blockIds: string[] } | { mode: 'relink'; linkId: string; kind: 'event' | 'entry' }
>({ mode: 'link', blockIds: [] })
const pickerTabs = computed<('events' | 'codex')[]>(() =>
  picking.value.mode === 'link' ? ['events', 'codex'] : picking.value.kind === 'entry' ? ['codex'] : ['events'],
)
const pickerTitle = computed(() =>
  picking.value.mode === 'link'
    ? t('eventLink.picker.titleLink')
    : t(picking.value.kind === 'entry' ? 'eventLink.picker.titleRelinkEntry' : 'eventLink.picker.titleRelink'),
)
const pop = ref<{ blockId: string; x: number; y: number } | null>(null)
const popRows = computed<BlockLink[]>(() =>
  pop.value && loaded.value ? linksForBlock(loaded.value.id, pop.value.blockId) : [],
)
const menuOpen = ref(false)
const canLinkSelection = computed(
  () => canEdit.value && !!editor.value && selectedBlockIds(editor.value.state).length > 0,
)

function layoutMarkers(): void {
  const ed = editor.value
  const sheet = sheetEl.value
  if (!ed || !sheet) return
  try {
    const base = sheet.getBoundingClientRect().top
    markers.value = linkedBlocks(ed.state.doc, (id) => linkInfo.value.get(id) ?? null).flatMap(
      (b) => {
        const dom = ed.view.nodeDOM(b.pos)
        if (!(dom instanceof HTMLElement)) return []
        return [
          { id: b.id, count: b.count, broken: b.broken, events: b.events, entries: b.entries, top: dom.getBoundingClientRect().top - base + 2 },
        ]
      },
    )
  } catch {
    // Editor view not ready or detached; the next update lays it out.
  }
}

watch(linkInfo, () => {
  editor.value?.commands.refreshEventLinks()
  void nextTick(layoutMarkers)
})

function startEventLink(): void {
  const ed = editor.value
  if (!ed || !canEdit.value) return
  const blockIds = selectedBlockIds(ed.state)
  if (blockIds.length === 0) return
  closePopover(false)
  picking.value = { mode: 'link', blockIds }
  pickerOpen.value = true
}

const warn = (message: string) =>
  Notify.create({ type: 'warning', message, position: 'bottom', timeout: 5000 })

async function onPickEntry(entryId: string): Promise<void> {
  const target = picking.value
  const scene = loaded.value
  if (!scene) return
  if (target.mode === 'link') {
    const r = await linkSelectionToEntry(scene.id, target.blockIds, entryId)
    if (!r.ok) warn(t('eventLink.failed'))
    else if (r.added === 0) warn(t('eventLink.alreadyLinked', target.blockIds.length))
  } else {
    const r = await relinkLinkToEntry(target.linkId, entryId)
    if (!r.ok) warn(t(r.reason === 'duplicate' ? 'eventLink.alreadyLinked' : 'eventLink.failed', 1))
  }
  editor.value?.commands.focus()
}

async function onPick(timelineId: string, nodeId: string): Promise<void> {
  const target = picking.value
  const scene = loaded.value
  if (!scene) return
  if (target.mode === 'link') {
    const r = await linkSelectionToNode(scene.id, target.blockIds, timelineId, nodeId)
    if (!r.ok) warn(t('eventLink.failed'))
    else if (r.added === 0) warn(t('eventLink.alreadyLinked', target.blockIds.length))
  } else {
    const r = await relinkLink(target.linkId, timelineId, nodeId)
    if (!r.ok) warn(t(r.reason === 'duplicate' ? 'eventLink.alreadyLinked' : 'eventLink.failed', 1))
  }
  editor.value?.commands.focus()
}

function openPopover(blockId: string, el: HTMLElement): void {
  if (pop.value?.blockId === blockId) return closePopover(false)
  const rect = el.getBoundingClientRect()
  const height = 140
  pop.value = {
    blockId,
    x: Math.max(8, Math.min(rect.right + 6, window.innerWidth - 360)),
    y:
      rect.top + height > window.innerHeight
        ? Math.max(8, window.innerHeight - height - 8)
        : rect.top,
  }
}

function closePopover(refocus = true): void {
  const p = pop.value
  pop.value = null
  if (!refocus || !p) return
  void nextTick(() =>
    document
      .querySelector<HTMLElement>(`[data-marker-block="${CSS.escape(p.blockId)}"]`)
      ?.focus(),
  )
}

watch(popRows, (rows) => {
  if (pop.value && rows.length === 0) closePopover()
})

function jumpFromPopover(row: BlockLink): void {
  closePopover(false)
  if (row.link.to.block) void jumpToNode(row.link.to.item, row.link.to.block)
}

async function unlinkFromPopover(linkId: string): Promise<void> {
  if (!(await unlinkLink(linkId)).ok) warn(t('eventLink.failed'))
}

function openEntryFromPopover(row: BlockLink): void {
  closePopover(false)
  void jumpToEntry(row.link.to.item)
}

function relinkFromPopover(linkId: string): void {
  const kind = popRows.value.find((r) => r.link.id === linkId)?.kind ?? 'event'
  closePopover(false)
  picking.value = { mode: 'relink', linkId, kind }
  pickerOpen.value = true
}

// Shift + right-click keeps the browser's own menu (copy, paste, spelling).
function nativeMenuWithShift(e: MouseEvent): void {
  if (e.shiftKey) e.stopPropagation()
}

watch(
  editor,
  (ed) => {
    if (!ed) return
    ed.on('transaction', ({ transaction }) => {
      if (transaction.docChanged) {
        const fn = footnote.value
        if (fn && ed.state.doc.nodeAt(fn.pos)?.type.name !== 'footnote') footnote.value = null
        layoutRail()
      } else if (transaction.selectionSet) refreshActive()
      if (transaction.docChanged || transaction.selectionSet) publishCurrentBlock()
    })
  },
  { immediate: true },
)

// Shared with the context panel ("This paragraph").
function publishCurrentBlock(): void {
  const ed = editor.value
  const scene = loaded.value
  currentBlock.value =
    ed && scene ? { sceneId: scene.id, blockId: cursorBlockId(ed.state) } : null
}

let resizeObs: ResizeObserver | null = null
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !layoutEl.value) return
  resizeObs = new ResizeObserver(() => layoutRail(false))
  resizeObs.observe(layoutEl.value)
})

async function commitTitle(): Promise<void> {
  if (!titleDirty || !loaded.value || locked.value) return
  titleDirty = false
  const name = title.value.trim()
  if (name === '') {
    title.value = lastTitle
    return
  }
  lastTitle = name
  await store.rename(loaded.value.id, name)
}

async function load(): Promise<void> {
  const token = ++loadToken
  const ed = editor.value
  if (!ed || !props.path) return
  await commitTitle()
  await lastSave
  if (loaded.value && !locked.value)
    await store.pruneSceneComments(loaded.value.id).catch(() => false)
  const r = await store.loadScene(props.path)
  if (token !== loadToken) return
  loaded.value = null
  currentBlock.value = null
  if (!r.ok) {
    loadError.value = r.error.message
    ed.setEditable(false, false)
    return
  }
  const body = r.value.content as JSONContent
  try {
    ed.chain()
      // Invalid content must throw: silently dropping it would let the next edit overwrite the file.
      .setContent(body.content?.length ? body : '', {
        emitUpdate: false,
        errorOnInvalidContent: true,
      })
      .setMeta('addToHistory', false)
      .run()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
    ed.setEditable(false, false)
    return
  }
  loadError.value = ''
  footnote.value = null
  pop.value = null
  draft.value = null
  comments.value = r.value.comments
  loaded.value = { id: r.value.id }
  title.value = lastTitle = r.value.title
  titleDirty = false
  refreshEditable()
  publishCurrentBlock()
  await nextTick()
  layoutRail()
}

watch(
  () => [editor.value, props.path, store.itemVersion(props.path)] as const,
  () => void load(),
  { immediate: true },
)

// A rename from the tree shows up here; a title being typed wins.
watch(
  () => props.nodeTitle,
  (v) => {
    if (!titleDirty) title.value = lastTitle = v
  },
)

onBeforeUnmount(() => {
  resizeObs?.disconnect()
  currentBlock.value = null
  void commitTitle()
  if (loaded.value && !locked.value)
    void store.pruneSceneComments(loaded.value.id).catch(() => false)
})
</script>

<template>
  <div class="pane">
    <EditorToolbar
      v-if="!focusMode"
      :editor="editor"
      :items="kind.toolbar"
      :disabled="!canEdit"
      @action="onToolbarAction"
    >
      <template #end>
        <button
          type="button"
          class="rail-toggle"
          :aria-expanded="commentRailOpen"
          aria-controls="comment-rail"
          :aria-label="commentRailOpen ? t('comments.hide') : t('comments.show')"
          :title="commentRailOpen ? t('comments.hide') : t('comments.show')"
          @mousedown.prevent
          @click="commentRailOpen = !commentRailOpen"
        >
          <QIcon :name="commentRailOpen ? 'comments_disabled' : 'comment'" aria-hidden="true" />
          <span v-if="visibleComments.length" class="count" :title="t('comments.count', { n: visibleComments.length })">{{ visibleComments.length }}</span>
        </button>
      </template>
    </EditorToolbar>
    <div class="scroll" @scroll.passive="closeFootnote(false); closePopover(false)">
      <div ref="layoutEl" class="layout" :class="{ collapsed: !showRail || (!visibleComments.length && !draft) }">
        <div ref="sheetEl" class="sheet">
          <p v-if="locked" class="notice" role="note">{{ t('write.readOnlyNotice') }}</p>
          <p v-if="loadError" class="notice" role="alert">
            {{ t('write.loadError', { message: loadError }) }}
          </p>
          <p v-if="actionError" class="notice" role="alert">{{ actionError }}</p>
          <label class="sr-only" for="write-title">{{ t('write.sceneTitle') }}</label>
          <input
            id="write-title"
            v-model="title"
            class="title-input"
            :readonly="locked || !loaded"
            @input="titleDirty = true"
            @change="commitTitle"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
          <div class="content-wrap" @contextmenu.capture="nativeMenuWithShift">
            <EditorContent :editor="editor" class="content" />
            <QMenu v-model="menuOpen" context-menu auto-close>
              <QList dense>
                <QItem clickable :disable="!canLinkSelection" @click="startEventLink">
                  <QItemSection>{{ t('editor.toolbar.eventLink') }}</QItemSection>
                  <QItemSection side>Ctrl+Shift+K</QItemSection>
                </QItem>
              </QList>
            </QMenu>
          </div>
          <EventLinkGutter
            :markers="markers"
            :expanded="pop?.blockId ?? null"
            @open="openPopover"
          />
        </div>
        <CommentRail
          v-if="showRail"
          id="comment-rail"
          class="rail"
          :comments="visibleComments"
          :anchors="anchors"
          :has-draft="!!draft"
          :active-id="activeId"
          :editable="canEdit"
          @jump="jumpToComment"
          @edit="editComment"
          @resolve="resolveComment"
          @remove="removeComment"
          @submit-draft="submitComment"
          @cancel-draft="draft = null"
        />
      </div>
    </div>
    <NodePickerDialog
      v-model="pickerOpen"
      :title="pickerTitle"
      :tabs="pickerTabs"
      @pick="onPick"
      @pick-entry="onPickEntry"
    />
    <EventLinkPopover
      v-if="pop && popRows.length"
      :x="pop.x"
      :y="pop.y"
      :rows="popRows"
      :readonly="!canEdit"
      @close="closePopover()"
      @jump="jumpFromPopover"
      @open="openEntryFromPopover"
      @unlink="unlinkFromPopover"
      @relink="relinkFromPopover"
    />
    <FootnotePopover
      v-if="footnote"
      :x="footnote.x"
      :y="footnote.y"
      :text="footnote.text"
      :readonly="!canEdit"
      @edit="editFootnote"
      @close="closeFootnote()"
      @remove="removeFootnote"
    />
  </div>
</template>

<style scoped>
.pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 0.75rem 3rem;
  background: var(--bg-editor);
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 37.5rem) minmax(13rem, 1fr);
  min-height: 100%;
}
.layout.collapsed {
  grid-template-columns: minmax(0, 1fr) minmax(0, 37.5rem) minmax(0, 1fr);
}
.rail {
  grid-column: 3;
}
.rail-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font-size: 1.25rem;
  cursor: pointer;
}
.rail-toggle:hover {
  background: var(--bg-selected);
}
.rail-toggle:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.count {
  position: absolute;
  top: -0.25rem;
  right: -0.25rem;
  box-sizing: border-box;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.25rem;
  border-radius: 0.5rem;
  background: var(--focus-ring);
  color: var(--bg-sheet);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1rem;
  text-align: center;
}
.sheet {
  position: relative;
  grid-column: 2;
  box-sizing: border-box;
  min-width: 0;
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
.content :deep(.scene-break) {
  margin: 1.5rem auto;
  width: 30%;
  border: 0;
  border-top: 1px solid var(--border-strong);
}
.content :deep(.scene-break.ProseMirror-selectednode) {
  outline: 2px solid var(--focus-ring);
}
.content :deep(.image-node) {
  width: fit-content;
  max-width: 100%;
}
.content :deep(.image-node.is-missing) {
  width: auto;
}
.content :deep(img) {
  display: block;
  max-width: 100%;
}
.content :deep(.image-node.is-missing img) {
  display: none;
}
.content :deep(.image-missing) {
  display: none;
}
.content :deep(.image-node.is-missing .image-missing) {
  display: block;
  padding: 1.5rem 1rem;
  border: 1px dashed var(--border-strong);
  border-radius: 0.375rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
  text-align: center;
}
.content :deep(.image-node.ProseMirror-selectednode) {
  outline: 2px solid var(--focus-ring);
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
