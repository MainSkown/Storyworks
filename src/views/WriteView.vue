<script setup lang="ts">
// TEMPORARY UI: M2 replaces this view with the TipTap editor.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TrashDialog from '../components/TrashDialog.vue'
import { docToText, textToDoc } from '../project/plainText'
import { useProjectStore } from '../project/store'
import type { ManuscriptNode } from '../project/schemas/manifest'
import { sceneSchema, type Scene } from '../project/schemas/scene'

const SAVE_DELAY_MS = 400
const vFocus = { mounted: (el: HTMLElement) => el.focus() }

const { t } = useI18n()
const store = useProjectStore()

interface Row {
  node: ManuscriptNode
  depth: number
}
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (nodes: ManuscriptNode[], depth: number) =>
    nodes.forEach((node) => {
      out.push({ node, depth })
      walk(node.children, depth + 1)
    })
  walk(store.tree, 0)
  return out
})

const selectedId = ref<string | null>(null)
const selected = computed(
  () => rows.value.find((r) => r.node.id === selectedId.value)?.node ?? null,
)
const scenePath = computed(() =>
  selected.value?.type === 'scene' ? selected.value.path : undefined,
)
const locked = computed(() => !!store.readOnly)

// ---- scene editing ----
const current = ref<Scene | null>(null)
const loadError = ref('')
const title = ref('')
const text = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

async function applyEdit(): Promise<void> {
  clearTimeout(timer)
  timer = undefined
  const scene = current.value
  const node = selected.value
  if (!scene || !node?.path || locked.value) return
  const name = title.value.trim() || node.title
  if (name !== node.title) await store.rename(node.id, name)
  const next: Scene = {
    ...scene,
    title: name,
    content: textToDoc(text.value, scene.content),
  }
  next.wordCount = text.value.split(/\s+/).filter(Boolean).length
  if (store.updateItem(node.path, sceneSchema, next)) current.value = next
}
function scheduleEdit(): void {
  clearTimeout(timer)
  timer = setTimeout(applyEdit, SAVE_DELAY_MS)
}

async function load(path: string | undefined): Promise<void> {
  clearTimeout(timer)
  timer = undefined
  current.value = null
  loadError.value = ''
  if (!path) return
  const r = await store.loadScene(path)
  if (path !== scenePath.value) return
  if (!r.ok) {
    loadError.value = r.error.message
    return
  }
  current.value = r.value
  title.value = r.value.title
  text.value = docToText(r.value.content)
}

watch(
  () => [scenePath.value, scenePath.value ? store.itemVersion(scenePath.value) : 0] as const,
  ([path]) => load(path),
  { immediate: true },
)

async function select(id: string | null): Promise<void> {
  await applyEdit()
  selectedId.value = id
}

// The selected item can vanish (deleted, outside change): fall back to nothing selected.
watch(rows, (r) => {
  if (selectedId.value && !r.some((x) => x.node.id === selectedId.value)) selectedId.value = null
})
onBeforeUnmount(() => {
  void applyEdit()
})

// ---- tree actions ----
async function addScene(): Promise<void> {
  await applyEdit()
  const parent = selected.value && selected.value.type !== 'scene' ? selected.value.id : null
  selectedId.value = await store.addScene(parent, t('write.newScene'))
}

const renamingId = ref<string | null>(null)
const renameText = ref('')
function startRename(node: ManuscriptNode): void {
  renamingId.value = node.id
  renameText.value = node.title
}
async function commitRename(): Promise<void> {
  const id = renamingId.value
  renamingId.value = null
  if (id) await store.rename(id, renameText.value)
  if (id === selectedId.value && selected.value) title.value = selected.value.title
}

async function move(dir: 'up' | 'down'): Promise<void> {
  if (selectedId.value) await store.moveUpDown(selectedId.value, dir)
}

const confirmDelete = ref(false)
async function doDelete(): Promise<void> {
  const id = selectedId.value
  if (!id) return
  await applyEdit()
  selectedId.value = null
  await store.deleteItem(id)
}

const trashOpen = ref(false)
</script>

