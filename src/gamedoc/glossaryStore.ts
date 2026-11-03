import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { newId } from '../project/ids'
import type { ItemStatus } from '../project/rules'
import {
  GLOSSARY_FILE,
  GLOSSARY_VERSION,
  glossarySchema,
  type Glossary,
  type GlossaryEntry,
} from '../project/schemas/glossary'
import { parseFile } from '../project/serialize'
import { useProjectStore } from '../project/store'
import type { FileError } from '../project/types'

export const useGlossaryStore = defineStore('glossary', () => {
  const projectStore = useProjectStore()

  const doc = shallowRef<Glossary | null>(null)
  const status = ref<'none' | ItemStatus>('none')
  const error = ref<FileError | null>(null)
  let seen = -1

  /** Entries in file order; the view sorts them for display. */
  const entries = computed<GlossaryEntry[]>(() => doc.value?.entries ?? [])
  const readOnly = computed(() => projectStore.readOnly)

  function set(next: Glossary | null, st: 'none' | ItemStatus, err: FileError | null = null) {
    doc.value = next
    status.value = st
    error.value = err
  }

  async function load(): Promise<void> {
    const p = projectStore.project
    const r = p?.manifest.glossary
    if (!p || !r) return set(null, 'none')
    const text = await p.io.readText(r.path)
    seen = projectStore.itemVersion(r.path)
    if (text === null) return set(null, 'missing')
    const parsed = parseFile(glossarySchema, text, r.path)
    if (parsed.ok) set(parsed.value, 'ok')
    else set(null, 'invalid', parsed.error)
  }

  function reset(): void {
    set(null, 'none')
    seen = -1
  }

  watch(
    () => {
      const r = projectStore.project?.manifest.glossary
      return r ? projectStore.itemVersion(r.path) : -1
    },
    async (version) => {
      if (version !== -1 && version !== seen) await load()
    },
  )

  const canEdit = () => {
    const p = projectStore.project
    return !!p && !p.readOnly && p.manifest.kind === 'game' && (status.value === 'none' || status.value === 'ok')
  }

  /** Saves a changed list; the file is created on the first change. */
  async function commit(entriesNext: GlossaryEntry[]): Promise<boolean> {
    const p = projectStore.project
    if (!p || !canEdit()) return false
    const next: Glossary = { version: GLOSSARY_VERSION, entries: entriesNext }
    if (!glossarySchema.safeParse(next).success) return false
    const ref = p.manifest.glossary
    if (ref) {
      if (!projectStore.updateItem(ref.path, glossarySchema, next)) return false
    } else {
      await p.saveItem(GLOSSARY_FILE, glossarySchema, next)
      projectStore.setGlossaryRef({ id: newId(), path: GLOSSARY_FILE, title: 'Glossary' })
      seen = projectStore.itemVersion(GLOSSARY_FILE)
    }
    set(next, 'ok')
    return true
  }

  /** New entry; null = refused (read-only, empty term, invalid file). */
  async function add(term: string, definition = ''): Promise<string | null> {
    const clean = term.trim()
    if (!clean) return null
    const id = newId()
    return (await commit([...entries.value, { id, term: clean, definition }])) ? id : null
  }

  function update(id: string, patch: Partial<Pick<GlossaryEntry, 'term' | 'definition'>>): boolean {
    const cur = entries.value.find((e) => e.id === id)
    if (!cur || status.value !== 'ok') return false
    const term = patch.term === undefined ? cur.term : patch.term.trim()
    if (!term) return false
    const next: Glossary = {
      version: GLOSSARY_VERSION,
      entries: entries.value.map((e) => (e.id === id ? { ...e, ...patch, term } : e)),
    }
    const ref = projectStore.project?.manifest.glossary
    if (!ref || !canEdit() || !projectStore.updateItem(ref.path, glossarySchema, next)) return false
    set(next, 'ok')
    return true
  }

  function remove(id: string): boolean {
    if (!entries.value.some((e) => e.id === id) || status.value !== 'ok') return false
    const next: Glossary = { version: GLOSSARY_VERSION, entries: entries.value.filter((e) => e.id !== id) }
    const ref = projectStore.project?.manifest.glossary
    if (!ref || !canEdit() || !projectStore.updateItem(ref.path, glossarySchema, next)) return false
    set(next, 'ok')
    return true
  }

  return { entries, status, error, readOnly, load, reset, add, update, remove }
})
