import { useI18n } from 'vue-i18n'
import { firstLineText } from '../../game/conditionEdit'
import type { NodeType } from '../../game/conversationGraph'
import type { ConversationNode } from '../../project/schemas/conversation'

export const NODE_TYPES: readonly NodeType[] = ['lines', 'choice', 'jump', 'end']

export const NODE_ICON: Record<NodeType, string> = {
  lines: 'chat_bubble_outline',
  choice: 'call_split',
  jump: 'subdirectory_arrow_right',
  end: 'stop_circle',
}

/** Existing colour tokens, one per node type. */
export const NODE_COLOR: Record<NodeType, string> = {
  lines: 'var(--tag-scene)',
  choice: 'var(--tag-event)',
  jump: 'var(--tag-rule)',
  end: 'var(--tag-character)',
}

/** "Lines: Hello there", "Choice: 3 options", "End" (also the canvas node's accessible name). */
export function useNodeLabel(): (n: ConversationNode) => string {
  const { t } = useI18n()
  return (n) => {
    const type = t(`game.conversation.type.${n.type}`)
    if (n.type === 'lines')
      return `${type}: ${firstLineText(n.content) || t('game.conversation.summary.emptyLines')}`
    if (n.type === 'choice')
      return `${type}: ${t('game.conversation.summary.options', { n: n.options.length }, n.options.length)}`
    return type
  }
}
