import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryProjectIO, type MemoryProjectIO } from '../project/io/memory'
import { createMemoryFileIO } from '../io/fileIO'
import { resetFileIOFactory, setFileIOFactory } from '../settings/store'
import { resetProjectIOFactory, setProjectIOFactory, useProjectStore } from '../project/store'
import { createProject } from '../project/open'
import { rulePath, ruleCategoryPath } from '../project/rules'
import { ruleSchema } from '../project/schemas/rule'
import { parseFile } from '../project/serialize'
import { RuleRestoreError } from '../project/trash'
import { useTimelinesStore } from '../timeline/store'
import { useRulesStore } from './store'

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

async function opened() {
  setActivePinia(createPinia())
  const p = useProjectStore()
  expect(await p.create('book', META)).toBe('opened')
  return { p, r: useRulesStore() }
}

const disk = (id: string) => {
  const res = parseFile(ruleSchema, io.files.get(rulePath(id)) as string, 'x')
  if (!res.ok) throw new Error('rule invalid on disk')
  return res.value
}
const manifest = () => JSON.parse(io.files.get('project.json') as string)

describe('open', () => {
  it('a new book gets the five default categories and no rules', async () => {
    const { r } = await opened()
    expect(r.categories.map((c) => c.name)).toEqual(['Magic', 'Physics', 'Society', 'Technology', 'Religion'])
    expect(r.rules).toEqual([])
  })

  it('reopening seeds nothing more', async () => {
    const { p } = await opened()
    await p.flush()
    const snap = new Map([...io.files].filter(([k]) => !k.endsWith('.lock') && !k.includes('/backups/')))
    await p.open('book')
    expect(new Map([...io.files].filter(([k]) => !k.endsWith('.lock') && !k.includes('/backups/')))).toEqual(snap)
  })

  it('read-only open creates nothing', async () => {
    const { p } = await opened()
    await p.close()
    const bare = createMemoryProjectIO()
    io = bare
    await createProject(bare, META)
    const m = JSON.parse(bare.files.get('project.json') as string)
    bare.files.set('project.json', JSON.stringify({ ...m, kind: 'other' }))
    const before = new Map(bare.files)
    expect(await p.open('book2')).toBe('opened')
    expect(bare.files).toEqual(before)
    expect(useRulesStore().categories).toEqual([])
    expect(await useRulesStore().createRule()).toBeNull()
  })

  it('an invalid rule file is listed with its field error, others load, file untouched', async () => {
    const { p, r } = await opened()
    const a = (await r.createRule({ title: 'A' })) as string
    const b = (await r.createRule({ title: 'B' })) as string
    await p.flush()
    const bad = JSON.stringify({ ...disk(b), title: 5 })
    io.files.set(rulePath(b), bad)
    await p.open('book')
    const r2 = useRulesStore()
    expect(r2.rules.map((x) => x.id)).toEqual([a])
    const entry = r2.ruleEntries.find((e) => e.id === b)
    expect(entry).toMatchObject({ status: 'invalid', error: { field: 'title' } })
    expect(r2.updateRule(b, { title: 'x' })).toEqual({ ok: false, reason: 'unknown-rule' })
    await p.flush()
    expect(io.files.get(rulePath(b))).toBe(bad)
  })

  it('a file whose id differs from the manifest is invalid', async () => {
    const { p, r } = await opened()
    const a = (await r.createRule({ title: 'A' })) as string
    await p.flush()
    io.files.set(rulePath(a), JSON.stringify({ ...disk(a), id: 'other' }))
    await p.open('book')
    expect(useRulesStore().ruleEntries[0]).toMatchObject({ status: 'invalid', error: { field: 'id' } })
  })

  it('a listed rule whose file is gone is marked missing', async () => {
    const { p, r } = await opened()
    const a = (await r.createRule()) as string
    await p.flush()
    io.files.delete(rulePath(a))
    await p.open('book')
    expect(useRulesStore().ruleEntries[0].status).toBe('missing')
  })

  it('an invalid category file is listed as invalid and left alone', async () => {
    const { p, r } = await opened()
    const id = r.categories[0].id
    await p.flush()
    io.files.set(ruleCategoryPath(id), '{"nope":')
    await p.open('book')
    const r2 = useRulesStore()
    expect(r2.categoryEntries[0].status).toBe('invalid')
    expect(r2.categories).toHaveLength(4)
    expect(io.files.get(ruleCategoryPath(id))).toBe('{"nope":')
  })
})

