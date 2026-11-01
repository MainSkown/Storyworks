<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { JSONContent } from '@tiptap/core'
import { inboxNoteKind } from '../../editor/inboxNote'
import { useProjectStore } from '../../project/store'
import { useTimelinesStore, type Outcome } from '../../timeline/store'
import { dateToInput, readDateInput } from '../../timeline/dateInput'
import EditorToolbar from '../EditorToolbar.vue'
import '../../editor/editor.css'

const { t, te } = useI18n()
const tl = useTimelinesStore()
const project = useProjectStore()
const uid = useId()

const node = computed(() => tl.current?.nodes.find((n) => n.id === tl.selectedNodeId) ?? null)
const branches = computed(() => tl.current?.branches ?? [])
const locked = computed(() => !!project.readOnly)
const edgeCount = computed(
  () =>
    tl.current?.edges.filter((e) => e.from === node.value?.id || e.to === node.value?.id).length ??
    0,
)
const message = ref('')

function report(r: Outcome): void {
  const key = r.ok ? '' : `timelines.rejected.${r.reason}`
  message.value = r.ok ? '' : te(key) ? t(key) : t('sidebar.errorGeneric')
}

// ---- title, tag, colour ----
const title = ref('')
const tag = ref('')
watch(
  () => [node.value?.id, node.value?.title, node.value?.tag] as const,
  () => {
    title.value = node.value?.title ?? ''
    tag.value = node.value?.tag ?? ''
  },
  { immediate: true },
)
function saveTitle(): void {
  if (node.value && title.value !== node.value.title)
    report(tl.updateNode(node.value.id, { title: title.value }))
}
function saveTag(): void {
  const next = tag.value.trim() || null
  if (node.value && next !== node.value.tag) report(tl.updateNode(node.value.id, { tag: next }))
}
function setColor(e: Event): void {
  if (node.value)
    report(tl.updateNode(node.value.id, { color: (e.target as HTMLInputElement).value }))
}
const clearColor = () => node.value && report(tl.updateNode(node.value.id, { color: null }))

// ---- date ----
const dateText = ref('')
const dateError = ref('')
watch(
  () => [node.value?.id, node.value?.date, tl.calendar] as const,
  () => {
    dateText.value = node.value ? dateToInput(tl.calendar, node.value.date) : ''
    dateError.value = ''
  },
  { immediate: true },
)
const storedProblem = computed(() => (node.value ? tl.invalidDates.get(node.value.id) : undefined))
function saveDate(): void {
  const n = node.value
  if (!n) return
  const r = readDateInput(tl.calendar, dateText.value)
  if (r.kind === 'error') {
    dateError.value = t(`timelines.inspector.dateError.${r.reason}`)
    return
  }
  dateError.value = ''
  report(tl.updateNode(n.id, { date: r.kind === 'set' ? r.date : null }))
}

// ---- description ----
let emitted: unknown = null
const editor = useEditor({
  extensions: inboxNoteKind.extensions(),
  editable: !locked.value,
  editorProps: {
    attributes: {
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': t('timelines.inspector.description'),
    },
  },
  onUpdate: ({ editor: ed }) => {
    const n = node.value
    if (!n) return
    emitted = ed.getJSON()
    tl.updateNode(n.id, { description: emitted as Record<string, unknown> })
  },
})
function loadDescription(): void {
  const ed = editor.value
  const n = node.value
  if (!ed || !n || n.description === emitted) return
  const body = n.description as JSONContent
  ed.chain()
    .setContent(body.content?.length ? body : '', { emitUpdate: false })
    .setMeta('addToHistory', false)
    .run()
}
let shownId: string | undefined
watch(
  () => [editor.value, node.value?.id, node.value?.description] as const,
  () => {
    // Another event: always reload. Same event: only when the change did not come from this editor.
    if (node.value?.id !== shownId) emitted = null
    shownId = node.value?.id
    loadDescription()
  },
  { immediate: true },
)
watch(locked, (v) => editor.value?.setEditable(!v, false))

