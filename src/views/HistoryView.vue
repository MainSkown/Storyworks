<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import HistoryBackups from '../components/history/HistoryBackups.vue'
import HistoryChanges from '../components/history/HistoryChanges.vue'
import HistoryLog from '../components/history/HistoryLog.vue'
import { describeError } from '../history/errorText'
import { useHistoryStore } from '../history/store'
import { useProjectStore } from '../project/store'

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const history = useHistoryStore()
const project = useProjectStore()

const TABS = ['changes', 'history', 'backups'] as const
type Tab = (typeof TABS)[number]
const fromRoute = (): Tab => (TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'changes')
const tab = ref<Tab>(fromRoute())

watch(() => route.query.tab, () => (tab.value = fromRoute()))
watch(tab, (v) => {
  if (route.query.tab !== v) void router.replace({ name: 'history', query: { tab: v } })
})

onMounted(() => {
  void history.refresh()
  void history.refreshBackups()
})

const readOnly = computed(() => !!project.readOnly)
const broken = computed(() => history.error !== null)
const brokenText = computed(() =>
  history.error?.code === 'manifest' ? t('history.broken.manifest') : t('history.broken.body'),
)
const problem = ref('')
async function startNew(): Promise<void> {
  problem.value = ''
  try {
    await history.startNewHistory()
  } catch (e) {
    problem.value = describeError(e, (k) => t(k), (k) => te(k))
  }
}
</script>

<template>
  <section class="page">
    <h1 class="title">{{ t('history.title') }}</h1>
    <p class="intro">{{ t('history.intro') }}</p>
    <p v-if="readOnly" class="intro" role="status">{{ t('history.readOnly') }}</p>

    <div v-if="broken" class="broken" role="alert">
      <strong>{{ history.error?.code === 'manifest' ? t('history.broken.manifest') : t('history.broken.title') }}</strong>
      <p v-if="history.error?.code !== 'manifest'">{{ brokenText }}</p>
      <QBtn
        v-if="history.error?.code !== 'manifest'"
        outline
        no-caps
        :label="t('history.broken.start')"
        :disable="readOnly || history.busy"
        @click="startNew"
      />
      <p v-if="problem" class="err">{{ problem }}</p>
    </div>

    <QTabs
      v-model="tab"
      dense
      no-caps
      align="left"
      active-color="accent"
      indicator-color="accent"
      class="tabs"
      :aria-label="t('history.title')"
    >
      <QTab name="changes" :label="t('history.tabs.changes')" />
      <QTab name="history" :label="t('history.tabs.history')" />
      <QTab name="backups" :label="t('history.tabs.backups')" />
    </QTabs>

    <div class="panel" role="tabpanel">
      <HistoryBackups v-if="tab === 'backups'" />
      <template v-else-if="!broken">
        <HistoryChanges v-if="tab === 'changes'" />
        <HistoryLog v-else />
      </template>
    </div>
  </section>
</template>

<style scoped>
.page {
  max-width: 64rem;
  margin-inline: auto;
  padding: 1.25rem 1.5rem;
  color: var(--text-primary);
}
.title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}
.intro {
  margin: 0 0 0.75rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.broken {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--section-checks);
  border-radius: 8px;
  background: var(--bg-sheet);
}
.broken p {
  margin: 0;
}
.tabs {
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
}
</style>
