import { z } from 'zod'

export const INBOX_VERSION = 1

export const inboxNoteSchema = z.strictObject({
  id: z.string(),
  title: z.string().optional(),
  content: z.record(z.string(), z.unknown()),
})

export const inboxSchema = z.strictObject({
  version: z.literal(INBOX_VERSION),
  id: z.string(),
  notes: z.array(inboxNoteSchema),
})

export type Inbox = z.infer<typeof inboxSchema>
export type InboxNote = z.infer<typeof inboxNoteSchema>
