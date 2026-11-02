<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import CorkboardView from '../components/CorkboardView.vue'
import ManuscriptEditor from '../components/ManuscriptEditor.vue'
import { focusMode, isFocusShortcut } from '../composables/focusMode'
import { writeView } from '../composables/writeView'
import { useHistoryStore } from '../history/store'
import { useProjectStore } from '../project/store'
import { sceneStatusSchema, type Scene } from '../project/schemas/scene'
import type { ManuscriptNode } from '../project/schemas/manifest'
import type { Issue } from '../project/types'

const { t } = useI18n()
const store = useProjectStore()
const history = useHistoryStore()
const { selectedId } = storeToRefs(store)

// The selected node and its nearest container (chapter or part).
const found = computed(() => {
  let hit: { node: ManuscriptNode; parent: ManuscriptNode | null } | null = null
  const walk = (nodes: ManuscriptNode[], parent: ManuscriptNode | null) => {
    for (const n of nodes) {
      if (n.id === selectedId.value) hit = { node: n, parent }
      else if (!hit) walk(n.children, n)
    }
  }
  walk(store.tree, null)
  return hit as { node: ManuscriptNode; parent: ManuscriptNode | null } | null
})
const selected = computed(() => found.value?.node ?? null)
const scene = computed(() => (selected.value?.type === 'scene' ? selected.value : null))

const problem = computed(() => {
  const id = selectedId.value
  if (!id) return null
  return (
    store.issues.find(
      (i): i is Extract<Issue, { kind: 'missing' | 'invalid' }> =>
        i.kind !== 'unlisted' && i.itemId === id,
    ) ?? null
  )
})
const editable = computed(() => !!scene.value?.path && !problem.value)

// ---- header band: status + Focus, teleported into the shell's band ----
const meta = computed(() => (scene.value ? store.sceneMeta.get(scene.value.id) : undefined))
const statusLocked = computed(() => !!store.readOnly || !editable.value)
function setStatus(status: Scene['status']): void {
  if (scene.value) void store.setSceneMeta(scene.value.id, { status })
}

// ---- status bar ----
const sceneWords = computed(() => (scene.value ? (store.wordCounts.get(scene.value.id) ?? 0) : 0))
const chapter = computed(() => found.value?.parent ?? null)
const chapterWords = computed(() =>
  chapter.value ? (store.wordCounts.get(chapter.value.id) ?? 0) : 0,
)
const bookWords = computed(() => store.wordCounts.get('') ?? 0)
const saveIcon = computed(
  () => ({ saved: 'check_circle', saving: 'sync', error: 'error_outline' })[store.saveStatus],
)

// ---- focus mode ----
function onKeydown(e: KeyboardEvent): void {
  if (isFocusShortcut(e)) {
    e.preventDefault()
    focusMode.value = !focusMode.value
  } else if (e.key === 'Escape' && focusMode.value && !e.defaultPrevented) {
    focusMode.value = false
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  focusMode.value = false
})
// Nothing to focus on without an editor.
watch(editable, (v) => {
  if (!v) focusMode.value = false
})
const corkboard = computed(() => writeView.value === 'corkboard')
watch(corkboard, (v) => {
  if (v) focusMode.value = false
})
</script>

