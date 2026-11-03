<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { conditionOf, makeTerm, newTerm, retargetTerm } from '../../game/conditionEdit'
import { opsFor, useMismatch } from '../../game/conditions'
import type { Condition, Term, TermOp } from '../../project/schemas/condition'
import { useVariablesStore } from '../../variables/store'
import UseBadge from './UseBadge.vue'
import ValueInput from './ValueInput.vue'
import VariableSelect from './VariableSelect.vue'

const props = defineProps<{
  modelValue: Condition | undefined
  /** What the condition controls; names the group and its fields. */
  label: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Condition | undefined] }>()
const { t } = useI18n()
const vars = useVariablesStore()
const uid = useId()

const variables = computed(() => vars.variables)
const varOf = (id: string) => variables.value.find((v) => v.id === id)
const hasValue = (term: Term): term is Term & { value: number | string } => 'value' in term
const valueOf = (term: Term) => (hasValue(term) ? term.value : undefined)

function opsOf(term: Term): readonly TermOp[] {
  const v = varOf(term.variableId)
  const ops = v ? opsFor(v.type) : []
  return ops.includes(term.op) ? ops : [...ops, term.op]
}

function emitTerms(terms: readonly Term[], mode = props.modelValue?.mode ?? 'all'): void {
  emit('update:modelValue', conditionOf(mode, terms))
}
const terms = computed(() => props.modelValue?.terms ?? [])
const replace = (i: number, term: Term) => emitTerms(terms.value.map((x, j) => (j === i ? term : x)))

function add(): void {
  const first = variables.value[0]
  if (first) emitTerms([...terms.value, newTerm(first)])
}
function pickVariable(i: number, id: string): void {
  const v = varOf(id)
  if (v) replace(i, retargetTerm(terms.value[i], v))
}
function pickOp(i: number, op: string): void {
  const v = varOf(terms.value[i].variableId)
  if (v) replace(i, makeTerm(v, op as TermOp, valueOf(terms.value[i])))
}
function pickValue(i: number, value: boolean | number | string): void {
  const v = varOf(terms.value[i].variableId)
  if (v) replace(i, makeTerm(v, terms.value[i].op, value))
}
</script>

<template>
  <div class="cond" role="group" :aria-label="label">
    <template v-if="modelValue">
      <div class="mode">
        <label :for="`${uid}-mode`">{{ t('game.conversation.condition.mode') }}</label>
        <select
          :id="`${uid}-mode`"
          class="control"
          :value="modelValue.mode"
          :disabled="disabled"
          @change="emitTerms(terms, ($event.target as HTMLSelectElement).value as Condition['mode'])"
        >
          <option value="all">{{ t('game.conversation.condition.all') }}</option>
          <option value="any">{{ t('game.conversation.condition.any') }}</option>
        </select>
      </div>
      <ul class="terms">
        <li v-for="(term, i) in terms" :key="i" class="term">
          <VariableSelect
            :model-value="term.variableId"
            :variables="variables"
            :label="`${t('game.conversation.condition.variable')} ${i + 1}`"
            :disabled="disabled"
            @update:model-value="pickVariable(i, $event)"
          />
          <template v-if="varOf(term.variableId)">
            <select
              class="control"
              :aria-label="`${t('game.conversation.condition.operator')} ${i + 1}`"
              :value="term.op"
              :disabled="disabled"
              @change="pickOp(i, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="op in opsOf(term)" :key="op" :value="op">
                {{ t(`game.conversation.op.${op}`) }}
              </option>
            </select>
            <ValueInput
              v-if="hasValue(term)"
              :type="varOf(term.variableId)!.type"
              :model-value="term.value"
              :label="`${t('game.conversation.condition.value')} ${i + 1}`"
              :disabled="disabled"
              @update:model-value="pickValue(i, $event)"
            />
          </template>
          <UseBadge :problem="useMismatch(varOf(term.variableId), term)" />
          <QBtn
            flat
            dense
            round
            icon="close"
            :aria-label="`${t('game.conversation.condition.remove')} ${i + 1}`"
            :title="t('game.conversation.condition.remove')"
            :disable="disabled"
            @click="emitTerms(terms.filter((_, j) => j !== i))"
          />
        </li>
      </ul>
      <QBtn
        flat
        dense
        no-caps
        icon="add"
        :label="t('game.conversation.condition.addTerm')"
        :disable="disabled || !variables.length"
        @click="add"
      />
    </template>
    <QBtn
      v-else
      flat
      dense
      no-caps
      icon="add"
      :label="t('game.conversation.condition.add')"
      :disable="disabled || !variables.length"
      @click="add"
    />
    <p v-if="!variables.length && !modelValue" class="note">
      {{ t('game.conversation.condition.noVariables') }}
    </p>
  </div>
</template>

<style scoped>
.cond {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
}
.mode {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}
.terms {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.term {
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
