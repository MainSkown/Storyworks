<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { setLanguage } from './i18n'
import { useSettingsStore } from './settings/store'
import { useTheme } from './theme/useTheme'

const { t } = useI18n()
const { settings, loadError } = storeToRefs(useSettingsStore())

useTheme({
  theme: computed(() => settings.value.theme),
  uiZoom: computed(() => settings.value.uiZoom),
  editorFontSize: computed(() => settings.value.editorFontSize),
})
watch(() => settings.value.language, setLanguage)
const dismissed = ref(false)
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
</template>

<style scoped>
.load-error {
  position: fixed;
  inset: 0.5rem 0.5rem auto auto;
  z-index: 1000;
  max-width: 26rem;
}
</style>
