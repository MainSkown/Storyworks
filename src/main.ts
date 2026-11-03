import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Quasar, Dark, Notify } from 'quasar'
import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/dist/quasar.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/quasar-overrides.css'
import App from './App.vue'
import { router } from './router'
import { i18n, setLanguage } from './i18n'
import { useSettingsStore } from './settings/store'
import { useChecksStore } from './checks/store'
import { initSafety } from './safety/runtime'

const pinia = createPinia()
const settings = useSettingsStore(pinia)
await settings.load()
setLanguage(settings.settings.language)
await initSafety()
useChecksStore(pinia) // runs the checks whenever a book finishes opening

createApp(App)
  .use(pinia)
  .use(router)
  .use(i18n)
  .use(Quasar, { plugins: { Dark, Notify }, config: { dark: false } })
  .mount('#app')
