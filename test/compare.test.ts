import { describe, expect, it } from 'vitest'
import { compareRuns, renderTrendHtml, renderTrendText } from '../src/compare.js'
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

  // key() falls back to '' for a gap the attribution step could not tie to a symbol
  it('treats two null-symbol gaps in the same file as the same identity', () => {
    const a = [gap({ file: 'src/a.ts', symbol: null })]
    const b = [gap({ file: 'src/a.ts', symbol: null })]
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

  // regression is a report too: a band that got worse must read +N, and the new gaps get listed
  it('shows new gaps and a positive band delta when things regressed', () => {
    const a = [gap({ file: 'src/a.ts', symbol: 'Kept', fullyUncovered: true, branches: 6 })]
    const b = [
      gap({ file: 'src/a.ts', symbol: 'Kept', fullyUncovered: true, branches: 6 }),
      gap({ file: 'src/new.ts', symbol: 'Regression', fullyUncovered: true, branches: 6 }),
    ]
    const text = renderTrendText(compareRuns(a, b), '2026-07-22', '2026-07-29')
    expect(text).toContain('closed: 0')
    expect(text).toContain('new: 1')
    expect(text).toContain('critical +1') // not progress — no ✓, a signed increase
    expect(text).toContain('Regression — src/new.ts') // the new gap, named under `new:`
  })

  it('falls back to (no symbol) for a closed or new gap the engine could not attribute', () => {
    const a = [gap({ file: 'src/a.ts', symbol: null, fullyUncovered: true, branches: 6 })]
    const b = [gap({ file: 'src/b.ts', symbol: null, fullyUncovered: true, branches: 6 })]
    const text = renderTrendText(compareRuns(a, b), '2026-07-22', '2026-07-29')
    expect(text).toContain('(no symbol) — src/a.ts')
    expect(text).toContain('(no symbol) — src/b.ts')
  })
})

describe('renderTrendHtml', () => {
  it('carries the counts, the signed band delta, and escapes user strings', () => {
    const a = [gap({ file: 'src/<x>.ts', symbol: 'A<B', fullyUncovered: true, branches: 6 })]
    const b: Gap[] = []
    const html = renderTrendHtml(compareRuns(a, b), '2026-07-22', '2026-07-29')
    expect(html).toContain('critical -1 ✓') // the same signed number as the text report
    expect(html).toContain('A&lt;B') // symbol escaped
    expect(html).toContain('src/&lt;x&gt;.ts') // file escaped
    expect(html).not.toContain('<code>A<B</code>') // never the raw angle brackets
  })

  it('renders the New section without a Closed section when nothing closed', () => {
    const a: Gap[] = []
    const b = [gap({ file: 'src/new.ts', symbol: null, fullyUncovered: true, branches: 6 })]
    const html = renderTrendHtml(compareRuns(a, b), '2026-07-22', '2026-07-29')
    expect(html).not.toContain('<h2>Closed</h2>')
    expect(html).toContain('<h2>New</h2>')
    expect(html).toContain('(no symbol)') // null symbol escaped through the same fallback as text
  })
})
