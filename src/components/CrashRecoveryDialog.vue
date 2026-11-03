<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { makeBackup, pruneBackups } from '../history/backups'
import { describeError } from '../history/errorText'
import { restoreBackup } from '../history/restore'
import { describeRawError, restoreLatestBackupRaw } from '../safety/rawRestore'
import { createProjectIO } from '../project/io'
import { defaultEnv } from '../project/open'
import { useProjectStore } from '../project/store'
import { useSettingsStore } from '../settings/store'
import { log } from '../safety/log'
import { crashInfo } from '../safety/runtime'
import { verifyBook, type VerifyReport } from '../safety/verify'

const { t, te } = useI18n()
const router = useRouter()
const project = useProjectStore()
const settings = useSettingsStore()

const busy = ref(false)
const report = ref<VerifyReport | null>(null)
const error = ref('')

const lastBook = computed(() => crashInfo.value?.lastBook ?? null)
const bookName = computed(() => lastBook.value?.split(/[\\/]/).filter(Boolean).pop() ?? '')
const shownFiles = computed(() => report.value?.invalid.slice(0, 5) ?? [])
const backupTime = computed(() =>
  report.value?.latestBackup ? new Date(report.value.latestBackup.time).toLocaleString() : '',
)

function dismiss(): void {
  crashInfo.value = null
  report.value = null
  error.value = ''
}

async function openBook(): Promise<void> {
  const path = lastBook.value
  dismiss()
  if (path && (await project.open(path)) === 'opened') await router.push({ name: 'write' })
}

async function reopen(): Promise<void> {
  if (!lastBook.value) return
  busy.value = true
  error.value = ''
  try {
    const r = await verifyBook(createProjectIO(lastBook.value))
    if (r.ok) return await openBook()
    log.warn('verify.invalid-files')
    report.value = r
  } catch (e) {
    log.error('verify.failed', e)
    error.value = t('safety.crash.verifyFailed')
  } finally {
    busy.value = false
  }
}

async function restoreLatest(): Promise<void> {
  const backup = report.value?.latestBackup
  if (!backup || !lastBook.value) return
  busy.value = true
  error.value = ''
  try {
    const io = createProjectIO(lastBook.value)
    // Without a readable project.json the normal restore cannot run.
    if (report.value?.invalid.some((f) => f.path === 'project.json')) {
      await restoreLatestBackupRaw(io, defaultEnv)
    } else {
      await restoreBackup(io, backup.name, {
        env: defaultEnv,
        readOnly: false,
        makeSafetyBackup: async () => {
          const name = await makeBackup(io, defaultEnv, 'safety')
          await pruneBackups(io, { keepAuto: settings.settings.backups.keep })
          return name
        },
      })
    }
    log.info('restore.from-backup')
    await openBook()
  } catch (e) {
    log.error('restore.failed', e)
    error.value = describeRawError(e, t, te) ?? describeError(e, t, te)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <QDialog :model-value="!!crashInfo" persistent>
    <QCard class="dialog" role="alertdialog" aria-labelledby="dlg-crash-title">
      <QCardSection v-if="!report">
        <h2 id="dlg-crash-title" class="dlg-title">{{ t('safety.crash.title') }}</h2>
        <p>{{ t('safety.crash.body') }}</p>
        <p v-if="bookName">{{ t('safety.crash.lastBook', { name: bookName }) }}</p>
      </QCardSection>
      <QCardSection v-else>
        <h2 id="dlg-crash-title" class="dlg-title">{{ t('safety.crash.damagedTitle') }}</h2>
        <p>{{ t('safety.crash.damagedBody', report.invalid.length) }}</p>
        <ul class="files">
          <li v-for="f in shownFiles" :key="f.path">{{ f.path }}</li>
          <li v-if="report.invalid.length > shownFiles.length">
            {{ t('safety.crash.moreFiles', { n: report.invalid.length - shownFiles.length }) }}
          </li>
        </ul>
        <p v-if="report.latestBackup">
          {{ t('safety.crash.backupOffer', { when: backupTime }) }}
        </p>
        <p v-else>{{ t('safety.crash.noBackup') }}</p>
      </QCardSection>
      <QCardSection v-if="error" class="err" role="alert">{{ error }}</QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :disable="busy" :label="t('safety.crash.dismiss')" @click="dismiss" />
        <template v-if="!report">
          <QBtn
            v-if="lastBook"
            unelevated
            no-caps
            color="primary"
            autofocus
            :loading="busy"
            :label="t('safety.crash.reopen')"
            @click="reopen"
          />
        </template>
        <template v-else>
          <QBtn flat no-caps :disable="busy" :label="t('safety.crash.openAnyway')" @click="openBook" />
          <QBtn
            v-if="report.latestBackup"
            unelevated
            no-caps
            color="primary"
            autofocus
            :loading="busy"
            :label="t('safety.crash.restore')"
            @click="restoreLatest"
          />
        </template>
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  width: 30rem;
  max-width: 92vw;
  background: var(--bg-sheet);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
.dlg-title {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
}
.files {
  margin: 0.25rem 0 0.75rem;
  padding-inline-start: 1.25rem;
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
}
.err {
  color: var(--section-checks);
}
</style>
