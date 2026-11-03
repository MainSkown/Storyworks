<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { relatedMechanics } from '../../game/mechanicLinks'
import { useMechanicsStore } from '../../gamedoc/mechanicsStore'
import { openMechanic } from '../../gamedoc/openMechanic'
import type { Mechanic } from '../../project/schemas/mechanic'

const props = defineProps<{ mechanic: Mechanic }>()
const { t } = useI18n()
const store = useMechanicsStore()
const related = computed(() => relatedMechanics(props.mechanic, store.mechanics))
</script>

<template>
  <p v-if="!related.length" class="note">{{ t('gamedoc.links.relatedNone') }}</p>
  <ul v-else class="list" data-testid="mechanic-related">
    <li v-for="m in related" :key="m.id">
      <button type="button" class="open" @click="openMechanic(m.id)">
        {{ m.title.trim() || t('gamedoc.links.untitledMechanic') }}
      </button>
    </li>
  </ul>
</template>

<style scoped>
.list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
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
