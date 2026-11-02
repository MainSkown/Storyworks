<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { sectionByRouteName, sections, type AppSection } from '../sections'
import { useSettingsStore } from '../settings/store'
import { usePanelShortcut } from '../composables/panelShortcut'
import { focusMode } from '../composables/focusMode'
import { useProjectStore } from '../project/store'
import { findNode } from '../project/tree'
import { useTimelinesStore } from '../timeline/store'
import { useChecksStore } from '../checks/store'
import ContextPanel from './ContextPanel.vue'
import InboxNoteEditor from './InboxNoteEditor.vue'
import InboxPanel from './InboxPanel.vue'
import OutlineTree from './OutlineTree.vue'
import ProjectBanners from './ProjectBanners.vue'
import TimelineSidebar from './timeline/TimelineSidebar.vue'
import TrashDialog from './TrashDialog.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const project = useProjectStore()
const store = useSettingsStore()
const timelines = useTimelinesStore()
const checks = useChecksStore()
const { settings } = storeToRefs(store)

const active = computed(() => sectionByRouteName(route.name) ?? sections[0]!)
const panelHidden = computed(() => settings.value.contextPanel.hidden)
const mainEl = ref<HTMLElement | null>(null)
const trashOpen = ref(false)

// The open item named in the header band (Write shows the selected tree item).
const openItem = computed(() => {
  if (active.value.id === 'timelines') return timelines.current?.name ?? null
  if (active.value.id !== 'write') return null
  if (project.openNoteId) {
    const note = project.inboxNotes.find((n) => n.id === project.openNoteId)
    return note?.title || t('inbox.untitled')
  }
  if (!project.selectedId) return null
  return findNode(project.tree, project.selectedId)?.title ?? null
})

// Picking a tree item replaces an open inbox note.
watch(
  () => project.selectedId,
  (id) => {
    if (id) project.openNoteId = null
  },
)

const statusIcon = computed(
  () => ({ saved: 'check_circle', saving: 'sync', error: 'error_outline' })[project.saveStatus],
)

const mainSections = sections.filter((s) => s.position === 'main')
const bottomSections = sections.filter((s) => s.position === 'bottom')

function togglePanel(): void {
  store.setContextPanelHidden(!panelHidden.value)
}
usePanelShortcut(togglePanel)

// A plain "#id" link would change the hash-router route.
function skipToContent(): void {
  mainEl.value?.focus()
}

async function closeProject(): Promise<void> {
  await project.close()
  await router.push({ name: 'welcome' })
}

function colorStyle(s: AppSection) {
  return { '--sec': `var(${s.colorVar})`, '--sec-on': `var(${s.onColorVar})` }
}
</script>

<template>
  <div class="shell" :class="{ 'panel-hidden': panelHidden, focus: focusMode }">
    <a class="skip-link" href="#main-content" @click.prevent="skipToContent">
      {{ t('a11y.skipToContent') }}
    </a>

    <div v-show="!focusMode" class="sidebar">
      <div class="book">
        <div class="book-title">
          {{ project.project?.manifest.title ?? t('sidebar.noProject') }}
        </div>
        <div class="book-words">{{ project.wordCounts.get('') ?? 0 }} {{ t('sidebar.words') }}</div>
        <div v-if="project.project" class="book-status" role="status" aria-live="polite">
          <QIcon :name="statusIcon" aria-hidden="true" />
          {{ t(`status.${project.saveStatus}`) }}
        </div>
        <QBtn
          v-if="project.project"
          flat
          dense
          no-caps
          icon="close"
          class="book-close"
          :label="t('project.closeProject')"
          @click="closeProject"
        />
      </div>
      <nav class="nav" :aria-label="t('a11y.mainNavigation')">
        <template v-for="group in [mainSections, bottomSections]" :key="group[0]!.position">
          <ul class="nav-list" :class="{ bottom: group[0]!.position === 'bottom' }">
            <li v-for="s in group" :key="s.id" :style="colorStyle(s)">
              <RouterLink
                :to="{ name: s.routeName }"
                class="nav-link"
                :class="{ 'router-link-active': s.id === active.id }"
              >
                <span class="icon-square" aria-hidden="true"><QIcon :name="s.icon" /></span>
                <span class="nav-label">{{ t(s.i18nKey) }}</span>
                <span
                  v-if="s.id === 'checks' && checks.badge > 0"
                  class="badge"
                  role="img"
                  :aria-label="t('checks.badge', checks.badge)"
                  >{{ checks.badge > 99 ? '99+' : checks.badge }}</span
                >
              </RouterLink>
              <div
                v-if="s.id === active.id && s.id === 'write' && project.project"
                class="expand tree"
              >
                <OutlineTree />
                <InboxPanel />
              </div>
              <div
                v-else-if="s.id === active.id && s.id === 'timelines' && project.project"
                class="expand tree"
              >
                <TimelineSidebar />
              </div>
              <div
                v-else-if="s.id === active.id && !['rules', 'codex', 'checks'].includes(s.id)"
                class="expand"
              >
                {{ t('sidebar.placeholder') }}
              </div>
            </li>
            <li v-if="group[0]!.position === 'bottom' && project.project" class="trash-item">
              <button type="button" class="nav-link" @click="trashOpen = true">
                <span class="icon-square trash-square" aria-hidden="true">
                  <QIcon name="restore_from_trash" />
                </span>
                <span class="nav-label">{{ t('sidebar.trash') }}</span>
              </button>
            </li>
          </ul>
        </template>
      </nav>
    </div>

    <div class="main-column">
      <header v-show="!focusMode" class="band" :style="colorStyle(active)">
        <div class="band-title">
          <span class="band-section">{{ t(active.i18nKey) }}</span>
          <span class="band-sep" aria-hidden="true">·</span>
          <span v-if="openItem" class="band-item">{{ openItem }}</span>
          <span v-else class="band-item">
            <span aria-hidden="true">—</span>
            <span class="sr-only">{{ t('sidebar.openItemNone') }}</span>
          </span>
        </div>
        <div class="band-actions">
          <div id="band-actions-target" class="band-actions"></div>
          <button
            type="button"
            class="band-button"
            :aria-pressed="!panelHidden"
            :aria-label="panelHidden ? t('contextPanel.show') : t('contextPanel.hide')"
            :title="`${panelHidden ? t('contextPanel.show') : t('contextPanel.hide')} (Ctrl+Alt+P)`"
            @click="togglePanel"
          >
            <QIcon name="view_sidebar" aria-hidden="true" />
          </button>
        </div>
      </header>
      <ProjectBanners />
      <main id="main-content" ref="mainEl" class="central" tabindex="-1">
        <InboxNoteEditor
          v-if="project.openNoteId && active.id === 'write'"
          :key="project.openNoteId"
          :note-id="project.openNoteId"
        />
        <RouterView v-else />
      </main>
    </div>

    <ContextPanel v-if="!panelHidden" v-show="!focusMode" :section-id="active.id" />
    <TrashDialog v-model="trashOpen" />
  </div>
