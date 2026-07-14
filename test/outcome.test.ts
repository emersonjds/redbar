import { describe, expect, it } from 'vitest'
import { isMeasured, reconcile, type Attempt } from '../src/outcome.js'
import type { Gap } from '../src/types.js'

const gap = (symbol: string, over: Partial<Gap> = {}): Gap => ({
  file: 'src/calc.ts',
  symbol,
  lines: [10, 11],
  fullyUncovered: true,
  branches: 6,
  kind: 'unit',
  score: 100,
  ...over,
})

const attempt = (symbol: string, over: Partial<Attempt> = {}): Attempt => ({
  file: 'src/calc.ts',
  symbol,
  line: 10,
  verdict: 'closed',
  ...over,
})

describe('reconcile', () => {
  it('a gap the agent wrote a test for, and that is GONE from the fresh report, is closed', () => {
    const outcomes = reconcile([gap('divide')], [], [attempt('divide', { testFile: 'src/calc.test.ts' })])

    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]!.verdict).toBe('closed')
    expect(outcomes[0]!.testFile).toBe('src/calc.test.ts')
  })

  it('a gap the agent CLAIMED to close but that is still in the fresh report is open, not closed', () => {
    // the whole point: the agent's word loses to the measurement, every time
    const outcomes = reconcile([gap('divide')], [gap('divide')], [attempt('divide')])

    expect(outcomes[0]!.verdict).toBe('open')
  })

  it('keeps a rejected verdict even when the gap disappeared from the fresh report', () => {
    // a test with no assertion still EXECUTES the lines, so coverage rises and the gap vanishes.
    // Trusting the after-report here would launder exactly the trick the assertion gate caught.
    const outcomes = reconcile([gap('divide')], [], [attempt('divide', { verdict: 'no-assertion' })])

    expect(outcomes[0]!.verdict).toBe('no-assertion')
  })

  it('keeps touched-source even when the gap disappeared', () => {
    const outcomes = reconcile([gap('divide')], [], [attempt('divide', { verdict: 'touched-source' })])
    expect(outcomes[0]!.verdict).toBe('touched-source')
  })

  it('carries the agent note on needs-human, and nowhere else', () => {
    const outcomes = reconcile(
      [gap('divide')],
      [gap('divide')],
      [attempt('divide', { verdict: 'needs-human', note: 'needs a running database' })],
    )

    expect(outcomes[0]!.verdict).toBe('needs-human')
    expect(outcomes[0]!.note).toBe('needs a running database')
  })

  it('a gap with no attempt at all comes back open', () => {
    expect(reconcile([gap('divide')], [gap('divide')], [])[0]!.verdict).toBe('open')
  })

  it('matches an attempt to its gap by file AND symbol — two symbols can share a name', () => {
    const outcomes = reconcile(
      [gap('divide'), gap('divide', { file: 'src/other.ts' })],
      [gap('divide', { file: 'src/other.ts' })],
      [attempt('divide', { testFile: 'src/calc.test.ts' })],
    )

    expect(outcomes.find((o) => o.gap.file === 'src/calc.ts')!.verdict).toBe('closed')
    expect(outcomes.find((o) => o.gap.file === 'src/other.ts')!.verdict).toBe('open')
  })

  it('two gaps, same file, same symbol name, different lines: an attempt on one never decides the other', () => {
    // gap.ts groups by symbol IDENTITY, not name — two `impl Foo` blocks, two overloads. The key
    // built from (file, symbol) alone collapses them; this locks in that they stay independent.
    const gapA = gap('divide', { lines: [10, 11] })
    const gapB = gap('divide', { lines: [20, 21] })

    const outcomes = reconcile(
      [gapA, gapB],
      [gapB], // gapA's lines are gone from the fresh report; gapB's are still there
      [attempt('divide', { line: 10, testFile: 'src/calc.test.ts' })], // targets gapA only
    )

    const outcomeA = outcomes.find((o) => o.gap.lines[0] === 10)!
    const outcomeB = outcomes.find((o) => o.gap.lines[0] === 20)!

    expect(outcomeA.verdict).toBe('closed')
    // gapB has no attempt of its own — it must not inherit gapA's verdict, and must not be
    // closed just because it shares a symbol name with a gap that closed.
    expect(outcomeB.verdict).toBe('open')
  })

  it('a partially-covered symbol is open, never closed, even with an attempt', () => {
    // the after-report still carries SOME of the before-gap's lines: the symbol was touched but
    // not finished. Matching by lines[0] alone would change key and make this read as absent —
    // and reconcile must never manufacture a false "closed".
    const before = gap('divide', { lines: [10, 11, 12] })
    const after = gap('divide', { lines: [11] }) // line 11 still uncovered

    const outcomes = reconcile([before], [after], [attempt('divide', { line: 10, testFile: 'src/calc.test.ts' })])

    expect(outcomes[0]!.verdict).toBe('open')
  })

  it('a gap absent from the fresh report with no attempt at all is open, not closed', () => {
    // nothing ran on this gap — another gap's test may have incidentally covered it, but redbar
    // did not do that work and must not claim it. Deleting the `attempt &&` guard must fail this.
    const outcomes = reconcile([gap('divide')], [], [])

    expect(outcomes[0]!.verdict).toBe('open')
  })

  it('orders the outcomes worst-band first, like every other redbar output', () => {
    const outcomes = reconcile(
      [gap('mild', { fullyUncovered: false, branches: 0, score: 9999 }), gap('nasty')],
      [],
      [],
    )
    expect(outcomes[0]!.gap.symbol).toBe('nasty')
  })
})

describe('isMeasured', () => {
  it('every verdict except needs-human is a measurement', () => {
    expect(isMeasured('closed')).toBe(true)
    expect(isMeasured('open')).toBe(true)
    expect(isMeasured('no-assertion')).toBe(true)
    expect(isMeasured('touched-source')).toBe(true)
    expect(isMeasured('too-many-files')).toBe(true)
  })

  it('needs-human is the agent talking, and must be labelled as such', () => {
    expect(isMeasured('needs-human')).toBe(false)
    expect(isMeasured('timeout')).toBe(false)
    expect(isMeasured('no-output')).toBe(false)
  })
})