describe('rules', () => {
  it('create, edit and autosave to the file and manifest', async () => {
    const { p, r } = await opened()
    const id = (await r.createRule({ title: 'Mana' })) as string
    expect(r.selectedId).toBe(id)
    expect(disk(id).categoryId).toBe(r.categories[0].id)
    expect(r.updateRule(id, { title: ' Mana cost ', tags: [' a ', 'a', '', 'b'], categoryId: r.categories[1].id })).toEqual({ ok: true })
    await p.flush()
    expect(disk(id)).toMatchObject({ title: 'Mana cost', tags: ['a', 'b'], categoryId: r.categories[1].id })
    expect(manifest().rules).toEqual([{ id, path: rulePath(id), title: 'Mana cost' }])
  })

  it('a category that does not exist is rejected', async () => {
    const { r } = await opened()
    const id = (await r.createRule()) as string
    expect(r.updateRule(id, { categoryId: 'zz' })).toEqual({ ok: false, reason: 'unknown-category' })
    expect(await r.createRule({ categoryId: 'zz' })).toBeNull()
  })

  it('order follows the manifest', async () => {
    const { r } = await opened()
    const ids = [(await r.createRule()) as string, (await r.createRule()) as string]
    expect(r.rules.map((x) => x.id)).toEqual(ids)
    expect(r.groups.flatMap((g) => g.rules.map((x) => x.id))).toEqual(ids)
  })

  it('edits are refused when the project is read-only', async () => {
    const { p, r } = await opened()
    const id = (await r.createRule()) as string
    ;(p.project as { readOnly: unknown }).readOnly = { reason: 'locked-elsewhere' }
    expect(r.updateRule(id, { title: 'x' })).toEqual({ ok: false, reason: 'read-only' })
    expect(await r.createRule()).toBeNull()
    expect(await r.deleteRule(id)).toBe(false)
  })

  it('delete trashes the file; the node link is left and shows as broken; restore fixes it', async () => {
    const { p, r } = await opened()
    const t = useTimelinesStore()
    const id = (await r.createRule({ title: 'Mana' })) as string
    const node = t.addNode()
    if (!node.ok) throw new Error('no node')
    t.updateNode(node.id, { ruleIds: [id] })
    await p.flush()
    expect(r.usedIn(id).map((u) => u.nodeId)).toEqual([node.id])
    expect(r.brokenLinks).toEqual([])

    expect(await r.deleteRule(id)).toBe(true)
    expect(r.rules).toEqual([])
    expect(io.files.has(rulePath(id))).toBe(false)
    expect(p.trash.map((e) => [e.id, e.type, e.title])).toEqual([[id, 'rule', 'Mana']])
    expect(t.current?.nodes[0].ruleIds).toEqual([id])
    expect(r.brokenLinks.map((b) => b.ruleId)).toEqual([id])

    await p.restoreItem(id)
    expect(r.rules.map((x) => x.id)).toEqual([id])
    expect(r.brokenLinks).toEqual([])
    expect(p.trash).toEqual([])
  })

  it('restore into a missing category moves the rule to the first category', async () => {
    const { p, r } = await opened()
    const [a, b] = r.categories
    const id = (await r.createRule({ categoryId: b.id })) as string
    await r.deleteRule(id)
    expect(await r.deleteCategory(b.id)).toEqual({ ok: true, moved: 0 })
    await p.restoreItem(id)
    expect(r.rules[0].categoryId).toBe(a.id)
    await p.flush()
    expect(disk(id).categoryId).toBe(a.id)
  })

  it('restore with an invalid trashed file is refused and the file untouched', async () => {
    const { p, r } = await opened()
    const id = (await r.createRule()) as string
    await r.deleteRule(id)
    const path = p.trash[0].trashPath
    io.files.set(path, '{"bad":1}')
    const err = await p.restoreItem(id).catch((e) => e)
    expect(err).toBeInstanceOf(RuleRestoreError)
    expect(io.files.get(path)).toBe('{"bad":1}')
    expect(p.trash).toHaveLength(1)
  })
})

