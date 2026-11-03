<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { brokenLinks } from '../../game/mechanicLinks'
import { useLinkContext } from '../../gamedoc/linkContext'
import { useMechanicsStore } from '../../gamedoc/mechanicsStore'

const { t } = useI18n()
const store = useMechanicsStore()
const ctx = useLinkContext()
const m = computed(() => store.selected)
const category = computed(() => store.categories.find((c) => c.id === m.value?.categoryId)?.name ?? '')
const broken = computed(() => (m.value ? brokenLinks(m.value, ctx.value).length : 0))
</script>

<template>
  <p v-if="!m" class="note">{{ t('gamedoc.links.noneSelected') }}</p>
  <dl v-else class="facts" data-testid="mechanic-facts">
    <dt>{{ t('gamedoc.mechanicsTab.fields.title') }}</dt>
    <dd>{{ m.title.trim() || t('gamedoc.links.untitledMechanic') }}</dd>
    <dt>{{ t('gamedoc.mechanicsTab.fields.category') }}</dt>
    <dd>{{ category || t('gamedoc.links.noCategory') }}</dd>
    <dt>{{ t('gamedoc.mechanicsTab.fields.status') }}</dt>
    <dd>{{ t(`gamedoc.mechanicsTab.status.${m.status}`) }}</dd>
    <dt>{{ t('gamedoc.links.title') }}</dt>
    <dd>{{ m.links.length }}</dd>
    <dt>{{ t('gamedoc.links.brokenCount') }}</dt>
    <dd>{{ broken }}</dd>
  </dl>
</template>

<style scoped>
.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 0.75rem;
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
}
dt {
  color: var(--text-secondary);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.note {
  margin: 0;
  padding: 0.5rem 0.75rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
</style>