<template>
  <section class="write" :aria-label="t('write.title')">
    <aside class="tree-pane">
      <h1 class="heading">{{ t('write.title') }}</h1>
      <QBanner v-if="locked" rounded class="note" role="status">
        {{ t('write.readOnly') }}
      </QBanner>

      <div class="toolbar" role="toolbar" :aria-label="t('write.actions')">
        <QBtn
          dense
          unelevated
          no-caps
          class="btn-secondary"
          icon="add"
          :label="t('write.addScene')"
          :disable="locked"
          @click="addScene"
        />
        <QBtn
          dense
          unelevated
          no-caps
          class="btn-secondary"
          icon="edit"
          :aria-label="t('write.rename')"
          :title="t('write.rename')"
          :disable="locked || !selected"
          @click="selected && startRename(selected)"
        />
        <QBtn
          dense
          unelevated
          class="btn-secondary"
          icon="arrow_upward"
          :aria-label="t('write.moveUp')"
          :title="t('write.moveUp')"
          :disable="locked || !selected"
          @click="move('up')"
        />
        <QBtn
          dense
          unelevated
          class="btn-secondary"
          icon="arrow_downward"
          :aria-label="t('write.moveDown')"
          :title="t('write.moveDown')"
          :disable="locked || !selected"
          @click="move('down')"
        />
        <QBtn
          dense
          unelevated
          class="btn-secondary"
          icon="delete"
          :aria-label="t('write.delete')"
          :title="t('write.delete')"
          :disable="locked || !selected"
          @click="confirmDelete = true"
        />
        <QBtn
          dense
          unelevated
          no-caps
          class="btn-secondary"
          icon="restore_from_trash"
          :label="t('write.trash')"
          @click="trashOpen = true"
        />
      </div>

      <p v-if="rows.length === 0" class="empty">{{ t('write.emptyTree') }}</p>
      <ul v-else class="tree" :aria-label="t('write.tree')">
        <li v-for="r in rows" :key="r.node.id" :style="{ paddingInlineStart: `${r.depth}rem` }">
          <input
            v-if="renamingId === r.node.id"
            v-model="renameText"
            v-focus
            class="rename"
            :aria-label="t('write.rename')"
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="renamingId = null"
            @blur="renamingId && commitRename()"
          />
          <button
            v-else
            type="button"
            class="item"
            :class="{ active: r.node.id === selectedId }"
            :aria-current="r.node.id === selectedId ? 'true' : undefined"
            @click="select(r.node.id)"
          >
            <span class="kind">{{ t(`write.kind.${r.node.type}`) }}</span>
            {{ r.node.title }}
          </button>
        </li>
      </ul>
    </aside>

    <div class="editor-pane">
      <p v-if="loadError" class="empty" role="alert">
        {{ t('write.loadError', { message: loadError }) }}
      </p>
      <template v-else-if="current">
        <label class="field" for="write-title">{{ t('write.sceneTitle') }}</label>
        <input
          id="write-title"
          v-model="title"
          class="title-input"
          :readonly="locked"
          @input="scheduleEdit"
          @blur="applyEdit"
        />
        <label class="field" for="write-body">{{ t('write.sceneText') }}</label>
        <textarea
          id="write-body"
          v-model="text"
          class="body-input"
          :readonly="locked"
          @input="scheduleEdit"
          @blur="applyEdit"
        ></textarea>
      </template>
      <p v-else class="empty">
        {{ selected ? t('write.notScene') : t('write.nothingSelected') }}
      </p>
    </div>

    <QDialog v-model="confirmDelete">
      <QCard class="confirm" role="alertdialog" aria-labelledby="write-del-title">
        <QCardSection>
          <h2 id="write-del-title" class="confirm-title">{{ t('write.deleteTitle') }}</h2>
          <p>{{ t('write.deleteBody', { title: selected?.title ?? '' }) }}</p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps autofocus :label="t('write.cancel')" @click="confirmDelete = false" />
          <QBtn
            unelevated
            no-caps
            color="negative"
            :label="t('write.delete')"
            @click="((confirmDelete = false), doDelete())"
          />
        </QCardActions>
      </QCard>
    </QDialog>

    <TrashDialog v-model="trashOpen" />
  </section>
</template>

<style scoped>
.write {
  display: flex;
  height: 100%;
  color: var(--text-primary);
}
.tree-pane {
  width: 18rem;
  flex: none;
  overflow-y: auto;
  padding: 1rem;
  background: var(--bg-panel);
  border-inline-end: 1px solid var(--border);
}
.heading {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.note {
  margin-bottom: 0.75rem;
  background: var(--bg-selected);
  color: var(--text-primary);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}
.tree {
  list-style: none;
  margin: 0;
  padding: 0;
}
.item {
  display: block;
  width: 100%;
  padding: 0.35rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.item:hover {
  background: var(--bg-raised);
}
.item.active {
  background: var(--bg-selected);
  border-color: var(--border-strong);
  font-weight: 600;
}
.item:focus-visible,
.rename:focus-visible,
.title-input:focus-visible,
.body-input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.kind {
  margin-inline-end: 0.4rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
}
.rename,
.title-input,
.body-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.editor-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 1rem 1.5rem;
  background: var(--bg-editor);
}
.field {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.title-input {
  font-size: 1.2rem;
  font-weight: 600;
}
.body-input {
  flex: 1;
  min-height: 12rem;
  resize: none;
  font-size: var(--editor-font-size);
  line-height: 1.6;
}
.empty {
  color: var(--text-secondary);
}
.confirm {
  min-width: min(26rem, 90vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.confirm-title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
</style>
