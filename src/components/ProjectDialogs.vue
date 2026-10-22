<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '../project/store'

const { t } = useI18n()
const store = useProjectStore()
const { lockPrompt, openError, externalPrompts, manifestChanged, lockNote } = storeToRefs(store)

const externalFirst = computed(() => externalPrompts.value[0] ?? null)

// Open errors come from opening or from reloading; only dismiss the message so
// an already open project stays as it was.
function dismissError(): void {
  store.openError = null
}

const TAKEOVER_NOTE_MS = 8000
const showTakeover = ref(false)
let noteTimer: ReturnType<typeof setTimeout> | undefined
function hideTakeover(): void {
  clearTimeout(noteTimer)
  showTakeover.value = false
  if (store.lockNote === 'took-over-stale') store.lockNote = null
}
watch(
  lockNote,
  (n) => {
    if (n !== 'took-over-stale') return
    showTakeover.value = true
    clearTimeout(noteTimer)
    noteTimer = setTimeout(hideTakeover, TAKEOVER_NOTE_MS)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(noteTimer))
</script>

<template>
  <QDialog :model-value="!!lockPrompt" persistent>
    <QCard class="dialog" role="alertdialog" aria-labelledby="dlg-lock-title">
      <QCardSection>
        <h2 id="dlg-lock-title" class="dlg-title">{{ t('project.lock.title') }}</h2>
        <p>{{ t('project.lock.body', { machine: lockPrompt?.holder.machine ?? '' }) }}</p>
        <p class="dlg-path">{{ lockPrompt?.rootPath }}</p>
      </QCardSection>
      <QCardActions align="right">
        <QBtn
          flat
          no-caps
          :label="t('project.cancel')"
          @click="store.resolveLockPrompt('cancel')"
        />
        <QBtn
          unelevated
          no-caps
          color="primary"
          autofocus
          :label="t('project.lock.openReadOnly')"
          @click="store.resolveLockPrompt('readOnly')"
        />
      </QCardActions>
    </QCard>
  </QDialog>

  <QDialog :model-value="!!openError" persistent>
    <QCard class="dialog" role="alertdialog" aria-labelledby="dlg-error-title">
      <QCardSection v-if="openError">
        <h2 id="dlg-error-title" class="dlg-title">
          {{
            openError.kind === 'refused'
              ? t('project.error.refusedTitle')
              : openError.kind === 'migration-failed'
                ? t('project.error.migrationTitle')
                : t('project.error.failedTitle')
          }}
        </h2>
        <template v-if="openError.kind === 'refused'">
          <p>
            {{
              openError.reason === 'invalid-json'
                ? t('project.error.invalidJson')
                : t('project.error.invalidSchema')
            }}
          </p>
          <dl class="dlg-facts">
            <dt>{{ t('project.file') }}</dt>
            <dd>
              <code>{{ openError.error.file }}</code>
            </dd>
            <template v-if="openError.error.field">
              <dt>{{ t('project.field') }}</dt>
              <dd>
                <code>{{ openError.error.field }}</code>
              </dd>
            </template>
            <dt>{{ t('project.message') }}</dt>
            <dd>{{ openError.error.message }}</dd>
          </dl>
          <p>{{ t('project.error.untouched') }}</p>
        </template>
        <template v-else-if="openError.kind === 'migration-failed'">
          <p>{{ openError.message }}</p>
          <p>{{ t('project.error.asItWas') }}</p>
        </template>
        <p v-else>{{ openError.message }}</p>
      </QCardSection>
      <QCardActions align="right">
        <QBtn
          unelevated
          no-caps
          color="primary"
          autofocus
          :label="t('project.close')"
          @click="dismissError"
        />
      </QCardActions>
    </QCard>
  </QDialog>

  <QDialog :model-value="!!externalFirst" persistent>
    <QCard class="dialog" role="alertdialog" aria-labelledby="dlg-ext-title">
      <QCardSection v-if="externalFirst">
        <h2 id="dlg-ext-title" class="dlg-title">
          {{ t('project.external.title', { file: externalFirst.path }) }}
        </h2>
        <p>{{ t('project.external.body') }}</p>
        <p v-if="externalPrompts.length > 1">
          {{ t('project.external.more', { n: externalPrompts.length - 1 }) }}
        </p>
      </QCardSection>
      <QCardActions v-if="externalFirst" align="right">
        <QBtn
          flat
          no-caps
          :label="t('project.external.keep')"
          @click="store.resolveExternal(externalFirst.path, 'keep')"
        />
        <QBtn
          unelevated
          no-caps
          color="primary"
          autofocus
          :label="t('project.external.reload')"
          @click="store.resolveExternal(externalFirst.path, 'reload')"
        />
      </QCardActions>
    </QCard>
  </QDialog>

  <QDialog :model-value="manifestChanged && !openError" persistent>
    <QCard class="dialog" role="alertdialog" aria-labelledby="dlg-manifest-title">
      <QCardSection>
        <h2 id="dlg-manifest-title" class="dlg-title">{{ t('project.manifest.title') }}</h2>
        <p>{{ t('project.manifest.body') }}</p>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('project.manifest.keep')" @click="store.keepManifest()" />
        <QBtn
          unelevated
          no-caps
          color="primary"
          autofocus
          :label="t('project.manifest.reload')"
          @click="store.reloadManifest()"
        />
      </QCardActions>
    </QCard>
  </QDialog>

  <div v-if="showTakeover" class="note" role="status" data-testid="takeover-note">
    <span>{{ t('project.lockTookOver') }}</span>
    <QBtn flat dense round icon="close" :aria-label="t('settings.dismiss')" @click="hideTakeover" />
  </div>
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
.dlg-path,
.dlg-facts code {
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}
.dlg-path {
  color: var(--text-secondary);
}
.dlg-facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 0.75rem;
  margin: 0.5rem 0;
}
.dlg-facts dt {
  color: var(--text-secondary);
}
.dlg-facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.note {
  position: fixed;
  inset: auto 1rem 1rem auto;
  z-index: 6000;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 24rem;
  padding: 0.5rem 0.5rem 0.5rem 0.875rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
}
</style>
