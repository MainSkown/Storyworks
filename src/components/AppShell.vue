<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { sectionByRouteName, sections, type AppSection } from '../sections'
import { useSettingsStore } from '../settings/store'
import { usePanelShortcut } from '../composables/panelShortcut'
import ContextPanel from './ContextPanel.vue'

const { t } = useI18n()
const route = useRoute()
const store = useSettingsStore()
const { settings } = storeToRefs(store)

const active = computed(() => sectionByRouteName(route.name) ?? sections[0]!)
const panelHidden = computed(() => settings.value.contextPanel.hidden)
const mainEl = ref<HTMLElement | null>(null)

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

function colorStyle(s: AppSection) {
  return { '--sec': `var(${s.colorVar})`, '--sec-on': `var(${s.onColorVar})` }
}
</script>

<template>
  <div class="shell" :class="{ 'panel-hidden': panelHidden }">
    <a class="skip-link" href="#main-content" @click.prevent="skipToContent">
      {{ t('a11y.skipToContent') }}
    </a>

    <div class="sidebar">
      <div class="book">
        <div class="book-title">{{ t('sidebar.noBook') }}</div>
        <div class="book-words">0 {{ t('sidebar.words') }}</div>
      </div>
      <nav class="nav" :aria-label="t('a11y.mainNavigation')">
        <template v-for="group in [mainSections, bottomSections]" :key="group[0]!.position">
          <ul class="nav-list" :class="{ bottom: group[0]!.position === 'bottom' }">
            <li v-for="s in group" :key="s.id" :style="colorStyle(s)">
              <RouterLink :to="{ name: s.routeName }" class="nav-link">
                <span class="icon-square" aria-hidden="true"><QIcon :name="s.icon" /></span>
                <span class="nav-label">{{ t(s.i18nKey) }}</span>
                <span v-if="s.id === 'checks'" class="badge-slot" />
              </RouterLink>
              <div v-if="s.id === active.id" class="expand">{{ t('sidebar.placeholder') }}</div>
            </li>
          </ul>
        </template>
      </nav>
    </div>

    <div class="main-column">
      <header class="band" :style="colorStyle(active)">
        <div class="band-title">
          <span class="band-section">{{ t(active.i18nKey) }}</span>
          <span class="band-sep" aria-hidden="true">·</span>
          <span class="band-item">
            <span aria-hidden="true">—</span>
            <span class="sr-only">{{ t('sidebar.openItemNone') }}</span>
          </span>
        </div>
        <div class="band-actions">
          <slot name="actions" />
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
      <main id="main-content" ref="mainEl" class="central" tabindex="-1">
        <RouterView />
      </main>
    </div>

    <ContextPanel v-if="!panelHidden" :section-id="active.id" />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 14.5rem minmax(0, 1fr) auto;
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
.badge-slot:empty {
  display: none;
}
.expand {
  margin: 0.25rem 0 0.5rem 2.625rem;
  padding-inline-start: 0.5rem;
  border-inline-start: 2px solid var(--sec);
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.main-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
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
}
.band-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.band-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid currentColor;
  border-radius: 0.375rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.band-button:focus-visible {
  outline-color: var(--sec-on);
}
.central {
  flex: 1;
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
