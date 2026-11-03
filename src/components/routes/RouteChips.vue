<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { listRoutes, resolveRoute, routeLabel } from '../../game/routes'
import type { RouteRef } from '../../project/schemas/route'
import { useTimelinesStore } from '../../timeline/store'

const props = defineProps<{ routes: readonly RouteRef[] | undefined }>()
const { t } = useI18n()
const tl = useTimelinesStore()

const all = computed(() => listRoutes(tl.loadedTimelines))
const chips = computed(() =>
  (props.routes ?? []).map((ref) => {
    const info = resolveRoute(ref, tl.loadedTimelines)
    return {
      key: `${ref.timelineId}/${ref.branchId}`,
      broken: !info,
      label: info ? routeLabel(info, all.value) : t('routes.deleted'),
    }
  }),
)
</script>

<template>
  <ul v-if="chips.length" class="route-chips" :aria-label="t('routes.title')">
    <li v-for="c in chips" :key="c.key" class="chip" :class="{ broken: c.broken }">
      <QIcon :name="c.broken ? 'link_off' : 'alt_route'" size="0.875rem" aria-hidden="true" />
      {{ c.label }}
    </li>
  </ul>
</template>

<style scoped>
.route-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  white-space: nowrap;
}
.chip.broken {
  border-color: var(--tag-problem);
  color: var(--tag-problem);
  font-weight: 600;
}
</style>
