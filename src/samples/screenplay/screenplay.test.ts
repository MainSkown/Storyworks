import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChecksStore } from '../../checks/store'
import { elementsOfDoc } from '../../editor/screenplay/elements'
import { toFountain } from '../../export/fountain'
import { prepareScript } from '../../export/scriptDoc'
import { defaultScriptExportOptions } from '../../export/scriptOptions'
import { projectScriptSource } from '../../export/source'
import { parseFountain } from '../../import/fountain'
import { createMemoryFileIO } from '../../io/fileIO'
import { createMemoryProjectIO } from '../../project/io/memory'
import { openProject } from '../../project/open'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../../project/store'
import { resetFileIOFactory, setFileIOFactory } from '../../settings/store'
import { SAMPLE_INDEX } from '../build'
import type { SampleLang } from '../text'
import { buildScreenplaySample, screenplaySampleDir } from './build'

const LANGS: SampleLang[] = ['en', 'pl']
const PUBLIC = join(__dirname, '../../../public/samples')

function committed(lang: SampleLang): Record<string, string> {
  const root = join(PUBLIC, screenplaySampleDir(lang))
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

beforeEach(() => setFileIOFactory(() => createMemoryFileIO()))
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

describe.each(LANGS)('sample screenplay (%s)', (lang) => {
  it('opens at the current version with no missing, invalid or unlisted files', async () => {
    const r = await openProject(createMemoryProjectIO(committed(lang)))
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.issues).toEqual([])
      expect(r.project.readOnly).toBeNull()
      expect(r.project.manifest.kind).toBe('screenplay')
    }
  })

  it('the index lists every file', () => {
    const index = JSON.parse(readFileSync(join(PUBLIC, screenplaySampleDir(lang), SAMPLE_INDEX), 'utf8'))
    expect(index).toEqual(Object.keys(committed(lang)))
  })

  it('the committed files match the builder', async () => {
    expect(committed(lang)).toEqual(await buildScreenplaySample(lang))
  })

  describe('opened in the app', () => {
    const open = async () => {
      setActivePinia(createPinia())
      setProjectIOFactory(() => createMemoryProjectIO(committed(lang)))
      const project = useProjectStore()
      expect(await project.open('sample')).toBe('opened')
      return project
    }

    it('Checks show exactly the one deliberate date-order warning', async () => {
      const project = await open()
      const checks = useChecksStore()
      await checks.run()
      expect(checks.findings.map((f) => f.id)).toEqual(['date-order:n1:n2'])
      await project.close()
    })

    it('numbers six scenes and has a title page and a margin comment', async () => {
      const project = await open()
      expect([...project.sceneNumbering.byBlock.values()]).toEqual([1, 2, 3, 4, 5, 6])
      expect(project.project?.manifest.titlePage.contact).not.toBe('')
      expect(project.pageStats.pages).toBeGreaterThan(0)
      const scenes = project.tree.flatMap((n) => n.children)
      const loaded = await Promise.all(scenes.map((s) => project.loadScene(s.path as string)))
      const comments = loaded.flatMap((r) => (r.ok ? r.value.comments : []))
      expect(comments).toHaveLength(1)
      await project.close()
    })

    it('Fountain export imports back to the same element types and text', async () => {
      const project = await open()
      const source = projectScriptSource()!
      const ids = project.tree.map((n) => n.id)
      const doc = await prepareScript(source, ids, defaultScriptExportOptions())
      const parsed = parseFountain(toFountain(doc))
      // Only the title page keys are skipped on import (documented).
      expect(parsed.skipped).toEqual([{ construct: 'titlePage', count: 1 }])
      const want = doc.sequences.map((s) => [s.title, s.scenes.map((sc) => sc.elements.map((e) => [e.type, e.text]))])
      const got = parsed.sequences.map((s) => [s.title, s.scenes.map((sc) => sc.elements.map((e) => [e.type, e.text]))])
      expect(got).toEqual(want)
      // Same elements as the stored scene files.
      const first = await project.loadScene(project.tree[0].children[0].path as string)
      expect(first.ok && elementsOfDoc(first.value.content).map((e) => e.type)).toEqual(
        doc.sequences[0].scenes[0].elements.map((e) => e.type),
      )
      await project.close()
    })
  })
})
