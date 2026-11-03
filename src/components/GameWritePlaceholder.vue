<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="placeholder" data-testid="game-placeholder">
    <QIcon name="sports_esports" size="2.5rem" aria-hidden="true" />
    <h2>{{ t('game.placeholder.title') }}</h2>
    <p>{{ t('game.placeholder.body') }}</p>
  </div>
</template>

<style scoped>
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  max-width: 28rem;
  margin: 3rem auto;
  padding: 0 1.5rem;
  text-align: center;
  color: var(--text-secondary);
}
h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}
p {
  margin: 0;
}
</style>
