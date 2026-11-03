import { useMechanicsStore } from './mechanicsStore'

/** Goes to the Game document's Mechanics tab with the mechanic selected. */
export async function openMechanic(id: string): Promise<void> {
  // Imported lazily: the router pulls in the views that use this.
  const { router } = await import('../router')
  await router.push({ name: 'gamedoc', query: { tab: 'mechanics' } })
  const store = useMechanicsStore()
  if (store.filterActive && !store.filteredMechanics.some((m) => m.id === id)) store.clearFilter()
  store.select(id)
}
