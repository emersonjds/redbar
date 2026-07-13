import type { Gap } from './types.js'

export type Severity = 'critical' | 'high' | 'medium' | 'low'

/**
 * McCabe's threshold: a function whose cyclomatic complexity passes ~5 is the classic "this
 * needs a test" line. Below it, a bug has few places to hide.
 */
const DENSE = 5

/**
 * Criticality band for a gap. The score answers "how much?", this answers "do I fix it now?" —
 * a continuous number cannot be triaged, and nobody argues over a bucket.
 *
 * Two objective axes, both already measured, neither an opinion:
 *   1. is ANY of this symbol covered?   (fullyUncovered)
 *   2. how much branching is in there?  (branches)
 *
 *                    0 branches   1-4      5+
 *   no coverage      medium       high     critical
 *   partly covered   low          low      medium
 *
 * Untested branching logic is the worst cell: every branch is a path nothing has ever run.
 * Untested straight-line code is bad but bounded. Partly-covered code at least has a test
 * pointing at it — someone can extend it.
 */
export function severity(gap: Pick<Gap, 'fullyUncovered' | 'branches'>): Severity {
  if (gap.fullyUncovered) {
    if (gap.branches >= DENSE) return 'critical'
    if (gap.branches >= 1) return 'high'
    return 'medium'
  }
  return gap.branches >= DENSE ? 'medium' : 'low'
}
