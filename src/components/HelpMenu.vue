<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { helpItems } from './helpItems'

const { t } = useI18n()
</script>

<template>
  <button type="button" class="help-btn" aria-haspopup="menu">
    <span class="help-square" aria-hidden="true"><QIcon name="help_outline" /></span>
    <span class="help-label">{{ t('help.title') }}</span>
    <QMenu anchor="top right" self="bottom left" auto-close>
      <QList role="menu" class="help-list">
        <QItem v-for="item in helpItems" :key="item.id" clickable role="menuitem" @click="item.run()">
          <QItemSection avatar><QIcon :name="item.icon" aria-hidden="true" /></QItemSection>
          <QItemSection>{{ t(item.labelKey) }}</QItemSection>
        </QItem>
      </QList>
    </QMenu>
  </button>
</template>

<style scoped>
.help-btn {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.help-btn:hover {
  background: var(--bg-selected);
}
.help-square {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  background: var(--text-secondary);
  color: var(--bg-sheet);
  font-size: 1.125rem;
}
.help-label {
  flex: 1;
}
.help-list {
  min-width: 11rem;
}
</style>
