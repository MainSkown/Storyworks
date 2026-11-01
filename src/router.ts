import { watch } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import AppShell from './components/AppShell.vue'
import SectionPlaceholder from './views/SectionPlaceholder.vue'
import CodexView from './views/CodexView.vue'
import RulesView from './views/RulesView.vue'
import TimelinesView from './views/TimelinesView.vue'
import SettingsView from './views/SettingsView.vue'
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
        { path: 'checks', name: 'checks', component: SectionPlaceholder },
        { path: 'stats', name: 'stats', component: SectionPlaceholder },
        { path: 'history', name: 'history', component: SectionPlaceholder },
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
