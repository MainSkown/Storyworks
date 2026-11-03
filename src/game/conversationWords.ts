import { countWords } from '../editor/wordCount'
import type { Conversation } from '../project/schemas/conversation'

/** Game words of a conversation: the line text of every Lines node (no speakers, no options). */
export const conversationWords = (c: Conversation): number =>
  c.nodes.reduce((sum, n) => sum + (n.type === 'lines' ? countWords(n.content) : 0), 0)
