<script setup lang="ts">
import { useI18n } from 'vue-i18n'

export interface GutterMarker {
  id: string
  top: number
  count: number
  broken: boolean
}

defineProps<{ markers: GutterMarker[]; expanded: string | null }>()
const emit = defineEmits<{ open: [blockId: string, el: HTMLElement] }>()
const { t } = useI18n()
</script>

<template>
  <div class="gutter">
    <button
      v-for="m in markers"
      :key="m.id"
      type="button"
      class="marker"
      :class="{ broken: m.broken }"
      :data-marker-block="m.id"
      :style="{ top: `${m.top}px` }"
      aria-haspopup="dialog"
      :aria-expanded="expanded === m.id"
      :aria-label="m.broken ? t('eventLink.marker.broken', m.count) : t('eventLink.marker.linked', m.count)"
      :title="m.broken ? t('eventLink.marker.broken', m.count) : t('eventLink.marker.linked', m.count)"
      @mousedown.prevent
      @click="emit('open', m.id, $event.currentTarget as HTMLElement)"
    >
      <svg v-if="!m.broken" class="shape" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 1 L19 10 L10 19 L1 10 Z" />
      </svg>
      <svg v-else class="shape" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2 L19 18 L1 18 Z" />
        <text x="10" y="16" text-anchor="middle">!</text>
      </svg>
      <span class="count" aria-hidden="true">{{ m.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.gutter {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.marker {
  position: absolute;
  left: 0.625rem;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  height: 1.5rem;
  padding: 0 0.125rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
}
.marker:hover {
  background: var(--bg-selected);
}
.marker:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.shape {
  width: 1.125rem;
  height: 1.125rem;
  fill: var(--tag-event);
}
.broken .shape {
  fill: var(--tag-problem);
}
.shape text {
  fill: var(--tag-problem-on);
  font-size: 12px;
  font-weight: 700;
}
.count {
  min-width: 0.875rem;
  margin-inline-start: 0.125rem;
  color: var(--text-secondary);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1;
}
</style>
