import { describe, expect, it } from 'vitest'
import { compareRuns, renderTrendText } from '../src/compare.js'
import type { Gap } from '../src/types.js'

const gap = (overrides: Partial<Gap>): Gap => ({
  file: 'src/foo.ts',
  symbol: 'foo',
  lines: [1],
  fullyUncovered: true,
  branches: 6,
  kind: 'unit',
  score: 100,
  ...overrides,
})

describe('compareRuns', () => {
  it('reports a gap present in A and gone in B as closed', () => {
    const a = [gap({ file: 'src/a.ts', symbol: 'A' }), gap({ file: 'src/b.ts', symbol: 'B' })]
    const b = [gap({ file: 'src/b.ts', symbol: 'B' })]
    const { closed, added } = compareRuns(a, b)
    expect(closed.map((g) => g.symbol)).toEqual(['A'])
    expect(added).toEqual([])
  })

  it('reports a gap only in B as added', () => {
    const a = [gap({ file: 'src/a.ts', symbol: 'A' })]
    const b = [gap({ file: 'src/a.ts', symbol: 'A' }), gap({ file: 'src/c.ts', symbol: 'C' })]
    const { closed, added } = compareRuns(a, b)
    expect(added.map((g) => g.symbol)).toEqual(['C'])
    expect(closed).toEqual([])
  })

  // the reason identity is (file, symbol) and not line: code moves, the gap did not open or close
  it('does not report a gap as closed-and-reopened when only its line moved', () => {
    const a = [gap({ file: 'src/a.ts', symbol: 'A', lines: [10] })]
    const b = [gap({ file: 'src/a.ts', symbol: 'A', lines: [42] })] // an import was added above it
    const { closed, added } = compareRuns(a, b)
    expect(closed).toEqual([])
    expect(added).toEqual([])
  })

  it('gives the per-band delta — negative is progress', () => {
    const a = [
      gap({ file: 'src/a.ts', symbol: 'A', fullyUncovered: true, branches: 6 }), // critical
      gap({ file: 'src/b.ts', symbol: 'B', fullyUncovered: true, branches: 6 }), // critical
    ]
    const b = [gap({ file: 'src/b.ts', symbol: 'B', fullyUncovered: true, branches: 6 })] // one critical closed
    expect(compareRuns(a, b).deltaByBand.critical).toBe(-1)
  })
})

describe('renderTrendText', () => {
  it('shows the closed/new counts and the closed symbol names', () => {
    const a = [gap({ file: 'src/a.ts', symbol: 'Checkout', fullyUncovered: true, branches: 6 })]
    const b: Gap[] = []
    const text = renderTrendText(compareRuns(a, b), '2026-07-22', '2026-07-29')
    expect(text).toContain('closed: 1')
    expect(text).toContain('new: 0')
    expect(text).toContain('Checkout')
    expect(text).toContain('critical -1 ✓') // progress, signed
  })
})
