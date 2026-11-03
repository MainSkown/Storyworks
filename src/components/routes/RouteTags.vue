<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { listRoutes, resolveRoute, routeLabel, sameRoute, toggleRoute } from '../../game/routes'
import type { RouteRef } from '../../project/schemas/route'
import { useProjectStore } from '../../project/store'
import { findNode } from '../../project/tree'
import { useTimelinesStore } from '../../timeline/store'
import RouteChips from './RouteChips.vue'

/** Tag a script or conversation with routes (timeline branches). */
const props = defineProps<{ itemId: string }>()
const { t } = useI18n()
const store = useProjectStore()
const tl = useTimelinesStore()

const tags = computed(() => findNode(store.tree, props.itemId)?.routes ?? [])
const all = computed(() => listRoutes(tl.loadedTimelines))
const brokenRefs = computed(() => tags.value.filter((r) => !resolveRoute(r, tl.loadedTimelines)))

function toggle(ref: RouteRef): void {
  if (!store.readOnly) store.setItemRoutes(props.itemId, toggleRoute(tags.value, ref))
}
</script>

<template>
  <div class="route-tags">
    <h4 class="label heading">{{ t('routes.title') }}</h4>
    <p v-if="!all.length && !tags.length" class="hint">{{ t('routes.none') }}</p>
    <ul class="list">
      <li v-for="r in all" :key="`${r.ref.timelineId}/${r.ref.branchId}`">
        <label class="row">
          <input
            type="checkbox"
            :checked="tags.some((x) => sameRoute(x, r.ref))"
            :disabled="!!store.readOnly"
            @change="toggle(r.ref)"
          />
          {{ routeLabel(r, all) }}
        </label>
      </li>
    </ul>
    <template v-if="brokenRefs.length">
      <p class="hint">{{ t('routes.brokenHint') }}</p>
      <ul class="list">
        <li v-for="r in brokenRefs" :key="`${r.timelineId}/${r.branchId}`" class="row">
          <RouteChips :routes="[r]" />
          <button type="button" class="link-btn" :disabled="!!store.readOnly" @click="toggle(r)">
            {{ t('routes.remove') }}
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.heading {
  margin: 0.75rem 0 0.25rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}
.hint {
  margin: 0.25rem 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.75rem;
}
.link-btn {
  border: 0;
  background: none;
  color: var(--text-secondary);
  text-decoration: underline;
  cursor: pointer;
}
</style>
