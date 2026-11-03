import { watch } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import AppShell from './components/AppShell.vue'
import CodexView from './views/CodexView.vue'
import ChecksView from './views/ChecksView.vue'
import KnowledgeView from './views/KnowledgeView.vue'
import KnowledgeMatrixView from './views/KnowledgeMatrixView.vue'
import RelationshipsView from './views/RelationshipsView.vue'
import RulesView from './views/RulesView.vue'
import TimelinesView from './views/TimelinesView.vue'
import ExportView from './views/ExportView.vue'
import HistoryView from './views/HistoryView.vue'
import SettingsView from './views/SettingsView.vue'
import StatsView from './views/StatsView.vue'
import WelcomeView from './views/WelcomeView.vue'
import WriteView from './views/WriteView.vue'
import { useProjectStore } from './project/store'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'welcome', component: WelcomeView },
    {
      path: '/app',
      component: AppShell,
      redirect: { name: 'write' },
      children: [
        { path: 'write', name: 'write', component: WriteView },
        { path: 'timelines', name: 'timelines', component: TimelinesView },
        { path: 'rules', name: 'rules', component: RulesView },
        { path: 'codex', name: 'codex', component: CodexView },
        { path: 'codex/relationships', name: 'relationships', component: RelationshipsView },
        { path: 'codex/knowledge', name: 'knowledge', component: KnowledgeView },
        { path: 'codex/knowledge-matrix', name: 'knowledge-matrix', component: KnowledgeMatrixView },
        { path: 'checks', name: 'checks', component: ChecksView },
        { path: 'stats', name: 'stats', component: StatsView },
        { path: 'history', name: 'history', component: HistoryView },
        { path: 'export', name: 'export', component: ExportView },
        { path: 'settings', name: 'settings', component: SettingsView },
      ],
    },
  ],
})

let watching = false

// /app/* needs an open project; closing it while in /app goes back to welcome.
router.beforeEach((to) => {
  const store = useProjectStore()
  if (!watching) {
    watching = true
    watch(
      () => store.project,
      (p) => {
        if (!p && router.currentRoute.value.path.startsWith('/app')) {
          void router.replace({ name: 'welcome' })
        }
      },
    )
  }
  if (to.path.startsWith('/app') && !store.project) return { name: 'welcome' }
})
