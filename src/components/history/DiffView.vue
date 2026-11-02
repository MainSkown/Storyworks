<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { collapseSame, type DiffLine } from '../../history/diff'

const props = defineProps<{ lines: DiffLine[] }>()
const { t } = useI18n()
const folded = computed(() => collapseSame(props.lines, 3))
const same = computed(() => props.lines.every((l) => l.type === 'same'))
</script>

<template>
  <p v-if="same" class="none">{{ t('history.log.noDifference') }}</p>
  <div v-else class="diff" role="group" :aria-label="t('history.log.compareCurrent')">
    <template v-for="(l, i) in folded" :key="i">
      <div v-if="l.type === 'skip'" class="skip">{{ t('history.log.unchangedLines', l.count) }}</div>
      <div v-else class="line" :class="l.type">
        <span class="mark" aria-hidden="true">{{ l.type === 'add' ? '+' : l.type === 'del' ? '−' : '' }}</span>
        <span v-if="l.type !== 'same'" class="sr-only">
          {{ l.type === 'add' ? t('history.log.added') : t('history.log.removed') }}:
        </span>
        <span class="text">{{ l.text || ' ' }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.none {
  color: var(--text-secondary);
}
.diff {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-sheet);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8125rem;
  max-height: 24rem;
  overflow: auto;
}
.line {
  display: flex;
  gap: 0.5rem;
  padding: 0 0.5rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.mark {
  flex: none;
  width: 1ch;
  font-weight: 700;
}
.add {
  background: color-mix(in srgb, var(--status-final) 18%, transparent);
}
.add .mark {
  color: var(--status-final);
}
.del {
  background: color-mix(in srgb, var(--tag-problem) 16%, transparent);
}
.del .mark {
  color: var(--tag-problem);
}
.skip {
  padding: 0.125rem 0.5rem;
  color: var(--text-secondary);
  background: var(--bg-selected);
  font-style: italic;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
