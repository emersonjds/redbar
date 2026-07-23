// Pure: the shape of a kept run. No disk here — cli.ts writes the files; this only names the
// drawer and counts what goes in it. The clock is allowed exactly two places (the run id and
// summary.date) and touches no measured number: gaps.json stays `coverage × git diff`, byte-stable.
import { severity, type Severity } from './severity.js'
import type { Gap } from './types.js'

/**
 * A filesystem-safe, lexicographically-sortable run id from a Date: `2026-07-22T21-55-30`. The
 * colons of an ISO time are illegal in a path on Windows and awkward everywhere; replacing them
 * keeps the string sortable, which is what lets `compare` find "the run before this one".
 */
export function runDirName(date: Date): string {
  return date.toISOString().slice(0, 19).replace(/:/g, '-')
}

/** Gaps counted per band. The same tally `gateResult` makes, without the pass/fail verdict. */
export function bandCounts(
  gaps: Array<Pick<Gap, 'fullyUncovered' | 'branches'>>,
): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const g of gaps) counts[severity(g)]++
  return counts
}

/** What `summary.json` holds: the counts, the base ref, and the run date. Metadata over a run. */
export type RunSummary = {
  date: string
  base: string
  gaps: number
  counts: Record<Severity, number>
}

export function summarize(base: string, gaps: Gap[], date: Date): RunSummary {
  return { date: date.toISOString(), base, gaps: gaps.length, counts: bandCounts(gaps) }
}
