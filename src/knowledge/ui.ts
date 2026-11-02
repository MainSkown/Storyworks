import { ref } from 'vue'

/** The item open on the Knowledge page; other places set it before going there. */
export const selectedItemId = ref<string | null>(null)

/** Goes to the Knowledge page with the item selected. */
export async function openItem(id: string): Promise<void> {
  selectedItemId.value = id
  // Imported lazily: the router pulls in the views that use this.
  const { router } = await import('../router')
  await router.push({ name: 'knowledge' })
}
