<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import FindingRow from '../components/FindingRow.vue'
import { useChecksStore } from '../checks/store'
import { groupBySeverity } from '../checks/group'
import type { Finding, FindingLocation } from '../checks/types'
import { openRule } from '../rules/openRule'
import { variablesOpen } from '../composables/variablesPanel'
import { openMechanic } from '../gamedoc/openMechanic'
import { useMechanicsStore } from '../gamedoc/mechanicsStore'
import { useProjectStore } from '../project/store'
import { findNode } from '../project/tree'
import { openTarget } from '../search/open'
import { useRulesStore } from '../rules/store'
import { jumpToBlock, jumpToEntry, jumpToNode, jumpToScene } from '../composables/useJump'

const { t, locale } = useI18n()
const checks = useChecksStore()
const rules = useRulesStore()
const project = useProjectStore()
const mechanics = useMechanicsStore()
const uid = useId()

const groups = computed(() => groupBySeverity(checks.visible))
const ignoredIds = computed(() => new Set(checks.ignoredFindings.map((f) => f.id)))
const lastRun = computed(() =>
  checks.ranAt === null
    ? t('checks.neverRun')
    : t('checks.lastRun', {
        time: new Date(checks.ranAt).toLocaleTimeString(locale.value, {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }),
)
const emptyText = computed(() => {
  if (checks.ranAt === null) return t('checks.emptyNever')
  if (checks.findings.length > 0 && !checks.showIgnored) return t('checks.emptyAllIgnored')
  return t('checks.empty')
})

const notify = (type: 'warning' | 'negative', message: string) =>
  Notify.create({ type, message, position: 'bottom', timeout: 5000 })

async function open(l: FindingLocation): Promise<void> {
  let ok = true
  if (l.kind === 'scene') {
    ok = l.blockId ? (await jumpToBlock(l.id, l.blockId)).ok : await jumpToScene(l.id)
  } else if (l.kind === 'node') {
    ok = !!l.timelineId && (await jumpToNode(l.timelineId, l.id)).ok
  } else if (l.kind === 'entry') {
    ok = await jumpToEntry(l.id)
  } else if (l.kind === 'rule') {
    ok = rules.rules.some((r) => r.id === l.id)
    if (ok) await openRule(l.id)
  } else if (l.kind === 'item') {
    const type = findNode(project.tree, l.id)?.type
    ok = type === 'conversation' || type === 'scene'
    if (type === 'conversation') await openTarget({ id: l.id, kind: 'conversation', nodeId: l.nodeId })
    else if (type === 'scene') ok = await jumpToScene(l.id)
  } else if (l.kind === 'mechanic') {
    ok = mechanics.mechanics.some((m) => m.id === l.id)
    if (ok) await openMechanic(l.id)
  } else if (l.kind === 'variable') {
    variablesOpen.value = true
    const { router } = await import('../router')
    await router.push({ name: 'write' })
  }
  if (!ok) notify('warning', t('checks.jumpFailed'))
}

function toggleIgnore(f: Finding): void {
  const ok = ignoredIds.value.has(f.id) ? checks.unignore(f.id) : checks.ignore(f.id)
  if (!ok) notify('negative', t('checks.ignoreFailed'))
}
</script>

<template>
  <section class="page">
    <header class="head">
      <h1 class="title">{{ t('checks.title') }}</h1>
      <QBtn
        unelevated
        no-caps
        icon="play_arrow"
        class="btn-section"
        :label="t('checks.run')"
        :loading="checks.running"
        :disable="checks.running"
        @click="checks.run()"
      >
        <template #loading>
          <QSpinner size="1rem" class="q-mr-sm" aria-hidden="true" />
          {{ t('checks.running') }}
        </template>
      </QBtn>
      <span class="last" role="status">{{ lastRun }}</span>
      <QToggle
        v-model="checks.showIgnored"
        class="show-ignored"
        :label="t('checks.showIgnored')"
      />
    </header>

    <QBanner v-if="checks.ignoredInvalid" rounded class="warn-banner" role="alert">
      <template #avatar><QIcon name="warning" aria-hidden="true" /></template>
      {{ t('checks.ignoredInvalid') }}
    </QBanner>

    <p v-if="!groups.length" class="empty" role="status">{{ emptyText }}</p>

    <section
      v-for="g in groups"
      :key="g.severity"
      class="group"
      :aria-labelledby="`${uid}-${g.severity}`"
    >
      <h2 :id="`${uid}-${g.severity}`" class="group-title" :class="`sev-${g.severity}`">
        {{ t(`checks.group.${g.severity}`) }}
        <span class="count">{{ g.items.length }}</span>
      </h2>
      <ul class="list" :aria-label="t(`checks.group.${g.severity}`)">
        <FindingRow
          v-for="f in g.items"
          :key="f.id"
          :finding="f"
          :ignored="ignoredIds.has(f.id)"
          @open="open"
          @toggle-ignore="toggleIgnore(f)"
        />
      </ul>
    </section>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 60rem;
  margin-inline: auto;
  padding: 1.25rem 1.5rem;
  color: var(--text-primary);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
.title {
  margin: 0;
  font-size: 1.15rem;
}
.btn-section {
  background: var(--section-checks);
  color: var(--section-checks-on);
}
.last {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.show-ignored {
  margin-inline-start: auto;
}
.empty {
  margin: 1rem 0;
  color: var(--text-secondary);
}
.group-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.group-title.sev-error {
  color: var(--section-checks);
}
.group-title.sev-warning {
  color: var(--section-timelines);
}
.group-title.sev-info {
  color: var(--section-write);
}
.count {
  padding: 0 0.5rem;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 0.75rem;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
