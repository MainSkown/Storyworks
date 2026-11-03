import { z } from 'zod'
import type { Env } from '../types'
import { routeRefSchema, type RouteRef } from './route'
import { defaultNames } from '../defaultNames'
import { isKindId, type KindId } from '../kinds'
import { defaultExportOptions, type ExportOptions } from '../../export/options'
import { defaultScriptExportOptions, type ScriptExportOptions } from '../../export/scriptOptions'

export const MANIFEST_VERSION = 17
export const BOOK_KIND: KindId = 'book'

/** Index entry for one item file (or one singleton file). */
export const itemRefSchema = z.strictObject({
  id: z.string(),
  path: z.string(),
  title: z.string().optional(),
})

export const trashEntrySchema = z.strictObject({
  id: z.string(),
  type: z.enum(['part', 'chapter', 'scene', 'conversation', 'note', 'timeline', 'node', 'rule', 'entry']),
  title: z.string(),
  originalPath: z.string(),
  trashPath: z.string(),
  parentId: z.string().nullable(),
  index: z.number().int().min(0),
  deletedAt: z.string(),
  routes: z.array(routeRefSchema).optional(),
})

export interface ManuscriptNode {
  id: string
  type: 'part' | 'chapter' | 'scene' | 'conversation'
  title: string
  path?: string
  /** Game scripts: timeline branches this item is tagged with. */
  routes?: RouteRef[]
  children: ManuscriptNode[]
}

export const manuscriptNodeSchema: z.ZodType<ManuscriptNode> = z.lazy(() =>
  z.strictObject({
    id: z.string(),
    type: z.enum(['part', 'chapter', 'scene', 'conversation']),
    title: z.string(),
    path: z.string().optional(),
    routes: z.array(routeRefSchema).optional(),
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

/** Mirrors `ScriptExportOptions` (src/export/scriptOptions.ts). */
export const scriptExportSchema = z.strictObject({
  pageSize: z.enum(['Letter', 'A4']),
  titlePage: z.boolean(),
  sceneNumbers: z.boolean(),
  pageNumbers: z.boolean(),
  moreContd: z.boolean(),
}) satisfies z.ZodType<ScriptExportOptions>

export const goalsSchema = z.strictObject({
  daily: z.number().int().min(0).nullable().default(null),
  book: z.number().int().min(0).nullable().default(null),
})

export const dictionariesSchema = z.array(
  z.strictObject({ name: z.string(), scope: z.enum(['local', 'global']) }),
)

export const titlePageSchema = z.strictObject({
  contact: z.string(),
  date: z.string(),
})

export const manifestSchema = z.strictObject({
  version: z.literal(MANIFEST_VERSION),
  // Any string parses; callers decide what an unknown kind means (read-only).
  kind: z.string(),
  title: z.string(),
  author: z.string(),
  language: z.string(),
  // Screenplay title page; title and author are above.
  titlePage: titlePageSchema.default({ contact: '', date: '' }),
  createdAt: z.string(),
  // Game scripts: last issued line id number; only grows, so ids are never reused.
  lineCounter: z.number().int().min(0).default(0),
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
  // Game scripts: the project-wide variable list.
  variables: itemRefSchema.nullable().default(null),
  // Game scripts: the story map graph.
  storyMap: itemRefSchema.nullable().default(null),
  trash: z.array(trashEntrySchema).default([]),
  // Per-check on/off; a missing id means enabled.
  checkSettings: z.record(z.string(), z.boolean()).default({}),
  // Per-book export form values.
  exportSettings: exportSettingsSchema.default(defaultExportOptions),
  // Per-screenplay export form values.
  scriptExport: scriptExportSchema.default(defaultScriptExportOptions),
})

export type Manifest = z.infer<typeof manifestSchema>
export type ItemRef = z.infer<typeof itemRefSchema>

export interface BookMeta {
  title: string
  author: string
  language: string
  /** Defaults to book; fixed for the life of the project. */
  kind?: string
}

/**
 * Book: Chapter 1 with one scene. Screenplay: Sequence 1 with one scene. Game: empty tree.
 * The scene file itself is written by createProject.
 */
export function createManifest(meta: BookMeta, env: Env): Manifest {
  const { kind: wanted, ...rest } = meta
  if (wanted !== undefined && !isKindId(wanted)) throw new Error(`Unknown project kind: ${wanted}`)
  const kind: KindId = wanted ?? BOOK_KIND
  const names = defaultNames(meta.language)
  const sceneId = env.newId()
  return manifestSchema.parse({
    version: MANIFEST_VERSION,
    kind,
    ...rest,
    createdAt: new Date(env.now()).toISOString(),
    manuscript:
      kind === 'game'
        ? []
        : [
            {
              id: env.newId(),
              type: 'chapter',
              title: kind === 'screenplay' ? names.sequence : names.chapter,
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
