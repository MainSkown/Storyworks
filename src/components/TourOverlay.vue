<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../project/store'
import { useSettingsStore } from '../settings/store'
import { tourStepsFor } from '../tour/steps'
import { dismissTour, shouldAutoStart, tourOpen } from '../tour/state'

const { t } = useI18n()
const project = useProjectStore()
const settings = useSettingsStore()

const index = ref(0)
const popover = ref<HTMLElement | null>(null)
const anchor = ref<DOMRect | null>(null)
const pos = ref({ top: 0, left: 0 })
let returnFocus: HTMLElement | null = null

const steps = computed(() => tourStepsFor(project.project?.manifest.kind))
const step = computed(() => steps.value[index.value] ?? steps.value[0]!)
const isFirst = computed(() => index.value === 0)
const isLast = computed(() => index.value === steps.value.length - 1)

watch(
  () => ({
    settingsLoaded: settings.loaded,
    seen: settings.settings.tourSeen,
    bookOpen: !!project.project,
    running: tourOpen.value,
  }),
  (s) => {
    if (shouldAutoStart(s)) tourOpen.value = true
  },
  { immediate: true },
)

/** Finds the anchor row; a hidden sidebar (focus mode) counts as missing. */
function measure(): void {
  const el = document.querySelector<HTMLElement>(step.value.target)
  el?.scrollIntoView({ block: 'nearest' })
  const r = el?.getBoundingClientRect()
  anchor.value = r && r.width > 0 && r.height > 0 ? r : null
  const pop = popover.value
  const w = pop?.offsetWidth ?? 320
  const h = pop?.offsetHeight ?? 180
  const margin = 8
  if (anchor.value) {
    const left = Math.min(anchor.value.right + 16, window.innerWidth - w - margin)
    const top = Math.min(Math.max(anchor.value.top - 8, margin), window.innerHeight - h - margin)
    pos.value = { top, left: Math.max(left, margin) }
  } else {
    pos.value = {
      top: Math.max((window.innerHeight - h) / 2, margin),
      left: Math.max((window.innerWidth - w) / 2, margin),
    }
  }
}

async function show(): Promise<void> {
  await nextTick()
  measure()
  await nextTick()
  measure() // the popover size is known now
  popover.value?.querySelector<HTMLElement>('[data-tour-primary]')?.focus()
}

watch(
  tourOpen,
  async (open) => {
    if (open) {
      index.value = 0
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('keydown', onKeydown, true)
      window.addEventListener('resize', measure)
      await show()
    } else {
      document.removeEventListener('keydown', onKeydown, true)
      window.removeEventListener('resize', measure)
      returnFocus?.focus()
      returnFocus = null
    }
  },
  { immediate: true },
)

watch(index, () => void show())
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', measure)
})

function next(): void {
  if (isLast.value) dismissTour()
  else index.value++
}
function back(): void {
  if (!isFirst.value) index.value--
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    dismissTour()
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const typing =
      e.target instanceof HTMLElement &&
      e.target.closest('input, textarea, [contenteditable="true"]')
    if (typing) return
    e.preventDefault()
    if (e.key === 'ArrowRight') next()
    else back()
  } else if (e.key === 'Tab' && popover.value) {
    const items = [...popover.value.querySelectorAll<HTMLElement>('button:not([disabled])')]
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return
    const active = document.activeElement
    if (!popover.value.contains(active)) {
      e.preventDefault()
      first.focus()
    } else if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

function refocus(): void {
  popover.value?.querySelector<HTMLElement>('[data-tour-primary]')?.focus()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="tourOpen" class="tour-root">
      <div
        v-if="anchor"
        class="tour-highlight"
        :style="{
          top: `${anchor.top - 4}px`,
          left: `${anchor.left - 4}px`,
          width: `${anchor.width + 8}px`,
          height: `${anchor.height + 8}px`,
        }"
        aria-hidden="true"
      ></div>
      <div v-else class="tour-dim" aria-hidden="true"></div>
      <div class="tour-catcher" aria-hidden="true" @click="refocus"></div>
      <div
        ref="popover"
        class="tour-popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
      >
        <p class="tour-progress">
          {{ t('tour.progress', { current: index + 1, total: steps.length }) }}
        </p>
        <h2 id="tour-title" class="tour-title">{{ t(step.titleKey) }}</h2>
        <p id="tour-body" class="tour-text" role="status" aria-live="polite">
          {{ t(step.bodyKey) }}
        </p>
        <div class="tour-actions">
          <button type="button" class="tour-btn tour-skip" @click="dismissTour">
            {{ t('tour.skip') }}
          </button>
          <span class="tour-spacer"></span>
          <button v-if="!isFirst" type="button" class="tour-btn" @click="back">
            {{ t('tour.back') }}
          </button>
          <button type="button" class="tour-btn tour-primary" data-tour-primary @click="next">
            {{ isLast ? t('tour.done') : t('tour.next') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tour-root {
  position: fixed;
  inset: 0;
  z-index: 7000;
}
.tour-dim,
.tour-catcher {
  position: fixed;
  inset: 0;
}
.tour-dim {
  background: rgba(0, 0, 0, 0.45);
}
.tour-highlight {
  position: fixed;
  border-radius: 0.5rem;
  box-shadow:
    0 0 0 2px var(--focus-ring),
    0 0 0 9999px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
.tour-popover {
  position: fixed;
  box-sizing: border-box;
  width: min(20rem, calc(100vw - 1rem));
  padding: 1rem 1.125rem;
  border: 1px solid var(--border);
  border-radius: 0.625rem;
  background: var(--bg-raised);
  color: var(--text-primary);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
}
.tour-progress {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.tour-title {
  margin: 0.25rem 0 0.5rem;
  font-size: 1.0625rem;
  font-weight: 700;
}
.tour-text {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  line-height: 1.45;
}
.tour-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.tour-spacer {
  flex: 1;
}
.tour-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}
.tour-btn:hover {
  background: var(--bg-selected);
}
.tour-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.tour-skip {
  padding-inline: 0.25rem;
  border-color: transparent;
  color: var(--text-secondary);
}
.tour-primary {
  border-color: var(--focus-ring);
  background: var(--focus-ring);
  color: var(--bg-sheet);
  font-weight: 600;
}
.tour-primary:hover {
  background: var(--focus-ring);
  filter: brightness(1.1);
}
@media (prefers-reduced-motion: no-preference) {
  .tour-highlight,
  .tour-popover {
    transition:
      top 0.18s ease,
      left 0.18s ease,
      width 0.18s ease,
      height 0.18s ease;
  }
}
</style>
