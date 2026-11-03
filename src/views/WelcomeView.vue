<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import NewProjectDialog from '../components/NewProjectDialog.vue'
import { listBrowserProjects } from '../project/io/browser'
import { createProjectIO } from '../project/io'
import { isTauri, pickFolder } from '../project/pickFolder'
import { useProjectStore } from '../project/store'
import { useSettingsStore } from '../settings/store'
import { installSample, SampleExistsError } from '../samples/install'
import { newSampleRoot } from '../samples/location'
import { MANIFEST_FILE } from '../project/migrations'
import { startTour } from '../tour/state'
import { defaultLang } from '../project/defaultNames'

const { t, locale } = useI18n()
const router = useRouter()
const store = useProjectStore()
const settings = useSettingsStore()

const newOpen = ref(false)
const browserOpen = ref(false)
const browserProjects = ref<string[]>([])
const sampleError = ref('')

// Also fires after the "open elsewhere" dialog is resolved.
watch(
  () => store.project,
  (p) => {
    if (p) void router.push({ name: 'write' })
  },
)

async function openPath(path: string): Promise<void> {
  browserOpen.value = false
  await store.open(path)
}

async function openProject(): Promise<void> {
  if (isTauri()) {
    const picked = await pickFolder()
    if (picked) await openPath(picked)
    return
  }
  browserProjects.value = listBrowserProjects()
  browserOpen.value = true
}

/** Copies the bundled sample (UI language) into a new folder (app data in the app), then opens the copy. */
async function openSample(): Promise<void> {
  sampleError.value = ''
  const root = await newSampleRoot(
    isTauri(),
    listBrowserProjects,
    (r) => createProjectIO(r).exists(MANIFEST_FILE),
  )
  try {
    await installSample(createProjectIO(root), defaultLang(locale.value))
    await store.open(root)
  } catch (e) {
    sampleError.value =
      e instanceof SampleExistsError
        ? t('welcome.sampleExists')
        : t('welcome.sampleFailed', { message: e instanceof Error ? e.message : String(e) })
  }
}

async function takeTour(): Promise<void> {
  if (!store.project) await openSample()
  if (store.project) startTour()
}
</script>

<template>
  <main class="welcome">
    <section class="card">
      <p class="app-name">{{ t('app.name') }}</p>
      <h1>{{ t('welcome.title') }}</h1>

      <div class="actions">
        <QBtn
          unelevated
          no-caps
          color="primary"
          icon="add"
          :label="t('welcome.newProject')"
          @click="newOpen = true"
        />
        <QBtn
          unelevated
          no-caps
          class="btn-secondary"
          icon="folder_open"
          :label="t('welcome.openProject')"
          @click="openProject"
        />
        <QBtn
          flat
          no-caps
          icon="auto_stories"
          :label="t('welcome.openSample')"
          @click="openSample"
        />
        <QBtn
          flat
          no-caps
          icon="tour"
          :label="t('welcome.takeTour')"
          @click="takeTour"
        />
      </div>
      <p v-if="sampleError" class="error" role="alert">{{ sampleError }}</p>

      <h2 id="recent-heading">{{ t('welcome.recent') }}</h2>
      <p v-if="settings.settings.recentProjects.length === 0" class="empty">
        {{ t('welcome.noRecent') }}
      </p>
      <ul v-else class="recent" aria-labelledby="recent-heading">
        <li v-for="r in settings.settings.recentProjects" :key="r.path">
          <button type="button" class="recent-open" @click="openPath(r.path)">
            <span class="recent-title">{{ r.title }}</span>
            <span class="recent-path">{{ r.path }}</span>
          </button>
          <QBtn
            flat
            round
            dense
            icon="close"
            :aria-label="t('welcome.removeRecent', { title: r.title })"
            @click="settings.removeRecentProject(r.path)"
          />
        </li>
      </ul>
    </section>

    <NewProjectDialog v-model="newOpen" />

    <QDialog v-model="browserOpen">
      <QCard class="browser-card" role="dialog" :aria-label="t('welcome.browserProjects')">
        <QCardSection>
          <h2>{{ t('welcome.browserProjects') }}</h2>
        </QCardSection>
        <QCardSection>
          <p v-if="browserProjects.length === 0" class="empty">
            {{ t('welcome.noBrowserProjects') }}
          </p>
          <ul v-else class="recent">
            <li v-for="name in browserProjects" :key="name">
              <button type="button" class="recent-open" @click="openPath(name)">
                <span class="recent-title">{{ name }}</span>
              </button>
            </li>
          </ul>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps :label="t('welcome.close')" @click="browserOpen = false" />
        </QCardActions>
      </QCard>
    </QDialog>
  </main>
</template>

<style scoped>
.welcome {
  min-height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 1rem;
  background: var(--bg-app);
  color: var(--text-primary);
}

.card {
  width: min(100%, 32rem);
  box-sizing: border-box;
  padding: 2rem;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
}

.app-name {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h1 {
  margin: 0.25rem 0 1.5rem;
  font-size: 1.75rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

h2 {
  margin: 2rem 0 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  font-size: 1rem;
}

.error {
  overflow-wrap: anywhere;
  margin: 0.75rem 0 0;
  color: var(--section-checks);
  font-size: 0.875rem;
}

.empty {
  margin: 0;
  color: var(--text-secondary);
}


.recent {
  margin: 0;
  padding: 0;
  list-style: none;
}

.recent li {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.recent-open {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 0.375rem;
  cursor: pointer;
}

.recent-open:hover {
  background: var(--bg-selected);
}

.recent-open:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.recent-title {
  font-weight: 600;
}

.recent-path {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.browser-card {
  width: min(100vw - 2rem, 24rem);
  background: var(--bg-raised);
  color: var(--text-primary);
}

.browser-card h2 {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 1.25rem;
}
</style>
