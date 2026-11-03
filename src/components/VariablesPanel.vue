<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MechanicsUsing from './gamedoc/MechanicsUsing.vue'
import { mechanicLinkCount } from '../project/mechanicImpact'
import { pendingVariableId } from '../composables/variablesPanel'
import { useMechanicsStore } from '../gamedoc/mechanicsStore'
import { useVariablesStore, type VariableOutcome } from '../variables/store'
import { VARIABLE_TYPES, type Variable, type VariableType } from '../project/schemas/variables'

const { t } = useI18n()
const vars = useVariablesStore()
const mechanics = useMechanicsStore()

const locked = computed(() => !!vars.readOnly || (vars.status !== 'none' && vars.status !== 'ok'))
const newName = ref('')
const newType = ref<VariableType>('flag')
const error = ref('')
const confirmId = ref<string | null>(null)
const confirmUses = ref(0)
const confirmMechanics = computed(() =>
  confirmId.value ? mechanicLinkCount('variable', confirmId.value, mechanics.mechanics) : 0,
)
const confirmName = computed(() => vars.variables.find((v) => v.id === confirmId.value)?.name ?? '')

function report(r: VariableOutcome): boolean {
  error.value = r.ok ? '' : t(`variables.error.${r.reason}`)
  return r.ok
}

async function add(): Promise<void> {
  if (report(await vars.add(newName.value, newType.value))) newName.value = ''
}
const rename = (v: Variable, e: Event) => {
  const el = e.target as HTMLInputElement
  if (!report(vars.rename(v.id, el.value))) el.value = v.name
}
const retype = (v: Variable, e: Event) =>
  report(vars.retype(v.id, (e.target as HTMLSelectElement).value as VariableType))
function setDefault(v: Variable, e: Event): void {
  const el = e.target as HTMLInputElement
  const value = v.type === 'flag' ? el.checked : v.type === 'number' ? Number(el.value) : el.value
  if (!report(vars.setDefault(v.id, value)) && v.type !== 'flag') el.value = String(v.default)
}
async function askDelete(id: string): Promise<void> {
  confirmUses.value = await vars.countVariableUses(id)
  confirmId.value = id
}
function remove(): void {
  if (confirmId.value) report(vars.remove(confirmId.value))
  confirmId.value = null
  void nextTick(() => addNameEl.value?.focus())
}

const addNameEl = useTemplateRef<HTMLInputElement>('addNameEl')
const tableEl = useTemplateRef<HTMLElement>('tableEl')
const flashId = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | undefined

