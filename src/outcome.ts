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
  verdict: Verdict
  /** the test file the agent wrote, when one survived the gates */
  testFile?: string
  /** the agent's own words. ONLY ever carried on needs-human, and always labelled as its words */
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

const key = (file: string, symbol: string | null) => `${file}::${symbol ?? ''}`

/**
 * What actually happened to each gap.
 *
 * The agent's claim is never the verdict. A gap is `closed` when it was in the BEFORE report and is
 * absent from the AFTER report — i.e. the fresh coverage run says those lines now execute.
 *
 * One exception, and it is the important one: a REJECTED attempt stays rejected even if the gap
 * vanished. A test that asserts nothing still executes the lines, so coverage rises and the gap
 * disappears from the after-report — believing the report there would launder the exact trick the
 * assertion gate just caught.
 */
export function reconcile(before: Gap[], after: Gap[], attempts: Attempt[]): Outcome[] {
  const stillOpen = new Set(after.map((g) => key(g.file, g.symbol)))
  const byGap = new Map(attempts.map((a) => [key(a.file, a.symbol), a]))

  return ranked(before).map((gap) => {
    const attempt = byGap.get(key(gap.file, gap.symbol))

    // the gates already reached a final answer; the after-report cannot overturn it
    if (attempt && attempt.verdict !== 'closed') {
      return { gap, verdict: attempt.verdict, ...(attempt.note ? { note: attempt.note } : {}) }
    }

    const closed = !stillOpen.has(key(gap.file, gap.symbol))
    if (attempt && closed) {
      return { gap, verdict: 'closed' as const, ...(attempt.testFile ? { testFile: attempt.testFile } : {}) }
    }

    return { gap, verdict: 'open' as const }
  })
}
