<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  isKnownName,
  rankSpeakers,
  type SpeakerEntry,
  type SpeakerView,
} from '../editor/game/speakers'
import type { SpeakerValue } from '../editor/game/speakerPlugin'

const props = defineProps<{
  x: number
  y: number
  entries: SpeakerEntry[]
  recent: string[]
  current: SpeakerView
  /** The line is a text (description) line. */
  isText: boolean
  /** The current speaker is a deleted codex entry that is still in the trash. */
  restorable: boolean
  readonly: boolean
}>()
const emit = defineEmits<{
  pick: [value: SpeakerValue]
  /** Create a codex character with this name and use it for every line with that name. */
  add: [name: string]
  restore: [id: string]
  /** Make the line a text (description) line. */
  text: []
  close: []
}>()
const { t } = useI18n()

type Option = {
  key: string
  label: string
  via?: string
  icon: string
  value:
    | { kind: 'set'; speaker: SpeakerValue }
    | { kind: 'add'; name: string }
    | { kind: 'restore'; id: string }
    | { kind: 'text' }
}

const query = ref('')
const index = ref(0)
const input = ref<HTMLInputElement | null>(null)
const listId = 'speaker-picker-list'

const options = computed<Option[]>(() => {
  const q = query.value.trim()
  const out: Option[] = []
  if (q === '' && props.current.state === 'broken' && props.restorable)
    out.push({
      key: 'restore',
      label: t('speaker.restore'),
      icon: 'restore_from_trash',
      value: { kind: 'restore', id: props.current.id },
    })
  if (q === '' && !props.isText)
    out.push({ key: 'text', label: t('speaker.text'), icon: 'notes', value: { kind: 'text' } })
  if (q === '')
    out.push({ key: 'none', label: t('speaker.none'), icon: 'record_voice_over', value: { kind: 'set', speaker: null } })
  for (const r of rankSpeakers(q, props.entries, props.recent))
    out.push({
      key: `e:${r.entry.id}`,
      label: r.entry.name,
      via: r.via,
      icon: 'person',
      value: { kind: 'set', speaker: { speakerId: r.entry.id } },
    })
  if (q !== '' && !isKnownName(q, props.entries)) {
    out.push({
      key: 'name',
      label: t('speaker.useName', { name: q }),
      icon: 'edit',
      value: { kind: 'set', speaker: { speakerName: q } },
    })
    out.push({ key: 'add', label: t('speaker.addToCodex', { name: q }), icon: 'person_add', value: { kind: 'add', name: q } })
  } else if (q === '' && props.current.state === 'name')
    out.push({
      key: 'add-current',
      label: t('speaker.addToCodex', { name: props.current.name }),
      icon: 'person_add',
      value: { kind: 'add', name: props.current.name },
    })
  return out
})

const style = computed(() => ({
  left: `${Math.max(8, Math.min(props.x, window.innerWidth - 300))}px`,
  top: `${Math.min(props.y, window.innerHeight - 280)}px`,
}))

function accept(i: number): void {
  const o = options.value[i]
  if (!o || props.readonly) return
  if (o.value.kind === 'add') emit('add', o.value.name)
  else if (o.value.kind === 'restore') emit('restore', o.value.id)
  else if (o.value.kind === 'text') emit('text')
  else emit('pick', o.value.speaker)
}
function onKey(e: KeyboardEvent): void {
  const n = options.value.length
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (n) index.value = (index.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
  } else if (e.key === 'Enter') {
    e.preventDefault()
    accept(index.value)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}
function onBlur(e: FocusEvent): void {
  if (!(e.relatedTarget as HTMLElement | null)?.closest('.speaker-picker')) emit('close')
}

onMounted(async () => {
  await nextTick()
  input.value?.focus()
})
</script>

<template>
  <div class="speaker-picker" :style="style" role="dialog" :aria-label="t('speaker.pick')">
    <input
      ref="input"
      v-model="query"
      type="text"
      role="combobox"
      aria-expanded="true"
      aria-autocomplete="list"
      :aria-controls="listId"
      :aria-activedescendant="options.length ? `${listId}-${index}` : undefined"
      :aria-label="t('speaker.search')"
      :placeholder="t('speaker.search')"
      :disabled="readonly"
      autocomplete="off"
      @input="index = 0"
      @keydown="onKey"
      @blur="onBlur"
    />
    <ul :id="listId" role="listbox" :aria-label="t('speaker.pick')" @mousedown.prevent>
      <li
        v-for="(o, i) in options"
        :id="`${listId}-${i}`"
        :key="o.key"
        role="option"
        :aria-selected="i === index"
        :class="{ active: i === index }"
        @click="accept(i)"
      >
        <QIcon :name="o.icon" size="1rem" aria-hidden="true" />
        <span class="text">{{ o.label }}</span>
        <span v-if="o.via" class="via">{{ o.via }}</span>
      </li>
      <li v-if="options.length === 0" class="none" role="presentation">{{ t('speaker.noMatch') }}</li>
    </ul>
  </div>
</template>

<style scoped>
.speaker-picker {
  position: fixed;
  z-index: 3000;
  width: 18rem;
  background: var(--bg-raised);
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 20%);
}
input {
  box-sizing: border-box;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 0;
  border-bottom: 1px solid var(--border-strong);
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: inherit;
  font: inherit;
}
input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}
ul {
  max-height: 14rem;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  list-style: none;
}
li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 0.9rem;
}
li.active {
  background: var(--bg-selected);
}
li.none {
  color: var(--text-secondary);
  cursor: default;
}
.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.via {
  margin-left: auto;
  font-size: 0.8rem;
  opacity: 0.8;
}
</style>
