import { createRouter, createWebHashHistory } from 'vue-router'
import AppShell from './components/AppShell.vue'
import SectionPlaceholder from './views/SectionPlaceholder.vue'
import SettingsView from './views/SettingsView.vue'
import WelcomeView from './views/WelcomeView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'welcome', component: WelcomeView },
    {
      path: '/app',
      component: AppShell,
      redirect: { name: 'write' },
      children: [
        { path: 'write', name: 'write', component: SectionPlaceholder },
        { path: 'timelines', name: 'timelines', component: SectionPlaceholder },
        { path: 'rules', name: 'rules', component: SectionPlaceholder },
        { path: 'codex', name: 'codex', component: SectionPlaceholder },
        { path: 'checks', name: 'checks', component: SectionPlaceholder },
        { path: 'stats', name: 'stats', component: SectionPlaceholder },
        { path: 'history', name: 'history', component: SectionPlaceholder },
        { path: 'settings', name: 'settings', component: SettingsView },
      ],
    },
  ],
})
