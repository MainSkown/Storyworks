<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { sectionByRouteName } from '../sections'

const { t } = useI18n()
const route = useRoute()
const section = computed(() => sectionByRouteName(route.name))
</script>

<template>
  <section class="page">
    <h1 v-if="section">{{ t(section.i18nKey) }}</h1>
    <p>{{ t('common.placeholderPage') }}</p>
  </section>
</template>

<style scoped>
.page {
  max-width: 37.5rem;
  margin-inline: auto;
  padding: 1.5rem;
}
</style>
