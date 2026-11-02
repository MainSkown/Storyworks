<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { describeError } from '../history/errorText'
import { localStamp } from '../history/stamp'
import { useHistoryStore } from '../history/store'

const open = defineModel<boolean>({ required: true })
const { t, te } = useI18n()
const router = useRouter()
const history = useHistoryStore()

const message = ref('')
const problem = ref('')
const hasChanges = computed(() => history.changeCount > 0)

watch(open, (v) => {
  if (!v) return
  message.value = ''
  problem.value = ''
  void history.refresh()
})

async function save(): Promise<void> {
  problem.value = ''
  try {
    await history.snapshotAll(message.value || localStamp())
    open.value = false
  } catch (e) {
    problem.value = describeError(e, (k) => t(k), (k) => te(k))
  }
}
function choose(): void {
  open.value = false
  void router.push({ name: 'history', query: { tab: 'changes' } })
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="snap-title">
      <QCardSection>
        <h2 id="snap-title" class="title">{{ t('history.dialog.title') }}</h2>
        <p>{{ t('history.dialog.body') }}</p>
        <p class="count" role="status">
          {{ hasChanges ? t('history.changes.count', history.changeCount) : t('history.dialog.none') }}
        </p>
        <QInput
          v-model="message"
          dense
          outlined
          autofocus
          :label="t('history.changes.message')"
          :hint="t('history.changes.messageHint')"
          @keydown.enter.prevent="hasChanges && !history.busy ? save() : undefined"
        />
        <p v-if="problem" class="err" role="alert">{{ problem }}</p>
        <QBtn flat dense no-caps class="choose" :label="t('history.dialog.choose')" @click="choose" />
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('history.dialog.cancel')" @click="open = false" />
        <QBtn
          unelevated
          no-caps
          color="primary"
          :label="t('history.dialog.save')"
          :disable="!hasChanges"
          :loading="history.busy"
          @click="save"
        />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  min-width: min(28rem, 90vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.title {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.count {
  font-weight: 600;
}
.err {
  margin: 0.5rem 0 0;
  color: var(--text-primary);
  border: 1px solid var(--section-checks);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}
.choose {
  margin-top: 0.5rem;
  margin-inline-start: -0.5rem;
}
</style>
