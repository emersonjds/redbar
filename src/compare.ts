// Pure: two gap lists in, a diff out. No disk, no clock. `redbar compare` reads two runs' gaps.json
// and hands them here. Zero-LLM — it is set arithmetic, the same answer twice.
import { bandCounts } from './history.js'
import type { Severity } from './severity.js'
import type { Gap } from './types.js'

/**
 * A gap's identity ACROSS runs is `(file, symbol)` — deliberately not the line. Lines drift as code
 * moves; an import added above a function would otherwise report it "closed and reopened" every run.
 * `(file, symbol)` is stable under line drift, which is the tolerance a progress report needs.
 */
const key = (gap: Gap): string => `${gap.file}::${gap.symbol ?? ''}`

export type RunDiff = {
  /** in A, gone in B — the gaps that got covered */
  closed: Gap[]
  /** only in B — new untested code since A */
  added: Gap[]
  /** B's per-band count minus A's: negative is progress */
  deltaByBand: Record<Severity, number>
}

export function compareRuns(a: Gap[], b: Gap[]): RunDiff {
  const aKeys = new Set(a.map(key))
  const bKeys = new Set(b.map(key))

  const closed = a.filter((gap) => !bKeys.has(key(gap)))
  const added = b.filter((gap) => !aKeys.has(key(gap)))

  const countsA = bandCounts(a)
  const countsB = bandCounts(b)
  const deltaByBand: Record<Severity, number> = {
    critical: countsB.critical - countsA.critical,
    high: countsB.high - countsA.high,
    medium: countsB.medium - countsA.medium,
    low: countsB.low - countsA.low,
  }

  return { closed, added, deltaByBand }
}
