<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BackupInfo } from '../../history/backups'
import { describeError } from '../../history/errorText'
import { useHistoryStore } from '../../history/store'
import { useProjectStore } from '../../project/store'
import ConfirmDialog from './ConfirmDialog.vue'

const { t, te, locale } = useI18n()
const history = useHistoryStore()
const project = useProjectStore()

onMounted(() => void history.refreshBackups())

const list = computed(() => history.backups.filter((b) => b.kind !== 'pre-migration'))
const readOnly = computed(() => !!project.readOnly)
const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
}

const target = ref<BackupInfo | null>(null)
const asking = computed({ get: () => target.value !== null, set: (v) => void (v || (target.value = null)) })
const done = ref(false)
const problem = ref('')

async function restore(): Promise<void> {
  const b = target.value
  if (!b) return
  problem.value = ''
  done.value = false
  try {
    await history.restoreBackup(b.name)
    done.value = true
    target.value = null
  } catch (e) {
    target.value = null
    problem.value = describeError(e, (k) => t(k), (k) => te(k))
  }
}
</script>

<template>
  <div class="backups">
    <p class="hint">{{ t('history.backups.intro') }}</p>
    <p v-if="list.length === 0" class="hint">{{ t('history.backups.empty') }}</p>
    <ul v-else class="list">
      <li v-for="b in list" :key="b.name" class="entry">
        <span class="name">{{ t('history.backups.' + b.kind) }}</span>
        <span class="meta">{{ when(b.time) }}</span>
        <QBtn
          flat
          no-caps
          :label="t('history.backups.restore')"
          :aria-label="`${t('history.backups.restore')}: ${t('history.backups.' + b.kind)}, ${when(b.time)}`"
          :disable="readOnly || history.busy"
          @click="target = b"
        />
      </li>
    </ul>
    <p v-if="readOnly" class="hint">{{ t('history.readOnly') }}</p>
    <p v-if="done" class="ok" role="status">{{ t('history.restored') }}</p>
    <p v-if="problem" class="err" role="alert">{{ problem }}</p>

    <ConfirmDialog
      v-model="asking"
      :title="t('history.confirm.backupTitle')"
      :lines="[
        t('history.confirm.backupBody', { when: target ? when(target.time) : '' }),
        t('history.confirm.safety'),
      ]"
      :confirm-label="t('history.confirm.backupDo')"
      :busy="history.busy"
      @confirm="restore"
    />
  </div>
</template>

<style scoped>
.backups {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.entry {
  display: grid;
  grid-template-columns: 12rem 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--border);
}
.meta {
  color: var(--text-secondary);
}
.ok,
.err {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--bg-sheet);
}
.err {
  border-color: var(--section-checks);
}
</style>
