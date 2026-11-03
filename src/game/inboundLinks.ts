import type { Conversation } from '../project/schemas/conversation'
import { linksOf } from './crossLinks'

/** Cross-item links in other conversations that point at any of these items (deleting breaks them). */
export function inboundLinks(conversations: readonly Conversation[], itemIds: readonly string[]): number {
  const gone = new Set(itemIds)
  return conversations
    .filter((c) => !gone.has(c.id))
    .reduce((n, c) => n + linksOf(c).filter((l) => gone.has(l.link.itemId)).length, 0)
}
