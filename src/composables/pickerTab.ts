import { ref } from 'vue'

export type PickerTab = 'events' | 'codex'

/** The tab of the "Link to…" picker last used this session. */
export const lastPickerTab = ref<PickerTab>('events')
