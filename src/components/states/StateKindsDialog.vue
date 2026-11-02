<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import { useCodexStore } from '../../codex/store'
import { useStatesStore } from '../../states/store'
import type { StateKind } from '../../project/schemas/stateKind'
import InvalidFiles from '../relations/InvalidFiles.vue'

const open = defineModel<boolean>({ required: true })
const { t } = useI18n()
const store = useStatesStore()
const codex = useCodexStore()

const newName = ref('')
const newType = ref<StateKind['valueType']>('text')
const newExclusive = ref(false)
const rowError = reactive<Record<string, string>>({})

const locked = computed(() => !!store.readOnly)
const invalid = computed(() => store.kindList.filter((e) => e.status !== 'ok'))
const useCount = (kindId: string) =>
  codex.entries.reduce((n, e) => n + e.states.filter((s) => s.kindId === kindId).length, 0)
const typeOptions = computed(() => [
  { value: 'text', label: t('stateKinds.text') },
  { value: 'entry', label: t('stateKinds.entry') },
])

function notifyFail(): void {
  Notify.create({ type: 'negative', message: t('stateKinds.failed'), position: 'bottom', timeout: 5000 })
}

async function add(): Promise<void> {
  const id = await store.createKind(newName.value, { valueType: newType.value, exclusive: newExclusive.value })
  if (!id) return notifyFail()
  newName.value = ''
  newExclusive.value = false
}

const kindOf = (id: string) => store.kinds.find((k) => k.id === id)
function rename(id: string, ev: Event): void {
  const input = ev.target as HTMLInputElement
  if (!store.updateKind(id, { name: input.value }).ok) input.value = kindOf(id)?.name ?? ''
}
function setType(id: string, ev: Event): void {
  const sel = ev.target as HTMLSelectElement
  const r = store.updateKind(id, { valueType: sel.value as StateKind['valueType'] })
  if (r.ok) delete rowError[id]
  else {
    sel.value = kindOf(id)?.valueType ?? 'text'
    rowError[id] = r.reason === 'kind-in-use' ? t('stateKinds.inUse') : t('stateKinds.failed')
  }
}
function setExclusive(id: string, v: boolean): void {
  if (!store.updateKind(id, { exclusive: v }).ok) notifyFail()
}

// ---- delete ----
const deleteId = ref<string | null>(null)
const target = ref<string | null>(null)
const deleting = computed(() => (deleteId.value ? (kindOf(deleteId.value) ?? null) : null))
const moving = computed(() => (deleteId.value ? useCount(deleteId.value) : 0))
const targets = computed(() =>
  store.kinds.filter((k) => k.id !== deleteId.value).map((k) => ({ value: k.id, label: k.name })),
)
const plan = computed(() => (deleteId.value ? store.planDeleteKind(deleteId.value, target.value) : null))
const canDelete = computed(() => !!plan.value?.ok)
const typeChanges = computed(() => (plan.value?.ok ? plan.value.valueTypeChanges : 0))

function askDelete(id: string): void {
  deleteId.value = id
  target.value = store.kinds.find((k) => k.id !== id)?.id ?? null
}
async function doDelete(): Promise<void> {
  const id = deleteId.value
  if (!id) return
  deleteId.value = null
  const r = await store.deleteKind(id, target.value)
  if (!r.ok) notifyFail()
}
</script>

