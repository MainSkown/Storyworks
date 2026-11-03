<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { areaStyle, AREA_META } from '../search/areaMeta'
import { moveActive } from '../search/nav'
import { useSearchStore } from '../search/store'
import type { SwitchEntry } from '../search/switcher'
import MatchText from './MatchText.vue'

const open = defineModel<boolean>({ required: true })
const { t } = useI18n()
const store = useSearchStore()

const q = ref('')
const entries = shallowRef<SwitchEntry[]>([])
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

const showingRecents = computed(() => q.value.trim() === '')
const optionId = (e: SwitchEntry) => `switch-opt-${e.id}`
const activeId = computed(() => {
  const e = entries.value[active.value]
  return e ? optionId(e) : undefined
})

function run(): void {
  entries.value = store.switchList(q.value)
  active.value = Math.min(active.value, Math.max(0, entries.value.length - 1))
}

watch(q, () => {
  active.value = 0
  run()
})
watch(() => store.version, () => open.value && run())
watch(open, (v) => {
  if (!v) return
  q.value = ''
  active.value = 0
  run()
})

async function onShow(): Promise<void> {
  await nextTick()
  input.value?.focus()
}

watch(active, async () => {
  await nextTick()
  list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
})

async function activate(e: SwitchEntry | undefined): Promise<void> {
  if (!e) return
  open.value = false
  await store.open({ id: e.id, kind: e.kind, parentId: e.parentId })
}

function onKeydown(e: KeyboardEvent): void {
  if (e.isComposing) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = moveActive(active.value, e.key === 'ArrowDown' ? 1 : -1, entries.value.length)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    void activate(entries.value[active.value])
  }
}

const status = computed(() =>
  entries.value.length === 0
    ? showingRecents.value
      ? t('search.switcher.empty')
      : t('search.none', { query: q.value.trim() })
    : t('search.count', entries.value.length),
)
</script>

<template>
  <QDialog v-model="open" position="top" @show="onShow">
    <QCard class="card" role="dialog" aria-modal="true" :aria-label="t('search.switcher.title')">
      <div class="head">
        <QIcon name="bolt" class="head-icon" aria-hidden="true" />
        <input
          ref="input"
          v-model="q"
          class="input"
          type="text"
          role="combobox"
          autocomplete="off"
          spellcheck="false"
          aria-autocomplete="list"
          aria-controls="switch-listbox"
          :aria-expanded="entries.length > 0"
          :aria-activedescendant="activeId"
          :aria-label="t('search.switcher.title')"
          :placeholder="t('search.switcher.placeholder')"
          @keydown="onKeydown"
        />
      </div>

      <div ref="list" class="body">
        <div v-if="showingRecents && entries.length > 0" id="switch-heading" class="heading">
          {{ t('search.switcher.recent') }}
        </div>
        <div
          id="switch-listbox"
          role="listbox"
          :aria-label="showingRecents ? t('search.switcher.recent') : t('search.results')"
        >
          <div
            v-for="(e, i) in entries"
            :id="optionId(e)"
            :key="e.id"
            role="option"
            class="option"
            :class="{ active: i === active }"
            :style="areaStyle(e.area)"
            :aria-selected="i === active"
            @click="activate(e)"
            @mousemove="active = i"
          >
            <span class="swatch" aria-hidden="true"><QIcon :name="AREA_META[e.area].icon" /></span>
            <span class="title">
              <template v-if="e.matchedAlias">
                {{ e.title || t('search.untitled') }}
                <span class="also"
                  >— {{ t('search.also') }}
                  <MatchText :text="e.matchedAlias" :start="e.matchStart" :end="e.matchEnd"
                /></span>
              </template>
              <MatchText v-else :text="e.title" :start="e.matchStart" :end="e.matchEnd" />
            </span>
            <span class="kind">{{ t(`search.kind.${e.kind}`) }}</span>
          </div>
        </div>
        <p v-if="entries.length === 0" class="note">{{ status }}</p>
      </div>

      <div class="sr-only" role="status" aria-live="polite">{{ status }}</div>
      <div class="foot" aria-hidden="true">{{ t('search.keys') }}</div>
    </QCard>
  </QDialog>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  width: min(34rem, 94vw);
  max-height: 70vh;
  margin-top: 8vh;
  background: var(--bg-raised);
  color: var(--text-primary);
}
.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  border-bottom: 1px solid var(--border);
}
.head-icon {
  color: var(--text-secondary);
  font-size: 1.375rem;
}
.input {
  flex: 1;
  min-width: 0;
  padding: 0.375rem 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 1.0625rem;
}
.input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.25rem 0.5rem;
}
.heading {
  padding: 0.5rem 0.5rem 0.25rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.option {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.375rem 0.5rem;
  border-radius: 0.375rem;
  border-inline-start: 3px solid transparent;
  cursor: pointer;
}
.option.active {
  background: var(--bg-selected);
  border-inline-start-color: var(--area);
}
.swatch {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.3rem;
  background: var(--area);
  color: var(--area-on);
  font-size: 1rem;
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.also {
  color: var(--text-secondary);
  font-weight: 400;
}
.kind {
  flex: none;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.note {
  margin: 0;
  padding: 0.75rem 0.5rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.foot {
  padding: 0.375rem 0.875rem;
  border-top: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
