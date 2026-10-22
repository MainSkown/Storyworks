<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <main class="welcome">
    <section class="card">
      <p class="app-name">{{ t('app.name') }}</p>
      <h1>{{ t('welcome.title') }}</h1>

      <div class="actions">
        <QBtn
          unelevated
          no-caps
          color="primary"
          icon="add"
          :label="t('welcome.newProject')"
          disable
          :title="t('welcome.comingSoon')"
        />
        <QBtn
          unelevated
          no-caps
          class="btn-secondary"
          icon="folder_open"
          :label="t('welcome.openProject')"
          disable
          :title="t('welcome.comingSoon')"
        />
      </div>

      <h2>{{ t('welcome.recent') }}</h2>
      <p class="empty">{{ t('welcome.noRecent') }}</p>
    </section>

    <router-link class="preview" to="/app/write">{{ t('welcome.previewWorkspace') }}</router-link>
  </main>
</template>

<style scoped>
.welcome {
  min-height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 1rem;
  background: var(--bg-app);
  color: var(--text-primary);
}

.card {
  width: min(100%, 32rem);
  box-sizing: border-box;
  padding: 2rem;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
}

.app-name {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h1 {
  margin: 0.25rem 0 1.5rem;
  font-size: 1.75rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

h2 {
  margin: 2rem 0 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  font-size: 1rem;
}

.empty {
  margin: 0;
  color: var(--text-secondary);
}

.preview {
  color: var(--focus-ring);
  font-size: 0.875rem;
}

.preview:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
