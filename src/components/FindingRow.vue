<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { findingText } from '../checks/text'
import type { Finding, FindingLocation, LocationKind } from '../checks/types'

const props = defineProps<{ finding: Finding; ignored: boolean }>()
const emit = defineEmits<{ open: [location: FindingLocation]; toggleIgnore: [] }>()

const i18n = useI18n()
const { t } = i18n

const SEVERITY_ICON = { error: 'dangerous', warning: 'warning', info: 'info' } as const
const KIND_ICON: Record<LocationKind, string> = {
  scene: 'edit',
  node: 'event',
  rule: 'checklist',
  entry: 'menu_book',
  file: 'description',
  item: 'forum',
  mechanic: 'build',
  variable: 'data_object',
}

const text = computed(() => findingText(i18n, props.finding))
const untitled = (l: FindingLocation) => l.label.trim() || '…'
</script>

<template>
  <li class="row" :class="[`sev-${finding.severity}`, { ignored }]">
    <QIcon
      class="sev-icon"
      :name="SEVERITY_ICON[finding.severity]"
      size="1.25rem"
      role="img"
      :aria-label="t(`checks.severity.${finding.severity}`)"
    />
    <div class="body">
      <p class="msg">
        {{ text }}
        <span v-if="ignored" class="tag">{{ t('checks.ignoredTag') }}</span>
      </p>
      <ul v-if="finding.locations.length" class="locs">
        <li v-for="(l, i) in finding.locations" :key="`${l.kind}:${l.id}:${l.blockId ?? ''}:${i}`">
          <span v-if="l.kind === 'file'" class="chip static">
            <QIcon :name="KIND_ICON.file" size="1rem" aria-hidden="true" />
            <span class="chip-label">{{ untitled(l) }}</span>
          </span>
          <button
            v-else
            type="button"
            class="chip"
            :aria-label="t('checks.openLocation', { kind: t(`checks.kind.${l.kind}`), label: untitled(l) })"
            @click="emit('open', l)"
          >
            <QIcon :name="KIND_ICON[l.kind]" size="1rem" aria-hidden="true" />
            <span class="chip-label">{{ untitled(l) }}</span>
          </button>
        </li>
      </ul>
    </div>
    <QBtn
      flat
      no-caps
      dense
      class="act"
      :label="ignored ? t('checks.unignore') : t('checks.ignore')"
      :aria-label="
        t(ignored ? 'checks.unignoreLabel' : 'checks.ignoreLabel', { message: text })
      "
      @click="emit('toggleIgnore')"
    />
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border);
  border-inline-start: 4px solid var(--sev);
  border-radius: 6px;
  background: var(--bg-sheet);
}
.sev-error {
  --sev: var(--section-checks);
}
.sev-warning {
  --sev: var(--section-timelines);
}
.sev-info {
  --sev: var(--section-write);
}
.row.ignored {
  opacity: 0.7;
}
.sev-icon {
  flex: none;
  margin-top: 0.125rem;
  color: var(--sev);
}
.body {
  flex: 1;
  min-width: 0;
}
.msg {
  margin: 0;
  overflow-wrap: anywhere;
}
.tag {
  margin-inline-start: 0.5rem;
  padding: 0 0.375rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.locs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin: 0.375rem 0 0;
  padding: 0;
  list-style: none;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 20rem;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
}
button.chip {
  cursor: pointer;
}
button.chip:hover {
  background: var(--bg-selected);
}
button.chip:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.chip.static {
  color: var(--text-secondary);
}
.chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.act {
  flex: none;
}
</style>