<template>
  <section class="write" :class="{ focus: focusMode }" :aria-label="t('sections.write')">
    <Teleport defer to="#band-actions-target">
      <div class="band-view" role="group" :aria-label="t('corkboard.view')">
        <button
          v-for="mode in ['editor', 'corkboard'] as const"
          :key="mode"
          type="button"
          :aria-pressed="writeView === mode"
          @click="writeView = mode"
        >
          <QIcon :name="mode === 'editor' ? 'edit_note' : 'dashboard'" aria-hidden="true" />
          {{ t(`corkboard.${mode}`) }}
        </button>
      </div>
      <select
        v-if="scene && !corkboard"
        class="band-select"
        :aria-label="t('write.status')"
        :value="meta?.status ?? 'draft'"
        :disabled="statusLocked || !meta"
        @change="setStatus(($event.target as HTMLSelectElement).value as Scene['status'])"
      >
        <option v-for="s in sceneStatusSchema.options" :key="s" :value="s">
          {{ t(`outline.status.${s}`) }}
        </option>
      </select>
      <button
        type="button"
        class="band-focus"
        :aria-pressed="focusMode"
        :disabled="!editable || corkboard"
        :title="t('write.focusTitle')"
        @click="focusMode = !focusMode"
      >
        <QIcon name="center_focus_strong" aria-hidden="true" />
        {{ t('write.focus') }}
      </button>
    </Teleport>

    <div class="stage">
      <CorkboardView v-if="corkboard" />
      <div v-else-if="problem" class="empty" role="alert" data-testid="item-problem">
        <p class="problem">
          <QIcon
            :name="problem.kind === 'missing' ? 'report_problem' : 'error_outline'"
            size="1rem"
            aria-hidden="true"
          />
          <strong>{{ t(`write.problem.${problem.kind}`) }}</strong>
        </p>
        <p v-if="problem.kind === 'missing'">{{ t('write.problem.missingBody') }}</p>
        <template v-else>
          <p v-if="problem.error.field">
            {{ t('project.field') }}: <code>{{ problem.error.field }}</code>
          </p>
          <p>{{ problem.error.message }}</p>
          <p>{{ t('write.problem.invalidBody') }}</p>
        </template>
        <p class="path">
          <code>{{ problem.path }}</code>
        </p>
      </div>
      <ManuscriptEditor
        v-else-if="scene?.path"
        :scene-id="scene.id"
        :path="scene.path"
        :node-title="scene.title"
      />
      <p v-else class="empty">
        {{ selected ? t('write.notScene') : t('write.nothingSelected') }}
      </p>
    </div>

    <div class="statusbar" role="status" :aria-label="t('write.statusBar')">
      <template v-if="scene">
        <span>{{ t('write.scene') }}: {{ sceneWords }} {{ t('sidebar.words') }}</span>
        <span v-if="chapter">
          {{ t(`write.kind.${chapter.type}`) }}: {{ chapterWords }} {{ t('sidebar.words') }}
        </span>
      </template>
      <span>{{ t('write.book') }}: {{ bookWords }} {{ t('sidebar.words') }}</span>
      <RouterLink class="changes-link" :to="{ name: 'history', query: { tab: 'changes' } }" :title="t('history.status.open')">
        {{ t('history.status.changes', history.changeCount) }}
      </RouterLink>
      <span class="save"
        ><QIcon :name="saveIcon" aria-hidden="true" /> {{ t(`status.${store.saveStatus}`) }}</span
      >
    </div>

    <button v-if="focusMode" type="button" class="exit-focus" @click="focusMode = false">
      <QIcon name="close" aria-hidden="true" />
      {{ t('write.exitFocus') }}
    </button>
  </section>
</template>

<style scoped>
.write {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--text-primary);
}
.stage {
  flex: 1;
  min-height: 0;
  background: var(--bg-editor);
}
.empty {
  padding: 1rem 1.5rem;
  color: var(--text-secondary);
}
.problem {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.path code {
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}
.statusbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  padding: 0.375rem 1rem;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.changes-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.save {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-inline-start: auto;
}
.exit-focus {
  position: fixed;
  inset-block-start: 0.75rem;
  inset-inline-end: 0.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
  opacity: 0.6;
}
.exit-focus:hover,
.exit-focus:focus-visible {
  opacity: 1;
}
.exit-focus:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>

<style>
/* Teleported into the shell's header band, so these cannot be scoped. */
.band-select,
.band-focus {
  height: 2rem;
  padding: 0 0.5rem;
  border: 1px solid var(--sec-on);
  border-radius: 0.375rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
}
.band-view {
  display: inline-flex;
}
.band-view button {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 2rem;
  padding: 0 0.5rem;
  border: 1px solid var(--sec-on);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.band-view button:first-child {
  border-start-start-radius: 0.375rem;
  border-end-start-radius: 0.375rem;
}
.band-view button:last-child {
  margin-inline-start: -1px;
  border-start-end-radius: 0.375rem;
  border-end-end-radius: 0.375rem;
}
.band-view button[aria-pressed='true'] {
  background: var(--section-write-on);
  color: var(--section-write);
}
.band-view button:focus-visible {
  position: relative;
  outline: 2px solid var(--section-write-on);
  outline-offset: 2px;
}
.band-select option {
  background: var(--bg-sheet);
  color: var(--text-primary);
}
.band-focus {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
}
.band-focus[aria-pressed='true'] {
  background: var(--section-write-on);
  color: var(--section-write);
}
/* Dim only the content (Quasar fades the whole disabled button): a faded border looks thinner. */
.band-select:disabled,
.band-focus:disabled {
  opacity: 1 !important;
  color: color-mix(in srgb, var(--sec-on) 60%, transparent);
  cursor: default;
}
.band-select:focus-visible,
.band-focus:focus-visible {
  outline: 2px solid var(--section-write-on);
  outline-offset: 2px;
}
</style>
