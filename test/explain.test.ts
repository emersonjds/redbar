import { describe, expect, it } from 'vitest'
import type { Inspection } from '../src/engine.js'
import { explain, matchGaps } from '../src/explain.js'
import { byId } from '../src/languages.js'
import type { Gap } from '../src/types.js'

const language = byId('ts')!
const runner = language.runners[0]!

const gap = (overrides: Partial<Gap> = {}): Gap => ({
  file: 'src/checkout.ts',
  symbol: 'Checkout',
  lines: [124, 125, 126],
  fullyUncovered: true,
  branches: 28,
  kind: 'e2e',
  score: 174,
  ...overrides,
})

const inspection = (gaps: Gap[]): Inspection => ({
  language,
  runner,
  base: 'origin/main',
  gaps,
  coverage: new Map(),
})

describe('explain', () => {
  it('names both sources the number came from — the report and the diff', () => {
    const text = explain(inspection([gap()]), gap())

    expect(text).toContain(runner.reportPath) // coverage/lcov.info
    expect(text).toContain('git diff origin/main')
  })

  it('shows the score as arithmetic, with every factor spelled out', () => {
    // 3 lines × 2 (no coverage) × (1 + 28 branches) = 174
    const text = explain(inspection([gap()]), gap())

    expect(text).toContain('3 × 2 × (1 + 28) = 174')
  })

  it('drops the ×2 factor from the arithmetic when the symbol is partly covered', () => {
    const partly = gap({ fullyUncovered: false, branches: 4, lines: [10, 11], score: 10 })
    const text = explain(inspection([partly]), partly)

    expect(text).toContain('2 × (1 + 4) = 10')
    expect(text).not.toContain('× 2 ×')
  })

  it('justifies the band from the two facts that produced it, not from an opinion', () => {
    const text = explain(inspection([gap()]), gap())

    expect(text).toContain('critical')
    expect(text).toContain('no covered line') // fact 1: zero coverage
    expect(text).toContain('28') // fact 2: the branch count
  })

  it('states that no model was involved — the claim the whole tool rests on', () => {
    expect(explain(inspection([gap()]), gap())).toContain('No language model')
  })

  it('lists the uncovered lines it is talking about', () => {
    const text = explain(inspection([gap()]), gap())
    expect(text).toContain('124')
  })

  it('summarizes a non-contiguous line list as separate ranges', () => {
    const scattered = gap({ lines: [1, 2, 3, 7, 8], branches: 0 })
    const text = explain(inspection([scattered]), scattered)

    expect(text).toContain('1-3, 7-8')
  })

  it('bands an uncovered symbol that makes exactly one decision without the 5+ branch reason', () => {
    const oneBranch = gap({ fullyUncovered: true, branches: 1 })
    const text = explain(inspection([oneBranch]), oneBranch)

    expect(text).toContain('no coverage, and it makes at least one decision')
  })

  it('bands an uncovered, branch-free symbol as bad but bounded', () => {
    const straightLine = gap({ fullyUncovered: true, branches: 0 })
    const text = explain(inspection([straightLine]), straightLine)

    expect(text).toContain('no coverage, but straight-line: bad, and bounded')
  })

  it('names a single line as "line N" instead of a range', () => {
    const single = gap({ lines: [42] })
    const text = explain(inspection([single]), single)

    expect(text).toContain('line 42')
  })

  it('bands a dense, partly covered symbol as dense rather than simple', () => {
    const dense = gap({ fullyUncovered: false, branches: 9, lines: [10], score: 10 })
    const text = explain(inspection([dense]), dense)

    expect(text).toContain('partly covered, but dense enough that the covered path is not the risky one')
  })

  it('falls back to the file path when a partly-covered gap has no symbol', () => {
    const anonymous = gap({ symbol: null, fullyUncovered: false, branches: 1 })
    const text = explain(inspection([anonymous]), anonymous)

    expect(text).toContain(`\`${anonymous.file}\` is **partly covered**`)
  })
})

describe('matchGaps', () => {
  const gaps = [
    gap({ symbol: 'Checkout', file: 'src/pages/checkout.tsx' }),
    gap({ symbol: 'request', file: 'src/api.ts' }),
    gap({ symbol: null, file: 'src/anon.ts' }),
  ]

  it('matches on the symbol name, case-insensitively', () => {
    expect(matchGaps(gaps, 'checkout').map((g) => g.symbol)).toContain('Checkout')
  })

  it('matches on the file path', () => {
    expect(matchGaps(gaps, 'src/api.ts').map((g) => g.symbol)).toEqual(['request'])
  })

  it('returns every gap when the query is empty — explain with no argument explains it all', () => {
    expect(matchGaps(gaps, '')).toHaveLength(3)
  })

  it('returns nothing when the query matches nothing, rather than guessing at a near miss', () => {
    expect(matchGaps(gaps, 'nonexistent')).toEqual([])
  })

  it('does not crash on a gap whose symbol could not be attributed', () => {
    expect(matchGaps(gaps, 'anon').map((g) => g.file)).toEqual(['src/anon.ts'])
  })
})
