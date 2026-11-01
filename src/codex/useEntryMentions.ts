import { ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import { useProjectStore } from '../project/store'
import { scanMentions } from './mentionActions'
import type { Mention } from './mentions'

interface Scannable {
  id: string
  name: string
  aliases: string[]
}

/** Mentions of the entry, rescanned (debounced) when its names, any scene's links/text or the ignored list change. */
export function useEntryMentions(entry: () => Scannable | null) {
  const project = useProjectStore()
  const mentions = shallowRef<Mention[]>([])
  const loading = ref(false)
  let token = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  async function rescan(): Promise<void> {
    clearTimeout(timer)
    const e = entry()
    const mine = ++token
    if (!e) {
      mentions.value = []
      loading.value = false
      return
    }
    loading.value = true
    try {
      const r = await scanMentions({ id: e.id, name: e.name, aliases: [...e.aliases] })
      if (mine === token) mentions.value = r
    } catch (err) {
      console.error('Mention scan failed', err)
      if (mine === token) mentions.value = []
    } finally {
      if (mine === token) loading.value = false
    }
  }

  watch(
    () => {
      const e = entry()
      return [
        e?.id,
        e?.name,
        e?.aliases.join('\u0000'),
        project.linkRevision,
        project.ignoredIds,
      ] as const
    },
    () => {
      clearTimeout(timer)
      timer = setTimeout(rescan, 300)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    clearTimeout(timer)
    token++
  })

  return { mentions, loading, rescan }
}
