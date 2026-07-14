// Pure: the before-gaps, the after-gaps, what the agent attempted → what actually happened.
import { ranked } from './severity.js'
import type { Gap } from './types.js'

export type Verdict =
  | 'closed'
  | 'open'
  | 'no-assertion'
  | 'touched-source'
  | 'needs-human'
  | 'timeout'
  | 'no-output'

/** What `execute` observed while the agent worked on one gap. */
export type Attempt = {
  file: string
  symbol: string | null
  /** the gap's first line — disambiguates two symbols that share a name in the same file */
  line: number
  verdict: Verdict
  /** the test file the agent wrote, when one survived the gates */
  testFile?: string
  /** free-text reason in the agent's own words; on needs-human and timeout, not a measurement */
  note?: string
}

export type Outcome = {
  gap: Gap
  verdict: Verdict
  testFile?: string
  note?: string
}

/**
 * Verdicts redbar measured, versus the one the agent asserted.
 *
 * The outcome report renders these in two separate blocks and never mixes them. `needs-human` is
 * the only line in the whole document whose reason comes from a language model, and the reader is
 * told so.
 */
export function isMeasured(verdict: Verdict): boolean {
  return verdict === 'closed' || verdict === 'open' || verdict === 'no-assertion' || verdict === 'touched-source'
}

// Attempts key on (file, symbol, first line): both sides come from the same BEFORE list, so the
// first line is stable here. Never use this key against the AFTER report — see isClosed below.
const attemptKey = (file: string, symbol: string | null, firstLine: number) =>
  `${file}::${symbol ?? ''}::${firstLine}`

/**
 * What actually happened to each gap.
 *
 * The agent's claim is never the verdict. A gap is `closed` when NONE of its uncovered lines are
 * still uncovered in the fresh report — matched by LINES, never by (file, symbol). `gap.ts` groups
 * gaps by symbol IDENTITY, not name, so two distinct gaps can share a file and a symbol name
 * (overloads, several `impl Foo` blocks); matching by name would let one gap's verdict leak onto
 * its sibling. Matching by lines is also immune to partial coverage: a symbol that is only
 * partly covered still has some of its original lines in the after-report, so it correctly reads
 * as `open`, never `closed`.
 *
 * One exception, and it is the important one: a REJECTED attempt stays rejected even if the gap
 * vanished. A test that asserts nothing still executes the lines, so coverage rises and the gap
 * disappears from the after-report — believing the report there would launder the exact trick the
 * assertion gate just caught.
 */
export function reconcile(before: Gap[], after: Gap[], attempts: Attempt[]): Outcome[] {
  const stillUncovered = new Map<string, Set<number>>()
  for (const g of after) {
    const lines = stillUncovered.get(g.file) ?? new Set<number>()
    for (const n of g.lines) lines.add(n)
    stillUncovered.set(g.file, lines)
  }

  const isClosed = (gap: Gap): boolean => {
    const lines = stillUncovered.get(gap.file)
    if (!lines) return true
    return !gap.lines.some((n) => lines.has(n))
  }

  const byGap = new Map(attempts.map((a) => [attemptKey(a.file, a.symbol, a.line), a]))

  return ranked(before).map((gap) => {
    const attempt = byGap.get(attemptKey(gap.file, gap.symbol, gap.lines[0] ?? 0))

    // the gates already reached a final answer; the after-report cannot overturn it
    if (attempt && attempt.verdict !== 'closed') {
      return { gap, verdict: attempt.verdict, ...(attempt.note ? { note: attempt.note } : {}) }
    }

    if (attempt && isClosed(gap)) {
      return { gap, verdict: 'closed' as const, ...(attempt.testFile ? { testFile: attempt.testFile } : {}) }
    }

    return { gap, verdict: 'open' as const }
  })
}