describe('categories', () => {
  it('create, rename, recolour; saved to file and manifest', async () => {
    const { p, r } = await opened()
    const id = (await r.createCategory('Language', '#111111')) as string
    expect(r.updateCategory(id, { name: ' Tongues ', color: '#222222' })).toEqual({ ok: true })
    await p.flush()
    expect(r.categories.at(-1)).toMatchObject({ id, name: 'Tongues', color: '#222222' })
    const disk = JSON.parse(io.files.get(ruleCategoryPath(id)) as string)
    expect(disk).toMatchObject({ name: 'Tongues', color: '#222222' })
    expect(manifest().ruleCategories.at(-1)).toEqual({ id, path: ruleCategoryPath(id), title: 'Tongues' })
  })

  it('an empty name is rejected', async () => {
    const { r } = await opened()
    expect(await r.createCategory('  ')).toBeNull()
    expect(r.updateCategory(r.categories[0].id, { name: ' ' })).toEqual({ ok: false, reason: 'empty-name' })
  })

  it('delete without rules removes the file and the entry', async () => {
    const { p, r } = await opened()
    const id = r.categories[4].id
    expect(await r.deleteCategory(id)).toEqual({ ok: true, moved: 0 })
    await p.flush()
    expect(io.files.has(ruleCategoryPath(id))).toBe(false)
    expect(manifest().ruleCategories.map((c: { id: string }) => c.id)).not.toContain(id)
    expect(p.trash).toEqual([])
  })

  it('delete with rules needs a target, then moves them', async () => {
    const { p, r } = await opened()
    const [a, b] = r.categories
    const x = (await r.createRule({ categoryId: a.id })) as string
    expect(await r.deleteCategory(a.id)).toEqual({ ok: false, reason: 'target-required' })
    expect(r.categories).toHaveLength(5)
    expect(await r.deleteCategory(a.id, b.id)).toEqual({ ok: true, moved: 1 })
    await p.flush()
    expect(disk(x).categoryId).toBe(b.id)
    expect(r.categories.map((c) => c.id)).not.toContain(a.id)
  })

  it('the last category cannot be deleted', async () => {
    const { r } = await opened()
    for (const c of r.categories.slice(1)) await r.deleteCategory(c.id)
    expect(await r.deleteCategory(r.categories[0].id)).toEqual({ ok: false, reason: 'last-category' })
    expect(r.categories).toHaveLength(1)
  })

  it('deleting every category on a book with rules does not seed again on reopen', async () => {
    const { p, r } = await opened()
    await r.createRule()
    for (const c of r.categories.slice(1)) await r.deleteCategory(c.id, r.categories[0].id)
    await p.flush()
    // simulate an outside edit that left the book without categories
    const m = manifest()
    io.files.set('project.json', JSON.stringify({ ...m, ruleCategories: [] }))
    await p.open('book')
    expect(useRulesStore().categories).toEqual([])
  })
})

describe('filter', () => {
  it('groups follow category order and filters narrow the list', async () => {
    const { r } = await opened()
    const [a, b] = r.categories
    const x = (await r.createRule({ title: 'Mana', categoryId: b.id })) as string
    await r.createRule({ title: 'Gravity', categoryId: a.id })
    r.updateRule(x, { tags: ['core'] })
    expect(r.groups.filter((g) => g.rules.length).map((g) => g.category?.name)).toEqual(['Magic', 'Physics'])
    r.toggleTag('core')
    expect(r.filteredRules.map((f) => f.id)).toEqual([x])
    r.clearFilter()
    r.setQuery('gravi')
    expect(r.filteredRules.map((f) => f.title)).toEqual(['Gravity'])
    expect(r.allTags).toEqual(['core'])
  })
})
