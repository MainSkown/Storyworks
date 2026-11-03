import type { Misspelling } from './engine'
import type { WorkerRequest, WorkerResponse } from './worker'
import type { DictRef, LoadedDictionary } from './types'

/** Same surface as the engine, but async; `load` runs on the main thread. */
export function createWorkerSpellClient(
  worker: Worker,
  load: (ref: DictRef) => Promise<LoadedDictionary | null>,
) {
  let next = 0
  const waiting = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>()

  worker.onmessage = async ({ data: m }: MessageEvent<WorkerResponse>) => {
    if (m.type === 'load') {
      const dictionary = await load(m.ref).catch(() => null)
      worker.postMessage({ type: 'loaded', loadId: m.loadId, dictionary } satisfies WorkerRequest)
      return
    }
    const w = waiting.get(m.id)
    waiting.delete(m.id)
    if (m.type === 'result') w?.ok(m.value)
    else w?.fail(new Error(m.message))
  }

  const call = <T>(req: Distributive<WorkerRequest, 'id'>) =>
    new Promise<T>((ok, fail) => {
      const id = next++
      waiting.set(id, { ok: ok as (v: unknown) => void, fail })
      worker.postMessage({ ...req, id })
    })

  return {
    setDictionaries: (selected: DictRef[], customWords: string[]) =>
      call<{ missing: DictRef[] }>({ type: 'set', selected, customWords }),
    check: (word: string) => call<boolean>({ type: 'check', word }),
    suggest: (word: string) => call<string[]>({ type: 'suggest', word }),
    checkText: (text: string) => call<Misspelling[]>({ type: 'checkText', text }),
    invalidate: () => call<void>({ type: 'invalidate' }),
    terminate: () => worker.terminate(),
  }
}

type Distributive<T, K extends string> = T extends unknown ? Omit<T, K> : never
