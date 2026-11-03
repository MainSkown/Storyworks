<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { selectedBoxId, shownMap } from '../../storymap/selection'
import { useStoryItems } from '../../storymap/useItems'
import { useStoryMapStore } from '../../storymap/store'
import RouteChips from '../routes/RouteChips.vue'
import RouteTags from '../routes/RouteTags.vue'

/** Route tags of the selected item box (live items are editable). */
const { t } = useI18n()
const store = useStoryMapStore()
const { itemOf, routesOf } = useStoryItems()

const item = computed(() => {
  const b = (shownMap.value ?? store.map).boxes.find((x) => x.id === selectedBoxId.value)
  return b ? itemOf(b) : null
})
</script>

<template>
  <div class="routes">
    <RouteTags v-if="item && !item.trashed" :item-id="item.id" />
    <RouteChips v-else-if="item" :routes="routesOf(item.id)" />
    <p v-else class="note">{{ t('storymap.inspector.none') }}</p>
  </div>
</template>

<style scoped>
.routes {
  padding: 0 0.75rem 0.75rem;
}
.note {
  margin: 0.5rem 0 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
</style>
