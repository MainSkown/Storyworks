<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '../../project/store'
import NumberField from '../NumberField.vue'

const { t } = useI18n()
const project = useProjectStore()
const readOnly = computed(() => !!project.readOnly)

// 0 means "no goal" in the fields; the manifest stores null.
const field = (key: 'daily' | 'book') =>
  computed({
    get: () => project.goals[key] ?? 0,
    set: (v: number) => project.setGoals({ ...project.goals, [key]: v > 0 ? v : null }),
  })
const daily = field('daily')
const book = field('book')
</script>

<template>
  <div v-if="project.project" id="goals" class="group" role="group" aria-labelledby="set-goals">
    <h2 id="set-goals">{{ t('stats.goals.title') }}</h2>
    <p class="hint">{{ t('stats.goals.hint') }}</p>
    <p v-if="readOnly" class="hint">{{ t('stats.goals.readOnly') }}</p>
    <div class="row">
      <span id="set-goal-daily">{{ t('stats.goals.daily') }}</span>
      <NumberField
        v-model="daily"
        :min="0"
        :max="1000000"
        :suffix="t('stats.goals.words')"
        :disabled="readOnly"
        labelledby="set-goal-daily"
      />
    </div>
    <div class="row">
      <span id="set-goal-book">{{ t('stats.goals.book') }}</span>
      <NumberField
        v-model="book"
        :min="0"
        :max="10000000"
        :suffix="t('stats.goals.words')"
        :disabled="readOnly"
        labelledby="set-goal-book"
      />
    </div>
  </div>
</template>

<style scoped>
.group {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.group h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
}
.hint {
  margin: 0 0 0.5rem;
  color: var(--text-secondary);
}
.row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}
.row > span {
  min-width: 11rem;
}
</style>
