import { ref } from 'vue'

/** Game: the Write stage shows the variable list instead of the selected item. */
export const variablesOpen = ref(false)

/** Variable a mechanic link opened; the panel scrolls to it, focuses it and clears this. */
export const pendingVariableId = ref<string | null>(null)
