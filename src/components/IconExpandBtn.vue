<script setup lang="ts">
// Icon button whose label slides out on hover or keyboard focus; the name is always on aria-label.
// The slot keeps the row layout fixed; the label is a click-through pill that grows over the neighbours
// (leftwards with `end`, so the last button stays inside its column).
defineOptions({ inheritAttrs: false })
defineProps<{ icon: string; label: string; disable?: boolean; end?: boolean }>()
</script>

<template>
  <span class="expand-slot" :class="{ 'expand-end': end }">
    <QBtn
      flat
      no-caps
      :icon="icon"
      :aria-label="label"
      :title="label"
      :disable="disable"
      class="expand-btn"
      v-bind="$attrs"
    />
    <span class="expand-label" aria-hidden="true">{{ label }}</span>
  </span>
</template>

<style scoped>
.expand-slot {
  position: relative;
  display: inline-block;
  flex: none;
  width: 3.5rem;
  height: 2.25rem;
}
.expand-slot:hover,
.expand-slot:has(.expand-btn:focus-visible) {
  z-index: 3;
}
.expand-btn {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.expand-btn:focus-visible {
  outline: none !important;
}
.expand-btn :deep(.q-focus-helper) {
  display: none;
}
.expand-slot:has(.expand-btn:focus-visible) .expand-label {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.expand-label {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  z-index: 0;
  display: flex;
  align-items: center;
  padding-inline: 3.5rem 1rem;
  border-radius: 4px;
  background: var(--bg-sidebar);
  color: var(--text-primary);
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  clip-path: inset(-6px 100% -6px 0);
  transition:
    clip-path 0.18s ease,
    opacity 0.18s ease;
}
.expand-end .expand-label {
  inset-inline-start: auto;
  inset-inline-end: 0;
  padding-inline: 1rem 3.5rem;
  clip-path: inset(-6px 0 -6px 100%);
}
.expand-slot:hover .expand-label,
.expand-slot:has(.expand-btn:focus-visible) .expand-label {
  opacity: 1;
  clip-path: inset(-6px);
}
@media (prefers-reduced-motion: reduce) {
  .expand-label {
    transition: none;
  }
}
</style>
