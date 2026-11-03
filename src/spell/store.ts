import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useProjectStore } from '../project/store'
import { createBundledSource, createDictionaryStore } from './dictionaryStore'
import type { DictionaryInfo, DictionaryStore, ImportInput } from './dictionaryStore'
import { createCustomWords, type CustomWords } from './customWords'
import type { Misspelling } from './engine'
import { createGlobalDictStorage } from './globalStorage'
import { effectiveSelection, findMissing, refKey, withToggled } from './selection'
import type { DictRef, DictScope, DictStorage, LoadedDictionary } from './types'
import { createWorkerSpellClient } from './workerClient'

/** What the store needs from the (worker) engine. */
export interface SpellEngineClient {
  setDictionaries(selected: DictRef[], customWords: string[]): Promise<{ missing: DictRef[] }>
  checkText(text: string): Promise<Misspelling[]>
  suggest(word: string): Promise<string[]>
  invalidate(): Promise<void>
}

export interface SpellDeps {
  createEngine(load: (ref: DictRef) => Promise<LoadedDictionary | null>): SpellEngineClient
  globalStorage: DictStorage
  bundled?: Parameters<typeof createDictionaryStore>[0]['bundled']
}

const defaultDeps = (): SpellDeps => ({
  createEngine: (load) =>
    createWorkerSpellClient(
      new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
      load,
    ),
  globalStorage: createGlobalDictStorage(),
  bundled: createBundledSource(),
})

let depsFactory: () => SpellDeps = defaultDeps
/** Tests inject fakes here; the engine and global storage are created lazily. */
export function setSpellDepsFactory(f: () => SpellDeps): void {
  depsFactory = f
}
export function resetSpellDepsFactory(): void {
  depsFactory = defaultDeps
}

