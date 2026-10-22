<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '../project/store'

const { t } = useI18n()
const store = useProjectStore()
const { project, issues, readOnly, lockNote } = storeToRefs(store)

const missing = computed(() => issues.value.flatMap((i) => (i.kind === 'missing' ? [i] : [])))
const invalid = computed(() => issues.value.flatMap((i) => (i.kind === 'invalid' ? [i] : [])))
const unlisted = computed(() => issues.value.flatMap((i) => (i.kind === 'unlisted' ? [i] : [])))

const skipped = ref<{ path: string; reason: string }[]>([])
const importing = ref(false)
watch(project, () => (skipped.value = []))

async function importAll(): Promise<void> {
  importing.value = true
  try {
    const res = await store.importUnlisted(unlisted.value.map((i) => i.path))
    skipped.value = res.skipped
  } catch (e) {
    skipped.value = [{ path: '', reason: e instanceof Error ? e.message : String(e) }]
  } finally {
    importing.value = false
  }
}
function ignoreAll(): void {
  store.ignoreUnlisted(unlisted.value.map((i) => i.path))
}
</script>

<template>
  <div v-if="project" class="banners">
    <QBanner
      v-if="readOnly"
      dense
      class="banner warn-banner"
      role="status"
      data-testid="readonly-banner"
    >
      <template #avatar><QIcon name="lock" aria-hidden="true" /></template>
      <strong>{{ t('project.readOnly.title') }}</strong>
      {{ t(`project.readOnly.reason.${readOnly.reason}`) }}
    </QBanner>

    <QBanner
      v-if="lockNote === 'lost'"
      dense
      class="banner warn-banner"
      role="alert"
      data-testid="lock-lost-banner"
    >
      <template #avatar><QIcon name="warning" aria-hidden="true" /></template>
      {{ t('project.lockLost') }}
    </QBanner>

    <QBanner
      v-if="missing.length"
      dense
      class="banner warn-banner"
      role="status"
      data-testid="missing-banner"
    >
      <template #avatar><QIcon name="report_problem" aria-hidden="true" /></template>
      <strong>{{ t('project.missing.title', { n: missing.length }) }}</strong>
      {{ t('project.missing.hint') }}
      <ul class="file-list">
        <li v-for="i in missing" :key="i.path">
          <code>{{ i.path }}</code>
        </li>
      </ul>
    </QBanner>

    <QBanner
      v-if="invalid.length"
      dense
      class="banner warn-banner"
      role="status"
      data-testid="invalid-banner"
    >
      <template #avatar><QIcon name="error_outline" aria-hidden="true" /></template>
      <strong>{{ t('project.invalid.title', { n: invalid.length }) }}</strong>
      {{ t('project.invalid.hint') }}
      <ul class="file-list">
        <li v-for="i in invalid" :key="i.path">
          <code>{{ i.path }}</code>
          <span v-if="i.error.field">
            {{ t('project.field') }}: <code>{{ i.error.field }}</code>
          </span>
          <span>{{ i.error.message }}</span>
        </li>
      </ul>
    </QBanner>

    <QBanner
      v-if="unlisted.length"
      dense
      class="banner warn-banner"
      role="status"
      data-testid="unlisted-banner"
    >
      <template #avatar><QIcon name="note_add" aria-hidden="true" /></template>
      <strong>{{ t('project.unlisted.title', { n: unlisted.length }) }}</strong>
      {{ readOnly ? t('project.unlisted.hintReadOnly') : t('project.unlisted.hint') }}
      <ul class="file-list">
        <li v-for="i in unlisted" :key="i.path">
          <code>{{ i.path }}</code>
        </li>
      </ul>
      <template #action>
        <QBtn
          v-if="!readOnly"
          flat
          no-caps
          :loading="importing"
          :label="t('project.unlisted.import')"
          @click="importAll"
        />
        <QBtn flat no-caps :label="t('project.unlisted.ignore')" @click="ignoreAll" />
      </template>
    </QBanner>

    <QBanner
      v-if="skipped.length"
      dense
      class="banner warn-banner"
      role="alert"
      data-testid="skipped-banner"
    >
      <template #avatar><QIcon name="info" aria-hidden="true" /></template>
      <strong>{{ t('project.unlisted.skipped', { n: skipped.length }) }}</strong>
      <ul class="file-list">
        <li v-for="s in skipped" :key="s.path + s.reason">
          <code v-if="s.path">{{ s.path }}</code>
          <span>{{ s.reason }}</span>
        </li>
      </ul>
      <template #action>
        <QBtn flat no-caps :label="t('settings.dismiss')" @click="skipped = []" />
      </template>
    </QBanner>
  </div>
</template>

<style scoped>
.banners {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 1rem 0;
}
.banner {
  max-height: 14rem;
  overflow-y: auto;
}
.file-list {
  margin: 0.25rem 0 0;
  padding-inline-start: 1.25rem;
  font-size: 0.8125rem;
}
.file-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
}
.file-list code {
  font-family: ui-monospace, monospace;
}
</style>
