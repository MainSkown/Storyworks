<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { BOX_ICON, kindOf, type BoxData } from '../../storymap/boxData'
import RouteChips from '../routes/RouteChips.vue'

const props = defineProps<{ data: BoxData }>()
const { t } = useI18n()

const kind = computed(() => kindOf(props.data))
const title = computed(() => {
  const b = props.data.box
  if (b.kind === 'beat') return b.text.trim() || t('storymap.emptyBeat')
  return props.data.item?.title || t('storymap.badge.deleted')
})
const broken = computed(() => props.data.state === 'trashed' || props.data.state === 'deleted')
</script>

<template>
  <div class="body" :class="{ broken }">
    <div class="head">
      <QIcon :name="BOX_ICON[kind]" size="1rem" aria-hidden="true" />
      <span class="kind">{{ t(`storymap.kind.${kind}`) }}</span>
      <span v-if="data.box.start" class="chip start">
        <QIcon name="flag" size="0.75rem" aria-hidden="true" />{{ t('game.conversation.start') }}
      </span>
      <span v-if="broken" class="chip warn">
        <QIcon name="link_off" size="0.75rem" aria-hidden="true" />{{
          t(data.state === 'trashed' ? 'storymap.badge.trash' : 'storymap.badge.deleted')
        }}
      </span>
    </div>
    <div class="title" :class="{ beat: data.box.kind === 'beat' }">{{ title }}</div>
    <RouteChips :routes="data.routes" />
  </div>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.kind {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.title {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.title.beat {
  font-weight: 400;
  font-style: italic;
}
.broken .title {
  text-decoration: line-through;
  text-decoration-color: var(--section-checks);
}
.chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.125rem;
  padding: 0 0.3rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-primary);
  font-size: 0.6875rem;
  font-weight: 700;
}
.chip.start {
  border-color: var(--section-storymap);
  color: var(--section-storymap);
}
.chip.warn {
  border-color: var(--section-checks);
  color: var(--section-checks);
}
</style>
