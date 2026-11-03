<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { setLanguage } from './i18n'
import { useSettingsStore } from './settings/store'
import { useTheme } from './theme/useTheme'
import { useProjectStore } from './project/store'
import { isTauri } from './project/pickFolder'
import ProjectDialogs from './components/ProjectDialogs.vue'
import CrashRecoveryDialog from './components/CrashRecoveryDialog.vue'
import { endSafety, rememberBook } from './safety/runtime'

const { t } = useI18n()
const { settings, loadError } = storeToRefs(useSettingsStore())

useTheme({
  theme: computed(() => settings.value.theme),
  uiZoom: computed(() => settings.value.uiZoom),
  editorFontSize: computed(() => settings.value.editorFontSize),
})
watch(() => settings.value.language, setLanguage, { immediate: true })
const dismissed = ref(false)

// Release the lock and flush pending saves before the window goes away.
const project = useProjectStore()
watch(
  () => project.rootPath,
  (path) => path && rememberBook(path),
)
let unlistenClose: (() => void) | undefined
let disposed = false
onMounted(async () => {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  const un = await win.onCloseRequested(async (event) => {
    event.preventDefault()
    try {
      await project.close()
    } finally {
      await endSafety().catch(() => {})
      await win.destroy()
    }
  })
  if (disposed) un()
  else unlistenClose = un
})
onBeforeUnmount(() => {
  disposed = true
  unlistenClose?.()
})
</script>

<template>
  <QBanner v-if="loadError && !dismissed" rounded class="load-error warn-banner" role="alert">
    {{ loadError.kind === 'newer-version' ? t('settings.readOnlyNewer') : t('settings.loadError') }}
    <template #action>
      <QBtn
        flat
        dense
        round
        icon="close"
        :aria-label="t('settings.dismiss')"
        @click="dismissed = true"
      />
    </template>
  </QBanner>
  <RouterView />
  <ProjectDialogs />
  <CrashRecoveryDialog />
</template>

<style scoped>
.load-error {
  position: fixed;
  inset: 0.5rem 0.5rem auto auto;
  z-index: 1000;
  max-width: 26rem;
}
</style>
