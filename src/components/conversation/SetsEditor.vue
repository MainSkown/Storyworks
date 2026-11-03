<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { makeSet, newSet, retargetSet } from '../../game/conditionEdit'
import { setOpsFor, useMismatch } from '../../game/conditions'
import type { SetOp } from '../../project/schemas/condition'
import { useVariablesStore } from '../../variables/store'
import UseBadge from './UseBadge.vue'
import ValueInput from './ValueInput.vue'
import VariableSelect from './VariableSelect.vue'

const props = defineProps<{
  modelValue: readonly SetOp[]
  /** Names the group and its fields. */
  label: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: SetOp[]] }>()
const { t } = useI18n()
const vars = useVariablesStore()

const variables = computed(() => vars.variables)
const varOf = (id: string) => variables.value.find((v) => v.id === id)
const valueOf = (s: SetOp) => ('value' in s ? s.value : undefined)

function opsOf(s: SetOp): readonly SetOp['op'][] {
  const v = varOf(s.variableId)
  const ops = v ? setOpsFor(v.type) : []
  return ops.includes(s.op) ? ops : [...ops, s.op]
}
const replace = (i: number, s: SetOp) =>
  emit(
    'update:modelValue',
    props.modelValue.map((x, j) => (j === i ? s : x)),
  )

function add(): void {
  const first = variables.value[0]
  if (first) emit('update:modelValue', [...props.modelValue, newSet(first)])
}
function pickVariable(i: number, id: string): void {
  const v = varOf(id)
  if (v) replace(i, retargetSet(props.modelValue[i], v))
}
function pickOp(i: number, op: string): void {
  const v = varOf(props.modelValue[i].variableId)
  if (v) replace(i, makeSet(v, op as SetOp['op'], valueOf(props.modelValue[i])))
}
function pickValue(i: number, value: boolean | number | string): void {
  const v = varOf(props.modelValue[i].variableId)
  if (v) replace(i, makeSet(v, props.modelValue[i].op, value))
}
</script>

<template>
  <div class="sets" role="group" :aria-label="label">
    <ul v-if="modelValue.length" class="rows">
      <li v-for="(s, i) in modelValue" :key="i" class="row">
        <VariableSelect
          :model-value="s.variableId"
          :variables="variables"
          :label="`${t('game.conversation.condition.variable')} ${i + 1}`"
          :disabled="disabled"
          @update:model-value="pickVariable(i, $event)"
        />
        <template v-if="varOf(s.variableId)">
          <select
            class="control"
            :aria-label="`${t('game.conversation.condition.operator')} ${i + 1}`"
            :value="s.op"
            :disabled="disabled"
            @change="pickOp(i, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="op in opsOf(s)" :key="op" :value="op">
              {{ t(`game.conversation.op.${op}`) }}
            </option>
          </select>
          <ValueInput
            v-if="s.op !== 'toggle'"
            :type="s.op === 'add' ? 'number' : varOf(s.variableId)!.type"
            :model-value="s.value"
            :label="`${t('game.conversation.condition.value')} ${i + 1}`"
            :disabled="disabled"
            @update:model-value="pickValue(i, $event)"
          />
        </template>
        <UseBadge :problem="useMismatch(varOf(s.variableId), s)" />
        <QBtn
          flat
          dense
          round
          icon="close"
          :aria-label="`${t('game.conversation.setOps.remove')} ${i + 1}`"
          :title="t('game.conversation.setOps.remove')"
          :disable="disabled"
          @click="emit('update:modelValue', modelValue.filter((_, j) => j !== i))"
        />
      </li>
    </ul>
    <QBtn
      flat
      dense
      no-caps
      icon="add"
      :label="t('game.conversation.setOps.add')"
      :disable="disabled || !variables.length"
      @click="add"
    />
    <p v-if="!variables.length && !modelValue.length" class="note">
      {{ t('game.conversation.condition.noVariables') }}
    </p>
  </div>
</template>

<style scoped>
.sets {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
}
.control {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0.25rem 0.375rem;
  border: 1px solid var(--border-strong);
  border-radius: 0.375rem;
  background: var(--bg-sheet);
  color: var(--text-primary);
  font: inherit;
}
.control:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
.note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8125rem;
}
</style>
