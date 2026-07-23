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

// The band leads the sort, the score breaks ties inside it. Ranking by raw score alone put a
// CRITICAL row below a MEDIUM one — which makes the band decoration instead of triage.
const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

/**
 * Does this gap sit at or above the threshold band? The band is the triage axis (`severity`), so
 * it is also the axis `execute` cuts on — a filter, not a count. `meetsSeverity(g, 'high')` keeps
 * critical and high, drops medium and low. Lower RANK is worse, so at-or-above is `<=`.
 */
export function meetsSeverity(
  gap: Pick<Gap, 'fullyUncovered' | 'branches'>,
  threshold: Severity,
): boolean {
  return RANK[severity(gap)] <= RANK[threshold]
}

/**
 * Triage order: worst first. Every audience sorts the same way — the terminal, the PR comment,
 * the HTML and the agent's briefing. Two orders that disagree would be two answers to "what do I
 * do first", and the agent works top to bottom.
 */
export function ranked(gaps: Gap[]): Gap[] {
  return [...gaps].sort((a, b) => RANK[severity(a)] - RANK[severity(b)] || b.score - a.score)
}
