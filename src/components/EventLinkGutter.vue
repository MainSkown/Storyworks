<script setup lang="ts">
import { useI18n } from 'vue-i18n'

export interface GutterMarker {
  id: string
  top: number
  count: number
  broken: boolean
  /** Per kind; absent = all event links. */
  events?: number
  entries?: number
  knowledge?: number
}

defineProps<{ markers: GutterMarker[]; expanded: string | null }>()
const emit = defineEmits<{ open: [blockId: string, el: HTMLElement] }>()
const { t } = useI18n()

const entriesOf = (m: GutterMarker) => m.entries ?? 0
const knowledgeOf = (m: GutterMarker) => m.knowledge ?? 0
const eventsOf = (m: GutterMarker) => m.events ?? m.count - entriesOf(m) - knowledgeOf(m)

function kindOf(m: GutterMarker): string {
  if (m.broken) return 'broken'
  const kinds = [eventsOf(m), entriesOf(m), knowledgeOf(m)].filter((n) => n > 0).length
  if (kinds > 1) return 'mixed'
  return entriesOf(m) > 0 ? 'codex' : knowledgeOf(m) > 0 ? 'knowledge' : 'event'
}

function label(m: GutterMarker): string {
  if (m.broken) return t('eventLink.marker.broken', m.count)
  if (knowledgeOf(m) > 0) {
    const parts = [
      [eventsOf(m), 'events'],
      [entriesOf(m), 'entries'],
      [knowledgeOf(m), 'uses'],
    ] as const
    return t('knowledgeUse.marker.linked', {
      parts: parts
        .filter(([n]) => n > 0)
        .map(([n, k]) => t(`knowledgeUse.marker.${k}`, { n }, n))
        .join(', '),
    })
  }
  if (entriesOf(m) === 0) return t('eventLink.marker.linked', m.count)
  if (eventsOf(m) === 0) return t('eventLink.marker.linkedEntries', m.count)
  return t('eventLink.marker.linkedMixed', { events: eventsOf(m), entries: entriesOf(m) })
}
</script>

<template>
  <div class="gutter">
    <button
      v-for="m in markers"
      :key="m.id"
      type="button"
      class="marker"
      :class="{ broken: m.broken }"
      :data-marker-kind="kindOf(m)"
      :data-marker-block="m.id"
      :style="{ top: `${m.top}px` }"
      aria-haspopup="dialog"
      :aria-expanded="expanded === m.id"
      :aria-label="label(m)"
      :title="label(m)"
      @mousedown.prevent
      @click="emit('open', m.id, $event.currentTarget as HTMLElement)"
    >
      <svg v-if="m.broken" class="shape" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2 L19 18 L1 18 Z" />
        <text x="10" y="16" text-anchor="middle">!</text>
      </svg>
      <template v-else>
        <svg v-if="eventsOf(m) > 0" class="shape" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 1 L19 10 L10 19 L1 10 Z" />
        </svg>
        <svg v-if="entriesOf(m) > 0" class="shape codex" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8.5" />
        </svg>
        <svg v-if="knowledgeOf(m) > 0" class="shape knowledge" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2" y="2" width="16" height="16" rx="2" />
        </svg>
      </template>
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
  /* Anchored to the text edge: mixed markers grow into the margin instead of over the text. */
  right: calc(100% - 2.875rem);
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
.shape.codex {
  fill: var(--section-codex);
}
.shape.knowledge {
  fill: var(--section-write);
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
