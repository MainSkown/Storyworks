<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ListEntry } from '../../relations/store'

defineProps<{ items: ListEntry[]; heading: string }>()
const { t } = useI18n()

const errorText = (e: ListEntry) =>
  e.error ? `${e.error.field ? `${e.error.field}: ` : ''}${e.error.message}` : ''
</script>

<template>
  <div v-if="items.length" class="invalid-box">
    <h3 class="head">{{ heading }}</h3>
    <ul class="list">
      <li v-for="e in items" :key="e.id" class="invalid">
        <QIcon name="error_outline" size="1rem" aria-hidden="true" />
        <div>
          <span class="name">{{ e.title || e.id }}</span>
          <span class="meta">
            {{ e.status === 'missing' ? t('relations.invalid.missing') : t('relations.invalid.invalid') }}
          </span>
          <span v-if="errorText(e)" class="meta">{{ errorText(e) }}</span>
        </div>
      </li>
    </ul>
    <p class="meta">{{ t('relations.invalid.hint') }}</p>
  </div>
</template>

<style scoped>
.invalid-box {
  margin-top: 0.75rem;
}
.head {
  margin: 0 0 0.25rem;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--section-checks);
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.invalid {
  display: flex;
  gap: 0.375rem;
  padding: 0.25rem 0;
  color: var(--section-checks);
}
.name {
  display: block;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.meta {
  display: block;
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  overflow-wrap: anywhere;
}
</style>
