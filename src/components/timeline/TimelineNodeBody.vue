<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '../../calendar'
import type { GraphNodeModel } from '../graph/types'
import type { TimelineNode } from '../../timeline/schema'
import { useTimelinesStore } from '../../timeline/store'

const props = defineProps<{ node: GraphNodeModel<TimelineNode> }>()
const { t } = useI18n()
const store = useTimelinesStore()

const data = computed(() => props.node.data)
const branch = computed(() => store.current?.branches.find((b) => b.id === data.value?.branchId))
const invalid = computed(() => store.invalidDates.get(props.node.id))
const dateText = computed(() =>
  data.value?.date ? formatDate(store.calendar, data.value.date) : '',
)
const accent = computed(() => data.value?.color ?? branch.value?.color ?? 'var(--tag-event)')
</script>

<template>
  <div class="body">
    <div class="title">{{ node.label }}</div>
    <div v-if="dateText || data?.tag" class="meta">
      <span
        v-if="invalid"
        class="warn"
        role="img"
        :aria-label="t('timelineView.invalidDate')"
        :title="t('timelineView.invalidDate')"
      >
        <QIcon name="warning_amber" size="1rem" />
      </span>
      <span v-if="dateText" class="date">{{ dateText }}</span>
      <span v-if="data?.tag" class="chip" :style="{ borderColor: accent }">{{ data.tag }}</span>
    </div>
    <div v-if="branch" class="branch">
      <span
        class="line"
        :class="{ dashed: branch.dashed }"
        :style="{ borderColor: branch.color }"
      />
      {{ t('timelineView.branch', { name: branch.name }) }}
    </div>
  </div>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  text-align: start;
}
.title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta,
.branch {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.75rem;
  white-space: nowrap;
}
.date {
  overflow: hidden;
  text-overflow: ellipsis;
}
.warn {
  display: inline-flex;
  color: var(--tag-problem);
}
.chip {
  padding: 0 0.375rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-primary);
  font-size: 0.6875rem;
}
.line {
  display: inline-block;
  width: 1.25rem;
  border-top: 2px solid var(--border-strong);
}
.line.dashed {
  border-top-style: dashed;
}
</style>
