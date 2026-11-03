import { z } from 'zod'
import type { Env } from '../types'
import { defaultNames } from '../defaultNames'
import { defaultExportOptions, type ExportOptions } from '../../export/options'

export const MANIFEST_VERSION = 12
export const BOOK_KIND = 'book'

/** Index entry for one item file (or one singleton file). */
export const itemRefSchema = z.strictObject({
  id: z.string(),
  path: z.string(),
  title: z.string().optional(),
})

export const trashEntrySchema = z.strictObject({
  id: z.string(),
  type: z.enum(['part', 'chapter', 'scene', 'note', 'timeline', 'node', 'rule', 'entry']),
  title: z.string(),
  originalPath: z.string(),
  trashPath: z.string(),
  parentId: z.string().nullable(),
  index: z.number().int().min(0),
  deletedAt: z.string(),
})

export interface ManuscriptNode {
  id: string
  type: 'part' | 'chapter' | 'scene'
  title: string
  path?: string
  children: ManuscriptNode[]
}

export const manuscriptNodeSchema: z.ZodType<ManuscriptNode> = z.lazy(() =>
  z.strictObject({
    id: z.string(),
    type: z.enum(['part', 'chapter', 'scene']),
    title: z.string(),
    path: z.string().optional(),
    children: z.array(manuscriptNodeSchema),
  }),
)

const refs = () => z.array(itemRefSchema).default([])

const marginSchema = z.number().min(0).max(60)

/** Mirrors `ExportOptions` (src/export/options.ts); defaults come from there. */
export const exportSettingsSchema = z.strictObject({
  titlePage: z.boolean(),
  toc: z.boolean(),
  pageSize: z.enum(['A4', 'A5', 'Letter']),
  marginMm: z.strictObject({
    top: marginSchema,
    bottom: marginSchema,
    left: marginSchema,
    right: marginSchema,
  }),
  font: z.enum(['serif', 'sans']),
  fontSizePt: z.number().min(6).max(24),
  lineSpacing: z.number().min(1).max(3),
  pageNumbers: z.boolean(),
  runningHeader: z.enum(['none', 'book', 'chapter']),
  appendices: z.strictObject({
    personae: z.strictObject({ on: z.boolean(), typeIds: z.array(z.string()) }),
    glossary: z.strictObject({ on: z.boolean(), typeIds: z.array(z.string()) }),
    chronology: z.strictObject({ on: z.boolean(), timelineId: z.string().nullable() }),
  }),
}) satisfies z.ZodType<ExportOptions>

export const goalsSchema = z.strictObject({
  daily: z.number().int().min(0).nullable().default(null),
  book: z.number().int().min(0).nullable().default(null),
})

export const dictionariesSchema = z.array(
  z.strictObject({ name: z.string(), scope: z.enum(['local', 'global']) }),
)

export const manifestSchema = z.strictObject({
  version: z.literal(MANIFEST_VERSION),
  // Any string parses; callers decide what an unknown kind means (read-only).
  kind: z.string(),
  title: z.string(),
  author: z.string(),
  language: z.string(),
  createdAt: z.string(),
  dictionaries: dictionariesSchema.default([]),
  goals: goalsSchema.default({ daily: null, book: null }),
  dirs: z
    .strictObject({
      assets: z.string().default('assets'),
      snapshots: z.string().default('.storyworks/history.git'),
      dictionaries: z.string().default('dictionaries'),
    })
    .default({
      assets: 'assets',
      snapshots: '.storyworks/history.git',
      dictionaries: 'dictionaries',
    }),
  manuscript: z.array(manuscriptNodeSchema).default([]),
  calendar: itemRefSchema.nullable().default(null),
  inbox: itemRefSchema.nullable().default(null),
  ignoredFindings: itemRefSchema.nullable().default(null),
  stats: itemRefSchema.nullable().default(null),
  relationLayout: itemRefSchema.nullable().default(null),
  timelines: refs(),
  rules: refs(),
  ruleCategories: refs(),
  codexTypes: refs(),
  codexEntries: refs(),
  relationTypes: refs(),
  relationships: refs(),
  groups: refs(),
  stateKinds: refs(),
  knowledge: refs(),
  trash: z.array(trashEntrySchema).default([]),
  // Per-check on/off; a missing id means enabled.
  checkSettings: z.record(z.string(), z.boolean()).default({}),
  // Per-book export form values.
  exportSettings: exportSettingsSchema.default(defaultExportOptions),
})

export type Manifest = z.infer<typeof manifestSchema>
export type ItemRef = z.infer<typeof itemRefSchema>

export interface BookMeta {
  title: string
  author: string
  language: string
}

/** Chapter 1 with one scene node; the scene file itself is written by createProject. */
export function createManifest(meta: BookMeta, env: Env): Manifest {
  const names = defaultNames(meta.language)
  const sceneId = env.newId()
  return manifestSchema.parse({
    version: MANIFEST_VERSION,
    kind: BOOK_KIND,
    ...meta,
    createdAt: new Date(env.now()).toISOString(),
    manuscript: [
      {
        id: env.newId(),
        type: 'chapter',
        title: names.chapter,
        children: [
          {
            id: sceneId,
            type: 'scene',
            title: names.scene,
            path: `manuscript/${sceneId}.json`,
            children: [],
          },
        ],
      },
    ],
  })
}

/**
 * Reads only `version` and `kind` from raw manifest text, ignoring everything else,
 * so a newer version or unknown kind can open read-only even when the strict parse fails.
 * Returns null when the text is not a JSON object.
 */
export function peekManifestHeader(
  text: string,
): { version: number | null; kind: string | null } | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const { version, kind } = raw as Record<string, unknown>
  return {
    version: typeof version === 'number' ? version : null,
    kind: typeof kind === 'string' ? kind : null,
  }
}
