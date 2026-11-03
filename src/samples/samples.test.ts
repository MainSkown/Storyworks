import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryFileIO } from '../io/fileIO'
import { useChecksStore } from '../checks/store'
import { createMemoryProjectIO } from '../project/io/memory'
import { openProject } from '../project/open'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { sampleDir, SAMPLE_INDEX } from './build'
import { installSample, SampleExistsError } from './install'
import type { SampleLang } from './text'

const LANGS: SampleLang[] = ['en', 'pl']
const PUBLIC = join(__dirname, '../../public/samples')

function committed(lang: SampleLang): Record<string, string> {
  const root = join(PUBLIC, sampleDir(lang))
  const out: Record<string, string> = {}
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`)
      else if (`${prefix}${name}` !== SAMPLE_INDEX) out[`${prefix}${name}`] = readFileSync(full, 'utf8')
    }
  }
  walk(root, '')
  return out
}

const readBundled = (url: string) => {
  const rel = url.replace(/^.*samples\//, '')
  return Promise.resolve(readFileSync(join(PUBLIC, rel), 'utf8'))
}

beforeEach(() => {
  setFileIOFactory(() => createMemoryFileIO())
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

describe.each(LANGS)('sample book (%s)', (lang) => {
  it('opens at the current version with no missing, invalid or unlisted files', async () => {
    const r = await openProject(createMemoryProjectIO(committed(lang)))
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.issues).toEqual([])
      expect(r.project.readOnly).toBeNull()
    }
  })

  it('the index lists every file', () => {
    const index = JSON.parse(readFileSync(join(PUBLIC, sampleDir(lang), SAMPLE_INDEX), 'utf8'))
    expect(index).toEqual(Object.keys(committed(lang)))
  })

  it('the Checks page shows exactly the one deliberate date-order warning', async () => {
    setActivePinia(createPinia())
    const io = createMemoryProjectIO(committed(lang))
    setProjectIOFactory(() => io)
    const project = useProjectStore()
    expect(await project.open('sample')).toBe('opened')
    const checks = useChecksStore()
    await checks.run()
    expect(checks.findings.map((f) => f.checkId)).toEqual(['date-order'])
    await project.close()
  })

  it('installs a copy into a new folder and refuses an existing book', async () => {
    const io = createMemoryProjectIO()
    await installSample(io, lang, readBundled, '/')
    expect(Object.fromEntries(io.files)).toEqual(committed(lang))
    await expect(installSample(io, lang, readBundled, '/')).rejects.toBeInstanceOf(SampleExistsError)
  })
})