// ---- branch ----
const newBranchOpen = ref(false)
const branchName = ref('')
const branchColor = ref('#2f5d8a')
const branchDashed = ref(false)
function setBranch(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  if (node.value) report(tl.updateNode(node.value.id, { branchId: v || null }))
}
function createBranch(): void {
  const n = node.value
  const name = branchName.value.trim()
  if (!n || !name) return
  const r = tl.addBranch({ name, color: branchColor.value, dashed: branchDashed.value })
  report(r)
  if (!r.ok || !('id' in r)) return
  report(tl.updateNode(n.id, { branchId: r.id }))
  newBranchOpen.value = false
  branchName.value = ''
  branchDashed.value = false
}

// ---- delete ----
const confirmOpen = ref(false)
function remove(): void {
  if (!node.value) return
  if (edgeCount.value > 0) confirmOpen.value = true
  else report(tl.deleteNode(node.value.id))
}
function confirmRemove(): void {
  if (node.value) report(tl.deleteNode(node.value.id))
  confirmOpen.value = false
}
</script>

<template>
  <p v-if="!node" class="note">{{ t('timelines.inspector.none') }}</p>
  <div v-else class="props">
    <p v-if="locked" class="note" role="note">{{ t('timelines.rejected.read-only') }}</p>

    <label class="label" :for="`${uid}-title`">{{ t('timelines.inspector.title') }}</label>
    <input
      :id="`${uid}-title`"
      v-model="title"
      class="control"
      :placeholder="t('timelines.untitled')"
      :readonly="locked"
      @change="saveTitle"
      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
    />

    <span class="label">{{ t('timelines.inspector.description') }}</span>
    <div class="desc">
      <EditorToolbar
        class="tools"
        :editor="editor"
        :items="inboxNoteKind.toolbar"
        :disabled="locked"
      />
      <EditorContent :editor="editor" class="content" />
    </div>

    <label class="label" :for="`${uid}-date`">{{ t('timelines.inspector.date') }}</label>
    <input
      :id="`${uid}-date`"
      v-model="dateText"
      class="control"
      :placeholder="t('timelines.inspector.datePlaceholder')"
      :readonly="locked"
      :aria-invalid="dateError ? 'true' : undefined"
      :aria-describedby="
        dateError ? `${uid}-date-msg` : storedProblem ? `${uid}-date-warn` : undefined
      "
      @change="saveDate"
      @keydown.enter.prevent="saveDate"
    />
    <p v-if="dateError" :id="`${uid}-date-msg`" class="error" role="alert">{{ dateError }}</p>
    <p v-else-if="storedProblem" :id="`${uid}-date-warn`" class="warning" role="status">
      <QIcon name="warning" aria-hidden="true" />
      {{ t(`timelines.invalidDate.${storedProblem}`) }} {{ t('timelines.inspector.dateKept') }}
    </p>

    <span class="label">{{ t('timelines.inspector.color') }}</span>
    <div class="row">
      <input
        type="color"
        class="swatch"
        :value="node.color ?? '#a4560f'"
        :disabled="locked"
        :aria-label="t('timelines.inspector.color')"
        @change="setColor"
      />
      <button type="button" class="btn" :disabled="locked || !node.color" @click="clearColor">
        {{ t('timelines.inspector.noColor') }}
      </button>
    </div>

    <label class="label" :for="`${uid}-tag`">{{ t('timelines.inspector.tag') }}</label>
    <input
      :id="`${uid}-tag`"
      v-model="tag"
      class="control"
      :list="`${uid}-tags`"
      :readonly="locked"
      @change="saveTag"
      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
    />
    <datalist :id="`${uid}-tags`">
      <option v-for="x in tl.tags" :key="x" :value="x" />
    </datalist>

    <label class="label" :for="`${uid}-branch`">{{ t('timelines.inspector.branch') }}</label>
    <select
      :id="`${uid}-branch`"
      class="control"
      :value="node.branchId ?? ''"
      :disabled="locked"
      @change="setBranch"
    >
      <option value="">{{ t('timelines.mainLine') }}</option>
      <option v-for="b in branches" :key="b.id" :value="b.id">
        {{ b.name }}{{ b.dashed ? ' - ' + t('timelines.inspector.dashed') : '' }}
      </option>
    </select>
    <button
      v-if="!newBranchOpen"
      type="button"
      class="btn"
      :disabled="locked"
      @click="newBranchOpen = true"
    >
      {{ t('timelines.inspector.newBranch') }}
    </button>
    <form v-else class="branch-form" @submit.prevent="createBranch">
      <label class="label" :for="`${uid}-bname`">{{ t('timelines.inspector.branchName') }}</label>
      <input :id="`${uid}-bname`" v-model="branchName" class="control" required />
      <div class="row">
        <input
          v-model="branchColor"
          type="color"
          class="swatch"
          :aria-label="t('timelines.inspector.branchColor')"
        />
        <label class="check">
          <input v-model="branchDashed" type="checkbox" />
          {{ t('timelines.inspector.dashedLine') }}
        </label>
      </div>
      <div class="row">
        <button type="submit" class="btn primary" :disabled="!branchName.trim()">
          {{ t('timelines.inspector.createBranch') }}
        </button>
        <button type="button" class="btn" @click="newBranchOpen = false">
          {{ t('timelines.inspector.cancel') }}
        </button>
      </div>
    </form>

    <p v-if="message" class="error" role="alert">{{ message }}</p>

    <button type="button" class="btn danger" :disabled="locked" @click="remove">
      {{ t('timelines.inspector.delete') }}
    </button>

    <QDialog v-model="confirmOpen">
      <QCard class="dialog" role="dialog">
        <QCardSection>
          <h2 class="dlg-title">{{ t('timelines.inspector.delete') }}</h2>
          <p>{{ t('timelines.inspector.deleteConfirm', { count: edgeCount }) }}</p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn
            flat
            no-caps
            :label="t('timelines.inspector.cancel')"
            @click="confirmOpen = false"
          />
          <QBtn
            flat
            no-caps
            color="negative"
            :label="t('timelines.inspector.delete')"
            @click="confirmRemove"
          />
        </QCardActions>
      </QCard>
    </QDialog>
  </div>
