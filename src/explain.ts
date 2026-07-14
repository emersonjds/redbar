// Pure: string in/out, no disk, no process. The audit trail for one gap.
import type { Inspection } from './engine.js'
import { severity } from './severity.js'
import type { Gap } from './types.js'

/**
 * Why this gap exists, and where every number in it came from.
 *
 * This is the answer to the only question that matters in a company: "is this number an AI
 * hallucination?" A paragraph in a README cannot answer it. A command can — and the answer is
 * the same twice, because both inputs are files on disk that anyone can open by hand.
 */
export function explain(inspection: Inspection, gap: Gap): string {
  const { runner, base } = inspection
  const band = severity(gap)
  const lines = gap.lines
  const span = lines.length === 1 ? `line ${lines[0]}` : `lines ${lines[0]}–${lines.at(-1)}`

  const coverageFact = gap.fullyUncovered
    ? `\`${gap.symbol ?? gap.file}\` has **no covered line anywhere in the file** — not one of ` +
      `its ${gap.branches} branch(es) has ever been executed by a test.`
    : `\`${gap.symbol ?? gap.file}\` is **partly covered** — a test already points at it, so the ` +
      `work is to extend that test, not to write one from nothing.`

  return [
    `${gap.symbol ?? '(no symbol)'} — ${gap.file}:${lines[0]}`,
    `${band} · score ${gap.score} · missing a ${gap.kind} test`,
    '',
    'Where the number came from',
    '',
    `  1. ${runner.reportPath}`,
    `       ${lines.length} of the changed line(s) in this symbol are marked NOT executed.`,
    `       The runner measured this. It is not an inference about the code.`,
    '',
    `  2. git diff ${base}...HEAD`,
    `       ${span} of ${gap.file} changed on this branch.`,
    '',
    `  3. changed ∩ uncovered = ${lines.length} line(s): ${summarize(lines)}`,
    '',
    'Why it ranks where it does',
    '',
    `  ${coverageFact}`,
    `  Branches: ${gap.branches} — counted from the source (if / for / while / case / catch / && / ||),`,
    `  ignoring the ones inside comments, strings and regex literals.`,
    '',
    `  score = uncovered lines × (no coverage ? 2 : 1) × (1 + branches)`,
    `        = ${scoreArithmetic(gap)}`,
    '',
    `  band  = ${band}${bandReason(gap)}`,
    '',
    'No language model produced any of the above. Open the two files and check it by hand.',
  ].join('\n')
}

/**
 * The same expression `gap.ts` evaluates, written out with this gap's actual numbers. A reader
 * must be able to reach the score with a calculator and no trust in us — which is the difference
 * between a measurement and an assertion.
 */
export function scoreArithmetic(gap: Gap): string {
  return gap.fullyUncovered
    ? `${gap.lines.length} × 2 × (1 + ${gap.branches}) = ${gap.score}`
    : `${gap.lines.length} × (1 + ${gap.branches}) = ${gap.score}`
}

function bandReason(gap: Gap): string {
  if (gap.fullyUncovered) {
    if (gap.branches >= 5) return ' — no coverage, and 5+ branches (McCabe: past here, it needs a test)'
    if (gap.branches >= 1) return ' — no coverage, and it makes at least one decision'
    return ' — no coverage, but straight-line: bad, and bounded'
  }
  return gap.branches >= 5
    ? ' — partly covered, but dense enough that the covered path is not the risky one'
    : ' — partly covered and simple'
}

/** `[1,2,3,7,8]` → `1-3, 7-8`. A list of 99 line numbers is not readable; the ranges are. */
function summarize(lines: number[]): string {
  const ranges: string[] = []
  let start = lines[0]!
  let prev = start

  for (const n of lines.slice(1)) {
    if (n !== prev + 1) {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
      start = n
    }
    prev = n
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
  return ranges.join(', ')
}

/**
 * Gaps whose symbol or file matches the query. Substring, case-insensitive — a human typing
 * `checkout` means the Checkout symbol, and making them type the exact path defeats the point.
 * An empty query matches everything: `redbar explain` with no argument explains the whole list.
 */
export function matchGaps(gaps: Gap[], query: string): Gap[] {
  const q = query.trim().toLowerCase()
  if (!q) return gaps
  return gaps.filter(
    (g) => (g.symbol ?? '').toLowerCase().includes(q) || g.file.toLowerCase().includes(q),
  )
}
