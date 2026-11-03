import { useI18n } from 'vue-i18n'
import type { Condition } from '../project/schemas/condition'
import { useVariablesStore } from '../variables/store'
import { conditionText } from './conditionText'

/** Condition → readable text with the current variable names and language. */
export function useConditionText(): (c: Condition) => string {
  const { t } = useI18n()
  const vars = useVariablesStore()
  return (c) =>
    conditionText(c, {
      variable: (id) => vars.variables.find((v) => v.id === id)?.name,
      op: (op) => t(`game.conversation.op.${op}`),
      deleted: t('game.conversation.playthrough.deletedVariable'),
      and: t('game.conversation.playthrough.and'),
      or: t('game.conversation.playthrough.or'),
    })
}