</template>

<style scoped>
.props {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.label {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
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
.control:focus-visible,
.btn:focus-visible,
.swatch:focus-visible,
.desc :deep(.ProseMirror:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.error {
  margin: 0;
  color: var(--section-checks);
  font-size: 0.8125rem;
}
.warning {
  display: flex;
  gap: 0.25rem;
  align-items: flex-start;
  margin: 0;
  color: var(--section-timelines);
  font-size: 0.8125rem;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.swatch {
  width: 2.25rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  cursor: pointer;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8125rem;
}
.btn {
  align-self: flex-start;
  margin-top: 0.25rem;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  background: var(--bg-selected);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn.primary {
  border-color: var(--section-timelines);
  background: var(--section-timelines);
  color: var(--section-timelines-on);
}
.btn.danger {
  margin-top: 0.75rem;
  border-color: var(--section-checks);
  color: var(--section-checks);
}
.branch-form {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
}
.desc {
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
}
.desc .tools {
  padding: 0.25rem;
}
.desc :deep(.group) {
  padding-inline-start: 0.25rem;
}
.content :deep(.ProseMirror) {
  min-height: 5rem;
  max-height: 14rem;
  overflow-y: auto;
  padding: 0.375rem 0.5rem;
  color: var(--text-primary);
  font-size: 0.875rem;
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
.dialog {
  min-width: min(24rem, 90vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.dlg-title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
</style>
