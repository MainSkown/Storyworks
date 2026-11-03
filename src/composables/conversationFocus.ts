import { ref } from 'vue'

/** Set by a search hit; the conversation view selects the node once it is showing that conversation. */
export const pendingConversationNode = ref<{ conversationId: string; nodeId: string } | null>(null)