</template>

<style scoped>
.shell.focus {
  grid-template-columns: minmax(0, 1fr);
}
.shell {
  display: grid;
  grid-template-columns: 14.5rem minmax(0, 1fr) auto;
  grid-template-rows: minmax(0, 1fr);
  height: 100vh;
  background: var(--bg-app);
  color: var(--text-primary);
}
.skip-link {
  position: absolute;
  inset-block-start: 0.5rem;
  inset-inline-start: 0.5rem;
  z-index: 1000;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  transform: translateY(-300%);
}
.skip-link:focus {
  transform: none;
}

.sidebar {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  border-inline-end: 1px solid var(--border);
  background: var(--bg-sidebar);
}
.book {
  padding: 1rem 0.875rem 0.75rem;
}
.book-title {
  font-weight: 700;
  font-size: 1rem;
}
.book-words {
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.book-status {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.book-close {
  margin-top: 0.25rem;
  margin-inline-start: -0.5rem;
  color: var(--text-secondary);
}
.nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0 0.5rem 0.75rem;
}
.nav-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.nav-list.bottom {
  margin-top: auto;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.375rem 0.5rem;
  border-radius: 0.375rem;
  color: var(--text-primary);
  text-decoration: none;
}
.nav-link:hover {
  background: var(--bg-selected);
}
.nav-link.router-link-active {
  background: var(--bg-selected);
  font-weight: 600;
}
.nav-link {
  width: 100%;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.trash-square {
  background: var(--text-secondary);
  color: var(--bg-sheet);
}
.icon-square {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  background: var(--sec);
  color: var(--sec-on);
  font-size: 1.125rem;
}
.nav-label {
  flex: 1;
}
.badge {
  min-width: 1.25rem;
  padding: 0 0.375rem;
  border-radius: 0.625rem;
  background: var(--section-checks);
  color: var(--section-checks-on);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.25rem;
  text-align: center;
}
.expand {
  margin: 0.25rem 0 0.5rem 2.625rem;
  padding-inline-start: 0.5rem;
  border-inline-start: 2px solid var(--sec);
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.expand.tree {
  margin-inline-start: 1.25rem;
  padding-inline-start: 0.375rem;
}

.main-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.band {
  position: relative;
  z-index: 11;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.25rem 1rem;
  min-height: 3rem;
  padding: 0.5rem 1rem;
  background: var(--sec);
  color: var(--sec-on);
}
.band-title {
  display: flex;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
}
.band-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.band-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--sec-on);
  border-radius: 0.375rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.band-button:focus-visible {
  outline-color: var(--sec-on);
}
/* Too narrow for a third column: the context panel floats over the editor instead. */
@media (max-width: 1100px) {
  .shell:not(.focus) :deep(.context-panel) {
    position: fixed;
    inset-block: 3rem 0;
    inset-inline-end: 0;
    z-index: 10;
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.2);
  }
}
.central {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  outline: none;
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
