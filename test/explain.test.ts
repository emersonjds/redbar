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
