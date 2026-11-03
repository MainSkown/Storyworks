<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SuggestInfo } from '../editor/screenplay/suggestPlugin'

const props = defineProps<{ info: SuggestInfo; listId: string }>()
const emit = defineEmits<{ pick: [index: number] }>()
const { t } = useI18n()

const MAX_HEIGHT = 220
const style = computed(() => {
  const below = window.innerHeight - props.info.bottom
  const flip = below < MAX_HEIGHT && props.info.top > below
  return {
    left: `${Math.max(8, Math.min(props.info.left, window.innerWidth - 280))}px`,
    ...(flip
      ? { bottom: `${window.innerHeight - props.info.top + 4}px` }
      : { top: `${props.info.bottom + 4}px` }),
  }
})

const optionId = (i: number) => `${props.listId}-${i}`
</script>

<template>
  <div class="suggest" :style="style" @mousedown.prevent>
    <ul :id="listId" role="listbox" :aria-label="t('suggest.label')">
      <li
        v-for="(item, i) in info.items"
        :id="optionId(i)"
        :key="item.insert"
        role="option"
        :aria-selected="i === info.index"
        :class="{ active: i === info.index }"
        @click="emit('pick', i)"
      >
        <span class="text">{{ item.label }}</span>
        <span v-if="item.via" class="via">{{ item.via }}</span>
      </li>
      <li
        v-if="info.addName"
        :id="optionId(info.items.length)"
        role="option"
        class="add"
        :aria-selected="info.index === info.items.length"
        :class="{ active: info.index === info.items.length }"
        @click="emit('pick', info.items.length)"
      >
        <QIcon name="person_add" aria-hidden="true" />
        <span class="text">{{ t('suggest.add', { name: info.addName }) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.suggest {
  position: fixed;
  z-index: 3000;
  min-width: 180px;
  max-width: 280px;
  max-height: 220px;
  overflow-y: auto;
  background: var(--bg-raised);
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 20%);
}
ul {
  list-style: none;
  margin: 0;
  padding: 4px 0;
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
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
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
.add {
  border-top: 1px solid var(--border);
  font-style: italic;
}
.add:only-child {
  border-top: 0;
}
</style>
