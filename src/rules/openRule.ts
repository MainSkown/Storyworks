import { useRulesStore } from './store'

/** Goes to the Rules section with the rule selected. */
export async function openRule(id: string): Promise<void> {
  // Imported lazily: the router pulls in the views that use this.
  const { router } = await import('../router')
  await router.push({ name: 'rules' })
  useRulesStore().select(id)
}