// A mechanic link opened this panel on one variable: show and focus its row.
watch(
  [pendingVariableId, () => vars.variables.length],
  async ([id]) => {
    if (!id) return
    await nextTick()
    const row = tableEl.value?.querySelector<HTMLElement>(`[data-var="${CSS.escape(id)}"]`)
    if (!row) return
    pendingVariableId.value = null
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    row.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
    row.querySelector<HTMLElement>('input')?.focus({ preventScroll: true })
    flashId.value = id
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (flashId.value = null), 2400)
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <section class="vars" :aria-labelledby="'vars-title'" data-testid="variables-panel">
    <h2 id="vars-title">{{ t('variables.title') }}</h2>
    <p class="hint">{{ t('variables.hint') }}</p>

    <p v-if="vars.status === 'invalid' || vars.status === 'missing'" class="notice" role="alert">
      {{ t(`variables.${vars.status}`) }}
      <code v-if="vars.error?.message">{{ vars.error.message }}</code>
    </p>
    <p v-else-if="vars.readOnly" class="notice">{{ t('variables.readOnly') }}</p>

    <form class="add" @submit.prevent="add">
      <label>
        <span>{{ t('variables.name') }}</span>
        <input ref="addNameEl" v-model="newName" type="text" :disabled="locked" autocomplete="off" />
      </label>
      <label>
        <span>{{ t('variables.type') }}</span>
        <select v-model="newType" :disabled="locked">
          <option v-for="ty in VARIABLE_TYPES" :key="ty" :value="ty">{{ t(`variables.types.${ty}`) }}</option>
        </select>
      </label>
      <button type="submit" :disabled="locked || newName.trim() === ''">{{ t('variables.add') }}</button>
    </form>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <p v-if="vars.variables.length === 0" class="empty">{{ t('variables.empty') }}</p>
    <table v-else ref="tableEl" class="list">
      <caption class="sr-only">{{ t('variables.title') }}</caption>
      <thead>
        <tr>
          <th scope="col">{{ t('variables.name') }}</th>
          <th scope="col">{{ t('variables.type') }}</th>
          <th scope="col">{{ t('variables.default') }}</th>
          <th scope="col">{{ t('variables.mechanics') }}</th>
          <th scope="col"><span class="sr-only">{{ t('variables.actions') }}</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="v in vars.variables"
          :key="v.id"
          :data-var="v.id"
          :class="{ flash: flashId === v.id }"
        >
          <td>
            <input
              :value="v.name"
              type="text"
              :disabled="locked"
              :aria-label="t('variables.nameOf', { name: v.name })"
              autocomplete="off"
              @change="rename(v, $event)"
            />
          </td>
          <td>
            <select
              :value="v.type"
              :disabled="locked"
              :aria-label="t('variables.typeOf', { name: v.name })"
              @change="retype(v, $event)"
            >
              <option v-for="ty in VARIABLE_TYPES" :key="ty" :value="ty">{{ t(`variables.types.${ty}`) }}</option>
            </select>
          </td>
          <td>
            <input
              v-if="v.type === 'flag'"
              type="checkbox"
              :checked="v.default"
              :disabled="locked"
              :aria-label="t('variables.defaultOf', { name: v.name })"
              @change="setDefault(v, $event)"
            />
            <input
              v-else
              :type="v.type === 'number' ? 'number' : 'text'"
              :value="v.default"
              :disabled="locked"
              :aria-label="t('variables.defaultOf', { name: v.name })"
              @change="setDefault(v, $event)"
            />
          </td>
          <td>
            <MechanicsUsing :id="v.id" kind="variable" />
          </td>
          <td>
            <button
              type="button"
              class="del"
              :disabled="locked"
              :aria-label="t('variables.delete', { name: v.name })"
              :title="t('variables.delete', { name: v.name })"
              @click="askDelete(v.id)"
            >
              <QIcon name="delete" size="1rem" aria-hidden="true" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <QDialog :model-value="confirmId !== null" @update:model-value="confirmId = null">
      <QCard class="confirm" role="alertdialog" aria-labelledby="vars-del-title">
        <QCardSection>
          <h2 id="vars-del-title" class="confirm-title">{{ t('variables.deleteTitle') }}</h2>
          <p>{{ t('variables.deleteBody', { name: confirmName }) }}</p>
          <p v-if="confirmUses > 0">{{ t('variables.deleteUses', confirmUses) }}</p>
          <p v-if="confirmMechanics > 0">
            {{ t('deleteImpact.mechanics', { n: confirmMechanics }, confirmMechanics) }}
          </p>
        </QCardSection>
        <QCardActions align="right">
          <QBtn flat no-caps autofocus :label="t('write.cancel')" @click="confirmId = null" />
          <QBtn unelevated no-caps color="negative" :label="t('write.delete')" @click="remove" />
        </QCardActions>
      </QCard>
    </QDialog>
  </section>
</template>

<style scoped>
.vars {
  max-width: 44rem;
  margin: 0 auto;
  padding: 1.5rem;
  color: var(--text-primary);
}
h2 {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}
.hint,
.empty {
  color: var(--text-secondary);
}
.notice {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
}
.notice code {
  display: block;
  margin-top: 0.25rem;
  overflow-wrap: anywhere;
}
.add {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: end;
  margin: 1rem 0 0.5rem;
}
.add label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}
input[type='text'],
input[type='number'],
select {
  box-sizing: border-box;
  min-height: 2rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-raised);
  color: var(--text-primary);
  font: inherit;
}
button[type='submit'] {
  min-height: 2rem;
  padding: 0 0.875rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-selected);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
button:disabled,
input:disabled,
select:disabled {
  opacity: 0.5;
}
.error {
  margin: 0.25rem 0;
  color: var(--text-primary);
  font-weight: 600;
}
.list {
  width: 100%;
  margin-top: 1rem;
  border-collapse: collapse;
}
th {
  padding: 0.25rem 0.5rem;
  text-align: start;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
}
td {
  padding: 0.25rem 0.5rem;
  border-top: 1px solid var(--border-strong);
}
.flash td {
  background: var(--bg-selected);
  border-block: 2px solid var(--focus-ring);
}
td input[type='text'],
td input[type='number'] {
  width: 100%;
}
.del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid transparent;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}
.del:hover:not(:disabled) {
  background: var(--bg-selected);
}
input:focus-visible,
select:focus-visible,
button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
