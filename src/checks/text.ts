import type { Finding } from './types'

/** The part of a vue-i18n composer this needs. */
export interface Translator {
  t: (key: string, named: Record<string, unknown>, plural: number) => string
  te: (key: string) => boolean
}

export const messageKey = (f: Pick<Finding, 'checkId' | 'variant'>): string =>
  f.variant ? `checks.msg.${f.checkId}.${f.variant}` : `checks.msg.${f.checkId}`

/** Localised text of a finding; falls back to its English `message` when no text exists (e.g. a later LLM checker). */
export function findingText(i18n: Translator, f: Finding): string {
  const key = messageKey(f)
  if (!i18n.te(key)) return f.message
  const count = Number(f.params?.count)
  return i18n.t(key, { ...f.params }, Number.isFinite(count) ? count : 1)
}
