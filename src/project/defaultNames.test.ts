import { describe, expect, it } from 'vitest'
import { DEFAULT_CODEX_TYPES, seedCodexTypes } from './codex'
import { defaultNames } from './defaultNames'
import { createProject, defaultEnv } from './open'
import { DEFAULT_RULE_CATEGORIES, seedRuleCategories } from './rules'
import { DEFAULT_TIMELINE_NAME } from './timelines'
import { createMemoryProjectIO } from './io/memory'

describe('default names', () => {
  it('has one name per starter item in both languages', () => {
    for (const lang of ['en', 'pl']) {
      const n = defaultNames(lang)
      expect(n.ruleCategories).toHaveLength(DEFAULT_RULE_CATEGORIES.length)
      expect(n.codexTypes).toHaveLength(DEFAULT_CODEX_TYPES.length)
    }
    expect(defaultNames('en').timeline).toBe(DEFAULT_TIMELINE_NAME)
  })

  it('falls back to English for other languages', () => {
    expect(defaultNames('de').chapter).toBe('Chapter 1')
    expect(defaultNames('pl-PL').chapter).toBe('Rozdział 1')
  })

  it('writes Polish chapter, scene, categories and types for a Polish book', async () => {
    const project = await createProject(createMemoryProjectIO(), {
      title: 'T',
      author: 'A',
      language: 'pl',
    })
    expect(project.manifest.manuscript[0].title).toBe('Rozdział 1')
    expect(project.manifest.manuscript[0].children[0].title).toBe('Scena 1')
    await seedRuleCategories(project, defaultEnv)
    await seedCodexTypes(project, defaultEnv)
    expect(project.manifest.ruleCategories.map((c) => c.title)).toEqual(
      defaultNames('pl').ruleCategories,
    )
    expect(project.manifest.codexTypes.map((c) => c.title)).toEqual(defaultNames('pl').codexTypes)
  })
})
