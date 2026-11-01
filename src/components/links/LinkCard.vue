<script setup lang="ts">
defineProps<{ tag?: string; tagKind?: 'rule' | 'codex'; problem?: boolean; title: string; meta?: string; snippet?: string }>()
</script>

<template>
  <li class="card" :class="{ problem }">
    <div class="head">
      <span v-if="tag" class="tag" :class="{ problem, rule: tagKind === 'rule', codex: tagKind === 'codex' }">{{ tag }}</span>
      <span class="name">{{ title }}</span>
    </div>
    <div v-if="meta" class="meta">{{ meta }}</div>
    <div v-if="snippet" class="snippet">{{ snippet }}</div>
    <div class="actions"><slot /></div>
  </li>
</template>

<style scoped>
.card {
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  list-style: none;
}
.head {
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
.tag.rule {
  background: var(--tag-rule);
  color: var(--tag-rule-on);
}
.tag.codex {
  background: var(--tag-character);
  color: var(--tag-character-on);
}
.tag.problem {
  background: var(--tag-problem);
  color: var(--tag-problem-on);
}
.name {
  font-size: 0.875rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.problem .name {
  text-decoration: line-through;
}
.meta,
.snippet {
  margin-top: 0.125rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}
.snippet {
  font-style: italic;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.375rem;
}
.actions:empty {
  display: none;
}
:slotted(.btn) {
  padding: 0.125rem 0.625rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
:slotted(.btn:hover) {
  background: var(--bg-selected);
}
:slotted(.btn:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
