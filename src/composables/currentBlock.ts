import { ref } from 'vue'

/** The paragraph holding the cursor in the open editor; null when no editor is showing a scene. */
export const currentBlock = ref<{ sceneId: string; blockId: string | null } | null>(null)
