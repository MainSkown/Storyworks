type Raw = Record<string, unknown>

/** Each step upgrades a file from version N to N+1 (index = N). */
const steps: Record<number, (s: Raw) => Raw> = {
  1: (s) => ({ ...s, version: 2, recentProjects: [] }),
}

/** Returns the input itself when no migration was needed. Unknown shapes pass through. */
export function migrateSettings(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  let cur = raw as Raw
  while (typeof cur.version === 'number' && steps[cur.version]) cur = steps[cur.version]!(cur)
  return cur
}
