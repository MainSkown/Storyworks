import { z } from 'zod'

export const IGNORED_VERSION = 1

/** Findings the user dismissed ("Not this one"), by stable finding id. M7 checks reuse this file. */
export const ignoredSchema = z.strictObject({
  version: z.literal(IGNORED_VERSION),
  ignored: z.array(z.strictObject({ id: z.string() })),
})

export type Ignored = z.infer<typeof ignoredSchema>

export const emptyIgnored = (): Ignored => ({ version: IGNORED_VERSION, ignored: [] })

export const ignoredIds = (file: Ignored | null): Set<string> =>
  new Set((file?.ignored ?? []).map((i) => i.id))

/** Same object back when `id` is already ignored. */
export function addIgnored(file: Ignored, id: string): Ignored {
  return file.ignored.some((i) => i.id === id)
    ? file
    : { ...file, ignored: [...file.ignored, { id }] }
}

/** Same object back when `id` is not ignored. */
export function removeIgnored(file: Ignored, id: string): Ignored {
  return file.ignored.some((i) => i.id === id)
    ? { ...file, ignored: file.ignored.filter((i) => i.id !== id) }
    : file
}
