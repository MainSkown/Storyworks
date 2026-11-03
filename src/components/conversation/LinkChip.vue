<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ItemLink } from '../../project/schemas/conversation'
import { useCrossLinks } from './crossLinkContext'

const props = withDefaults(defineProps<{ link: ItemLink; interactive?: boolean }>(), {
  interactive: false,
})
const { t } = useI18n()
const xl = useCrossLinks()

const info = computed(() => xl.chip(props.link))
const reason = computed(() => {
  const p = info.value.problem
  return p ? t(`game.crossLink.broken.${p}`) : ''
})
const text = computed(() => {
  const i = info.value
  const base = i.node ? t('game.crossLink.chipNode', { title: i.title, node: i.node }) : i.title
  return i.problem && i.problem !== 'item-missing' ? `${base} (${reason.value})` : base
})
const full = computed(() => t('game.crossLink.chip', { title: text.value }))
const asButton = computed(() => props.interactive && info.value.openable)
</script>

<template>
  <button
    v-if="asButton"
    type="button"
    class="link-chip"
    :class="{ broken: !!info.problem }"
    :aria-label="t('game.crossLink.open', { title: text })"
    :title="full"
    @click.stop="xl.open(link.itemId)"
  >
    <QIcon :name="info.problem ? 'link_off' : 'arrow_forward'" size="0.875rem" aria-hidden="true" />
    <span class="txt">{{ text }}</span>
  </button>
  <span v-else class="link-chip" :class="{ broken: !!info.problem }" :title="full">
    <QIcon :name="info.problem ? 'link_off' : 'arrow_forward'" size="0.875rem" aria-hidden="true" />
    <span class="txt">{{ text }}</span>
  </span>
</template>

<style scoped>
.link-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  max-width: 100%;
  padding: 0 0.3rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.6875rem;
  font-weight: 700;
  vertical-align: middle;
}
button.link-chip {
  cursor: pointer;
}
button.link-chip:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.link-chip.broken {
  border-color: var(--tag-problem);
  color: var(--tag-problem);
}
.txt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
