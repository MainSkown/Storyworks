/// <reference lib="webworker" />
// Untested glue: hosts the spell engine in a Web Worker. Dictionary content is
// requested from the main thread (it owns the file access), so every message
// is plain data. Client side: workerClient.ts.
import { createSpellEngine } from './engine'
import type { DictRef, LoadedDictionary } from './types'

export type WorkerRequest =
  | { id: number; type: 'set'; selected: DictRef[]; customWords: string[] }
  | { id: number; type: 'check'; word: string }
  | { id: number; type: 'suggest'; word: string }
  | { id: number; type: 'checkText'; text: string }
  | { id: number; type: 'invalidate' }
  | { type: 'loaded'; loadId: number; dictionary: LoadedDictionary | null }

export type WorkerResponse =
  | { type: 'load'; loadId: number; ref: DictRef }
  | { id: number; type: 'result'; value: unknown }
  | { id: number; type: 'error'; message: string }

const ctx = self as unknown as {
  postMessage(m: WorkerResponse): void
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null
}

let nextLoad = 0
const pending = new Map<number, (d: LoadedDictionary | null) => void>()
const engine = createSpellEngine({
  load: (ref) =>
    new Promise((resolve) => {
      const loadId = nextLoad++
      pending.set(loadId, resolve)
      ctx.postMessage({ type: 'load', loadId, ref })
    }),
})

ctx.onmessage = async ({ data: m }) => {
  if (m.type === 'loaded') {
    pending.get(m.loadId)?.(m.dictionary)
    pending.delete(m.loadId)
    return
  }
  try {
    let value: unknown
    if (m.type === 'set') value = await engine.setDictionaries(m.selected, m.customWords)
    else if (m.type === 'check') value = engine.check(m.word)
    else if (m.type === 'suggest') value = engine.suggest(m.word)
    else if (m.type === 'checkText') value = engine.checkText(m.text)
    else engine.invalidate()
    ctx.postMessage({ id: m.id, type: 'result', value })
  } catch (e) {
    ctx.postMessage({
      id: m.id,
      type: 'error',
      message: e instanceof Error ? e.message : String(e),
    })
  }
}
