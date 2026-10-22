<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../settings/store'

const props = withDefaults(defineProps<{ id: string; title: string; count?: number }>(), {
  count: 0,
})

const { t } = useI18n()
const settings = useSettingsStore()
const uid = useId()
const bodyId = `${uid}-body`
const expanded = computed(() => !settings.isCollapsed(props.id))
</script>

<template>
  <section class="collapsible">
    <h3 class="heading">
      <button
        type="button"
        class="toggle"
        :aria-expanded="expanded"
        :aria-controls="bodyId"
        :title="expanded ? t('contextPanel.collapse') : t('contextPanel.expand')"
        @click="settings.toggleSection(id)"
      >
        <QIcon
          class="chevron"
          :name="expanded ? 'expand_more' : 'chevron_right'"
          aria-hidden="true"
        />
        <span class="title">{{ title }}</span>
        <span class="count">{{ count }}</span>
      </button>
    </h3>
    <div v-show="expanded" :id="bodyId" class="body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.collapsible {
  border-bottom: 1px solid var(--border);
}
.heading {
  margin: 0;
  font-size: inherit;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
}
.toggle:hover {
  background: var(--bg-selected);
}
.chevron {
  font-size: 1.125rem;
  color: var(--text-secondary);
}
.title {
  flex: 1;
}
.count {
  min-width: 1.25rem;
  padding: 0 0.375rem;
  border-radius: 0.625rem;
  background: var(--bg-selected);
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
}
.body {
  padding: 0 0.75rem 0.75rem;
  color: var(--text-secondary);
}
</style>
