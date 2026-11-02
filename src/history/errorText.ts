/** Readable text for HistoryError / RestoreError codes; `failed` and `invalid` add the detail (it names the safety copy). */
export function describeError(
  e: unknown,
  t: (key: string) => string,
  te: (key: string) => boolean,
): string {
  const code = (e as { code?: unknown } | null)?.code
  const key = typeof code === 'string' ? `history.error.${code}` : ''
  const base = key && te(key) ? t(key) : t('history.error.generic')
  const detail = e instanceof Error ? e.message : ''
  return (code === 'failed' || code === 'invalid') && detail ? `${base} ${detail}` : base
}
