<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CHECK_SEVERITY, checkKind, checksForKind, type CheckId, type Severity } from '../checks/types'
import { useChecksStore } from '../checks/store'
import { useProjectStore } from '../project/store'

const { t } = useI18n()
const projectStore = useProjectStore()
const checks = useChecksStore()

const SEVERITIES: Severity[] = ['error', 'warning', 'info']

const readOnly = computed(() => !!projectStore.readOnly)
const groups = computed(() => {
  const ids = checksForKind(checkKind(projectStore.project?.manifest.kind))
  return SEVERITIES.map((severity) => ({
    severity,
    ids: ids.filter((id) => CHECK_SEVERITY[id] === severity),
  })).filter((g) => g.ids.length)
})

function toggle(id: CheckId, enabled: boolean): void {
  projectStore.setCheckEnabled(id, enabled)
  void checks.run()
}
</script>

<template>
  <div v-if="projectStore.project" class="group" role="group" aria-labelledby="set-checks">
    <h2 id="set-checks">{{ t('settings.checks.title') }}</h2>
    <p class="hint">{{ t('settings.checks.hint') }}</p>
    <p v-if="readOnly" class="hint">{{ t('settings.checks.readOnly') }}</p>
    <section v-for="g in groups" :key="g.severity" class="sev">
      <h3 :id="`set-checks-${g.severity}`">{{ t(`settings.checks.${g.severity}`) }}</h3>
      <ul role="group" :aria-labelledby="`set-checks-${g.severity}`">
        <li v-for="id in g.ids" :key="id">
          <QToggle
            :model-value="projectStore.isCheckEnabled(id)"
            :disable="readOnly"
            :label="t(`checks.name.${id}`)"
            color="primary"
            @update:model-value="toggle(id, $event)"
          />
          <p class="desc">{{ t(`checks.desc.${id}`) }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.group {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.group h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
}
.hint {
  margin: 0 0 0.5rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.sev h3 {
  margin: 1rem 0 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  margin-bottom: 0.5rem;
}
.desc {
  margin: 0;
  padding-inline-start: 3.5rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
</style>
