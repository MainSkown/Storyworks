<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BlockLink } from '../composables/eventLinks'

defineProps<{ x: number; y: number; rows: BlockLink[]; readonly?: boolean }>()
const emit = defineEmits<{
  close: []
  jump: [row: BlockLink]
  open: [row: BlockLink]
  openKnowledge: [row: BlockLink]
  unlink: [linkId: string]
  relink: [linkId: string]
}>()
const { t } = useI18n()
const missing = (r: BlockLink) => r.eventMissing || r.entryMissing || r.knowledgeMissing !== null
const MISSING_TEXT = {
  item: 'knowledgeUse.missingItem',
  entry: 'knowledgeUse.missingEntry',
  both: 'knowledgeUse.missingBoth',
} as const
const missingText = (r: BlockLink) =>
  r.knowledgeMissing
    ? MISSING_TEXT[r.knowledgeMissing]
    : r.entryMissing
      ? 'eventLink.popover.missingEntry'
      : 'eventLink.popover.missing'
const root = ref<HTMLElement | null>(null)

function onPointerDown(e: PointerEvent): void {
  const t = e.target as Element
  // A click on a margin marker toggles the popover itself.
  if (root.value && !root.value.contains(t) && !t.closest?.('[data-marker-block]')) emit('close')
}

onMounted(async () => {
  window.addEventListener('pointerdown', onPointerDown, true)
  await nextTick()
  root.value?.querySelector<HTMLElement>('button')?.focus()
})
onBeforeUnmount(() => window.removeEventListener('pointerdown', onPointerDown, true))
</script>

<template>
  <div
    ref="root"
    class="popover"
    role="dialog"
    :aria-label="t('eventLink.popover.title')"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <ul class="rows">
      <li
        v-for="r in rows"
        :key="r.link.id"
        class="row"
        :class="{ broken: r.broken }"
        :data-link-kind="r.kind"
      >
        <div class="info">
          <template v-if="missing(r)">
            <span class="tag problem">{{ t('eventLink.popover.problem') }}</span>
            <span class="name">
              {{ t(missingText(r)) }}
            </span>
          </template>
          <template v-else-if="r.knowledge">
            <span class="tag knowledge">{{ t('knowledgeUse.tag') }}</span>
            <span class="name">
              {{
                t('knowledgeUse.pair', {
                  item: r.knowledge.itemTitle || t('knowledgeMatrix.untitledItem'),
                  entry: r.knowledge.entryName || t('codex.untitled'),
                })
              }}
            </span>
            <span class="meta">
              {{
                [r.knowledge.typeName, r.knowledge.learns ? '' : t('knowledgeUse.notLearned')]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </span>
          </template>
          <template v-else-if="r.entry">
            <span class="tag codex">{{ t('eventLink.popover.entry') }}</span>
            <span class="name">{{ r.entry.name || t('codex.untitled') }}</span>
            <span v-if="r.entry.typeName" class="meta">{{ r.entry.typeName }}</span>
          </template>
          <template v-else>
            <span class="tag">{{ t('eventLink.popover.event') }}</span>
            <span class="name">{{ r.target!.title || t('timelines.untitled') }}</span>
            <span class="meta">
              {{ [r.target!.date, r.target!.timelineName].filter(Boolean).join(' · ') }}
            </span>
          </template>
        </div>
        <div class="actions">
          <template v-if="missing(r)">
            <button
              v-if="!readonly && r.kind !== 'knowledge'"
              type="button"
              class="btn"
              @click="emit('relink', r.link.id)"
            >
              {{ t('eventLink.popover.relink') }}
            </button>
            <button v-if="!readonly" type="button" class="btn" @click="emit('unlink', r.link.id)">
              {{ t('eventLink.popover.remove') }}
            </button>
          </template>
          <template v-else>
            <button v-if="r.knowledge" type="button" class="btn" @click="emit('openKnowledge', r)">
              {{ t('eventLink.popover.open') }}
            </button>
            <button v-else-if="r.entry" type="button" class="btn" @click="emit('open', r)">
              {{ t('eventLink.popover.open') }}
            </button>
            <button v-else type="button" class="btn" @click="emit('jump', r)">
              {{ t('eventLink.popover.jump') }}
            </button>
            <button v-if="!readonly" type="button" class="btn" @click="emit('unlink', r.link.id)">
              {{ t('eventLink.popover.unlink') }}
            </button>
          </template>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.popover {
  position: fixed;
  z-index: 20;
  box-sizing: border-box;
  width: 22rem;
  max-width: calc(100vw - 1rem);
  max-height: 60vh;
  overflow-y: auto;
  padding: 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.5rem;
  background: var(--bg-panel);
  color: var(--text-primary);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  padding: 0.4rem 0.25rem;
  border-bottom: 1px solid var(--border);
}
.row:last-child {
  border-bottom: 0;
}
.info {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.125rem 0.5rem;
}
.tag {
  padding: 0 0.4rem;
  border-radius: 0.25rem;
  background: var(--tag-event);
  color: var(--tag-event-on);
  font-size: 0.6875rem;
  font-weight: 700;
}
.tag.codex {
  background: var(--section-codex);
  color: var(--section-codex-on);
}
.tag.knowledge {
  background: var(--section-write);
  color: var(--section-write-on);
}
.tag.problem {
  background: var(--tag-problem);
  color: var(--tag-problem-on);
}
.name {
  font-weight: 600;
}
.broken .name {
  text-decoration: line-through;
}
.meta {
  flex-basis: 100%;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
.btn {
  padding: 0.125rem 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.btn:hover {
  background: var(--bg-selected);
}
.btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
