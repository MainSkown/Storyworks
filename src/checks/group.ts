import type { Finding, Severity } from './types'

export const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'info']

export interface FindingGroup {
  severity: Severity
  items: Finding[]
}

/** Non-empty groups, errors first; item order is kept. */
export function groupBySeverity(findings: readonly Finding[]): FindingGroup[] {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    items: findings.filter((f) => f.severity === severity),
  })).filter((g) => g.items.length > 0)
}
