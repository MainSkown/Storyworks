import { useCodexStore } from './store'

/** Goes to the Codex section with the entry selected. */
export async function openEntry(id: string): Promise<void> {
  // Imported lazily: the router pulls in the views that use this.
  const { router } = await import('../router')
  await router.push({ name: 'codex' })
  useCodexStore().select(id)
}
