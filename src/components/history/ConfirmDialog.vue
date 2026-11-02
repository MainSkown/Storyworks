<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ title: string; lines: string[]; confirmLabel: string; busy?: boolean }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ confirm: [] }>()
const { t } = useI18n()
</script>

<template>
  <QDialog v-model="open" :persistent="busy">
    <QCard class="confirm" role="alertdialog" aria-labelledby="hist-confirm-title">
      <QCardSection>
        <h2 id="hist-confirm-title" class="title">{{ title }}</h2>
        <p v-for="(line, i) in lines" :key="i" class="line">{{ line }}</p>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('history.confirm.cancel')" :disable="busy" @click="open = false" />
        <QBtn
          unelevated
          no-caps
          color="primary"
          :label="confirmLabel"
          :loading="busy"
          @click="emit('confirm')"
        />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.confirm {
  min-width: min(30rem, 90vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.title {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.line {
  margin: 0 0 0.5rem;
}
</style>