export const useSpellStore = defineStore('spell', () => {
  const project = useProjectStore()

  const infos = ref<DictionaryInfo[]>([])
  const listLoaded = ref(false)
  const customWords = ref<string[]>([])
  const engineMissing = ref<DictRef[]>([])
  const active = ref(false)
  /** Bumps whenever check results may differ (reload, ignore list). */
  const version = ref(0)
  const ignored = new Set<string>()

  let deps: SpellDeps | null = null
  let dicts: DictionaryStore | null = null
  let custom: CustomWords | null = null
  let engine: SpellEngineClient | null = null
  let started = false
  let queue: Promise<unknown> = Promise.resolve()

  function ensureDeps() {
    if (dicts) return
    deps = depsFactory()
    const local = () => {
      const io = project.projectIO()
      return io ? { io, readOnly: !!project.readOnly } : null
    }
    dicts = createDictionaryStore({ local, global: deps.globalStorage, bundled: deps.bundled })
    custom = createCustomWords(local)
  }

  const selectionInfo = computed(() => {
    void project.revision
    return effectiveSelection(
      project.dictionaries,
      project.project?.manifest.language ?? '',
    )
  })
  const selection = computed(() => selectionInfo.value.refs)
  /** True while the book has no selection of its own (language default in use). */
  const isDefault = computed(() => selectionInfo.value.isDefault)

  const missing = computed<DictRef[]>(() => {
    const out = new Map<string, DictRef>()
    const fromList = listLoaded.value ? findMissing(selection.value, infos.value) : []
    for (const r of [...fromList, ...engineMissing.value]) out.set(refKey(r), r)
    return [...out.values()]
  })

  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn)
    queue = run.catch(() => undefined)
    return run
  }

  /** Reads the dictionary list and the book's custom words (no worker needed). */
  function refresh(): Promise<void> {
    ensureDeps()
    return serial(async () => {
      if (!project.project) {
        infos.value = []
        customWords.value = []
        listLoaded.value = false
        return
      }
      infos.value = await dicts!.list()
      customWords.value = await custom!.load().catch(() => [])
      listLoaded.value = true
    })
  }

  /** Loads the selected dictionaries into the engine (lazy: only once started). */
  function reload(): Promise<void> {
    if (!started) return Promise.resolve()
    return serial(async () => {
      const refs = selection.value
      if (!project.project || refs.length === 0) {
        engineMissing.value = []
        active.value = false
        version.value++
        return
      }
      if (!engine) engine = deps!.createEngine((r) => dicts!.load(r))
      try {
        // plain copies: reactive proxies cannot be posted to a worker
        const plain = refs.map((r) => ({ name: r.name, scope: r.scope }))
        const { missing: gone } = await engine.setDictionaries(plain, [...customWords.value])
        engineMissing.value = gone
        active.value = gone.length < refs.length
      } catch (e) {
        console.warn('[spell] engine failed', e)
        engineMissing.value = []
        active.value = false
      }
      version.value++
    })
  }

  /** Called by the editor: from now on the engine follows selection and book changes. */
  async function start(): Promise<void> {
    ensureDeps()
    if (!started) started = true
    await refresh()
    await reload()
  }

  async function invalidateAndReload(): Promise<void> {
    await serial(async () => void (await engine?.invalidate()))
    await refresh()
    await reload()
  }

  watch(
    () => project.rootPath,
    () => {
      ignored.clear()
      void invalidateAndReload()
    },
  )
  watch(
    () => selection.value.map(refKey).join('|'),
    () => void reload(),
  )

  async function checkText(text: string): Promise<Misspelling[]> {
    if (!started) return []
    await queue
    if (!engine || !active.value) return []
    const found = await engine.checkText(text)
    return found.filter((m) => !ignored.has(m.word.toLowerCase()))
  }

  async function suggest(word: string): Promise<string[]> {
    if (!engine || !active.value) return []
    await queue
    return (await engine.suggest(word)).slice(0, 5)
  }

  async function addWord(word: string): Promise<void> {
    ensureDeps()
    customWords.value = await custom!.add(word)
    await reload()
  }

  async function removeWord(word: string): Promise<void> {
    ensureDeps()
    customWords.value = await custom!.remove(word)
    await reload()
  }

  /** For this session only: the word is not flagged again until the book is closed. */
  function ignoreWord(word: string): void {
    ignored.add(word.toLowerCase())
    version.value++
  }

  /** Writes the manifest only here, when the user changes the selection. */
  function setSelection(refs: DictRef[]): boolean {
    return project.setDictionaries(refs)
  }
  const toggle = (ref: DictRef, on: boolean): boolean =>
    setSelection(withToggled(selection.value, ref, on))

  const isSelected = (ref: DictRef) => selection.value.some((r) => refKey(r) === refKey(ref))

  // Dictionary file operations: errors (DictionaryError) propagate, nothing changes then.
  async function importDictionary(input: ImportInput): Promise<void> {
    ensureDeps()
    await dicts!.importDictionary(input)
    await invalidateAndReload()
  }
  async function removeDictionary(ref: DictRef): Promise<void> {
    ensureDeps()
    await dicts!.remove(ref)
    if (isSelected(ref)) toggle(ref, false)
    await invalidateAndReload()
  }
  async function moveOrCopy(
    name: string,
    from: DictScope,
    to: DictScope,
    mode: 'move' | 'copy',
  ): Promise<void> {
    ensureDeps()
    await dicts!.moveOrCopy(name, from, to, mode)
    // A moved dictionary keeps working for this book: follow it to the new scope.
    if (mode === 'move' && isSelected({ name, scope: from })) {
      setSelection(
        withToggled(withToggled(selection.value, { name, scope: from }, false), { name, scope: to }, true),
      )
    }
    await invalidateAndReload()
  }

  return {
    infos,
    customWords,
    selection,
    isDefault,
    missing,
    active,
    version,
    start,
    refresh,
    checkText,
    suggest,
    addWord,
    removeWord,
    ignoreWord,
    setSelection,
    toggle,
    isSelected,
    importDictionary,
    removeDictionary,
    moveOrCopy,
  }
})
