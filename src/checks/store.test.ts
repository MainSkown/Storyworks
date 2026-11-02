import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryFileIO } from '../io/fileIO'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { useChecksStore } from './store'

const META = { title: 'My Book', author: 'Ann', language: 'en' }
let io: MemoryProjectIO

beforeEach(() => {
  io = createMemoryProjectIO()
  setProjectIOFactory(() => io)
  const settingsIO = createMemoryFileIO()
  setFileIOFactory(() => settingsIO)
})
afterEach(() => {
  resetProjectIOFactory()
  resetFileIOFactory()
})

async function setup() {
  setActivePinia(createPinia())
  const project = useProjectStore()
  const checks = useChecksStore()
  expect(await project.create('book', META)).toBe('opened')
  const scene = project.tree[0].children[0]
  return { project, checks, scene }
}

const todo = (id: string) => ({ id, text: id, done: false })

describe('checks store', () => {
  it('finds nothing in a fresh book', async () => {
    const { checks } = await setup()
    await checks.run()
    expect(checks.findings).toEqual([])
    expect(checks.ranAt).not.toBeNull()
    expect(checks.badge).toBe(0)
  })

  it('runs by itself when a book finishes opening', async () => {
    const { project, checks, scene } = await setup()
    await checks.run()
    await project.setSceneTodos(scene.id, [todo('t1')])
    await project.flush()
    await project.close()
    expect(checks.findings).toEqual([])
    await project.open('book')
    await new Promise((r) => setTimeout(r, 0))
    await checks.run() // settle any in-flight run
    expect(checks.findings.map((f) => f.checkId)).toContain('open-todo')
  })

  it('runs no check that is switched off', async () => {
    const { project, checks, scene } = await setup()
    await project.setSceneTodos(scene.id, [todo('t1')])
    await checks.run()
    expect(checks.findings).toHaveLength(1)
    project.setCheckEnabled('open-todo', false)
    await checks.run()
    expect(checks.findings).toEqual([])
  })

  it('ignore hides a finding, unignore brings it back', async () => {
    const { project, checks, scene } = await setup()
    await project.setSceneTodos(scene.id, [todo('t1')])
    await checks.run()
    const id = checks.findings[0]!.id
    expect(await checks.ignore(id)).toBe(true)
    expect(checks.visible).toEqual([])
    expect(checks.ignoredFindings.map((f) => f.id)).toEqual([id])
    expect(checks.badge).toBe(0)
    checks.showIgnored = true
    expect(checks.visible).toHaveLength(1)
    checks.showIgnored = false
    expect(await checks.unignore(id)).toBe(true)
    expect(checks.visible).toHaveLength(1)
  })

  it('a changed problem has a new id and shows again', async () => {
    const { project, checks, scene } = await setup()
    await project.setSceneTodos(scene.id, [todo('t1')])
    await checks.run()
    await checks.ignore(checks.findings[0]!.id)
    await project.setSceneTodos(scene.id, [todo('t1'), todo('t2')])
    await checks.run()
    expect(checks.visible).toHaveLength(1)
    expect(checks.ignoredFindings).toEqual([])
  })

  it('counts and badge: errors and warnings only', async () => {
    const { project, checks, scene } = await setup()
    await project.setSceneTodos(scene.id, [todo('t1')])
    await checks.run()
    expect(checks.counts).toEqual({ error: 0, warning: 0, info: 1 })
    expect(checks.badge).toBe(0)
  })

  it('an invalid ignored.json shows everything, warns, and is left untouched', async () => {
    const { project, checks, scene } = await setup()
    await project.setSceneTodos(scene.id, [todo('t1')])
    await checks.run()
    await checks.ignore(checks.findings[0]!.id)
    await project.flush()
    await project.close()
    const bad = '{ not json'
    io.files.set('ignored.json', bad)
    await project.open('book')
    await new Promise((r) => setTimeout(r, 0))
    await checks.run()
    expect(checks.ignoredInvalid).toBe(true)
    expect(checks.visible.map((f) => f.checkId)).toContain('open-todo')
    expect(await checks.ignore('anything')).toBe(false)
    await project.flush()
    expect(io.files.get('ignored.json')).toBe(bad)
  })

  it('clears when no project is open', async () => {
    const { project, checks, scene } = await setup()
    await project.setSceneTodos(scene.id, [todo('t1')])
    await checks.run()
    await project.close()
    await checks.run()
    expect(checks.findings).toEqual([])
    expect(checks.ranAt).toBeNull()
  })
})
