<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { mechanicsFor } from '../../game/mechanicLinks'
import { useMechanicsStore } from '../../gamedoc/mechanicsStore'
import { openMechanic } from '../../gamedoc/openMechanic'
import type { MechanicLinkKind } from '../../project/schemas/mechanic'

const props = defineProps<{ kind: MechanicLinkKind; id: string | null }>()
const { t } = useI18n()
const store = useMechanicsStore()
const used = computed(() => (props.id ? mechanicsFor(props.kind, props.id, store.mechanics) : []))
</script>

<template>
  <div class="using" data-testid="mechanics-using">
    <p class="count">{{ t('gamedoc.links.usedBy', { n: used.length }, used.length) }}</p>
    <ul v-if="used.length" class="list">
      <li v-for="m in used" :key="m.id">
        <button type="button" class="open" @click="openMechanic(m.id)">
          {{ m.title.trim() || t('gamedoc.links.untitledMechanic') }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.count {
  margin: 0 0 0.25rem;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.open {
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--section-gamedoc);
  border-radius: 0.25rem;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.open:hover {
  background: var(--bg-selected);
}
.open:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
</style>
