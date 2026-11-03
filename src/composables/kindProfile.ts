import { computed } from 'vue'
import { kindProfile, nodeKindLabel } from '../project/kinds'
import { useProjectStore } from '../project/store'

/** Profile of the open project's kind (book when none is open). */
export function useKindProfile() {
  const store = useProjectStore()
  const kind = computed(() => store.project?.manifest.kind ?? 'book')
  return {
    kind,
    profile: computed(() => kindProfile(kind.value)),
    nodeLabel: (type: 'part' | 'chapter' | 'scene') => nodeKindLabel(kind.value, type),
  }
}
