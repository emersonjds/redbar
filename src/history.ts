// Pure. The clock is allowed exactly here (the run id and summary.date) and touches no measured
// number — gaps.json stays `coverage × git diff`, byte-stable.
import { severity, type Severity } from './severity.js'
import type { Gap } from './types.js'

// `2026-07-22T21-55-30` — path-safe (no colons) and lexicographically sortable, which is what lets
// compare find "the run before this one".
export function runDirName(date: Date): string {
  return date.toISOString().slice(0, 19).replace(/:/g, '-')
}

export function bandCounts(
  gaps: Array<Pick<Gap, 'fullyUncovered' | 'branches'>>,
): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const g of gaps) counts[severity(g)]++
  return counts
}

export type RunSummary = {
  date: string
  base: string
  gaps: number
  counts: Record<Severity, number>
}

export function summarize(base: string, gaps: Gap[], date: Date): RunSummary {
  return { date: date.toISOString(), base, gaps: gaps.length, counts: bandCounts(gaps) }
}