<template>
  <QDialog v-model="open">
    <QCard class="dialog" role="dialog" aria-labelledby="state-kinds-title">
      <QCardSection>
        <h2 id="state-kinds-title" class="title">{{ t('stateKinds.title') }}</h2>
        <ul class="list">
          <li v-for="k in store.kinds" :key="k.id" class="item">
            <div class="row">
              <input
                class="name"
                :value="k.name"
                :aria-label="t('stateKinds.name', { name: k.name })"
                :readonly="locked"
                @change="rename(k.id, $event)"
                @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
              />
              <select
                class="type"
                :value="k.valueType"
                :aria-label="t('stateKinds.valueType', { name: k.name })"
                :aria-describedby="rowError[k.id] ? `kind-err-${k.id}` : undefined"
                :disabled="locked || useCount(k.id) > 0"
                @change="setType(k.id, $event)"
              >
                <option v-for="o in typeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <QCheckbox
                :model-value="k.exclusive"
                :label="t('stateKinds.exclusiveLabel')"
                :aria-label="t('stateKinds.exclusive', { name: k.name })"
                :disable="locked"
                dense
                @update:model-value="setExclusive(k.id, $event)"
              />
              <span class="count">{{ t('stateKinds.count', useCount(k.id)) }}</span>
              <QBtn
                flat
                round
                dense
                icon="delete_outline"
                :aria-label="t('stateKinds.delete', { name: k.name })"
                :disable="locked"
                @click="askDelete(k.id)"
              />
            </div>
            <p v-if="rowError[k.id]" :id="`kind-err-${k.id}`" class="error" role="alert">
              <QIcon name="error_outline" size="1rem" aria-hidden="true" />
              {{ rowError[k.id] }}
            </p>
            <p v-else-if="useCount(k.id) > 0" class="muted">{{ t('stateKinds.inUse') }}</p>
          </li>
        </ul>
        <p v-if="!store.kinds.length" class="muted">{{ t('stateKinds.none') }}</p>
        <p class="muted">{{ t('stateKinds.exclusiveHint') }}</p>
        <form v-if="!locked" class="row add" @submit.prevent="add">
          <input
            v-model="newName"
            class="name"
            :placeholder="t('stateKinds.newName')"
            :aria-label="t('stateKinds.newName')"
          />
          <select v-model="newType" class="type" :aria-label="t('stateKinds.newType')">
            <option v-for="o in typeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <QCheckbox v-model="newExclusive" :label="t('stateKinds.newExclusive')" dense />
          <QBtn
            unelevated
            no-caps
            type="submit"
            class="btn-section"
            :label="t('stateKinds.add')"
            :disable="!newName.trim()"
          />
        </form>
        <InvalidFiles :items="invalid" :heading="t('stateKinds.invalidHeading')" />
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('stateKinds.close')" @click="open = false" />
      </QCardActions>
    </QCard>
  </QDialog>

  <QDialog :model-value="!!deleting" @update:model-value="deleteId = null">
    <QCard v-if="deleting" class="dialog small" role="alertdialog" aria-labelledby="state-kind-del-title">
      <QCardSection>
        <h2 id="state-kind-del-title" class="title">
          {{ t('stateKinds.deleteTitle', { name: deleting.name }) }}
        </h2>
        <p v-if="moving === 0">{{ t('stateKinds.deleteEmpty') }}</p>
        <template v-else>
          <p>{{ t('stateKinds.deleteMoves', moving) }}</p>
          <QSelect
            v-model="target"
            :options="targets"
            :label="t('stateKinds.moveTo')"
            outlined
            dense
            emit-value
            map-options
            options-dense
          />
          <p v-if="typeChanges > 0" class="warn" role="alert">
            <QIcon name="warning" size="1rem" aria-hidden="true" />
            {{ t('stateKinds.deleteTypeChange') }}
          </p>
        </template>
      </QCardSection>
      <QCardActions align="right">
        <QBtn flat no-caps :label="t('stateKinds.cancel')" @click="deleteId = null" />
        <QBtn
          flat
          no-caps
          color="negative"
          :label="t('stateKinds.deleteConfirm')"
          :disable="!canDelete"
          @click="doDelete"
        />
      </QCardActions>
    </QCard>
  </QDialog>
</template>

<style scoped>
.dialog {
  min-width: min(46rem, 94vw);
  background: var(--bg-raised);
  color: var(--text-primary);
}
.dialog.small {
  min-width: min(26rem, 90vw);
}
.title {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.item {
  padding: 0.25rem 0;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.add {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}
.name,
.type {
  box-sizing: border-box;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.name {
  flex: 1;
  min-width: 8rem;
}
.name:focus-visible,
.type:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.type:disabled {
  opacity: 0.7;
}
.count,
.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
.count {
  flex: none;
  min-width: 7rem;
  text-align: end;
}
.error,
.warn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  font-weight: 600;
}
.error {
  color: var(--section-checks);
}
.warn {
  color: var(--text-primary);
}
.btn-section {
  background: var(--section-codex);
  color: var(--section-codex-on);
}
</style>
