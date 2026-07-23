import { describe, expect, it } from 'vitest'
import { bandCounts, runDirName, summarize } from '../src/history.js'
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

describe('runDirName', () => {
  it('turns a Date into a sortable, path-safe run id — no colons', () => {
    expect(runDirName(new Date('2026-07-22T21:55:30.123Z'))).toBe('2026-07-22T21-55-30')
  })

  // sortable is the property compare relies on to find "the run before this one"
  it('sorts chronologically as plain strings', () => {
    const earlier = runDirName(new Date('2026-07-22T09:10:00Z'))
    const later = runDirName(new Date('2026-07-29T09:10:00Z'))
    expect([later, earlier].sort()).toEqual([earlier, later])
  })
})

describe('bandCounts', () => {
  it('tallies gaps per band', () => {
    const gaps = [
      gap({ fullyUncovered: true, branches: 6 }), // critical
      gap({ fullyUncovered: true, branches: 1 }), // high
      gap({ fullyUncovered: true, branches: 0 }), // medium
      gap({ fullyUncovered: false, branches: 0 }), // low
    ]
    expect(bandCounts(gaps)).toEqual({ critical: 1, high: 1, medium: 1, low: 1 })
  })
})

describe('summarize', () => {
  it('carries the base ref, the total, the per-band counts, and the run date', () => {
    const gaps = [gap({ fullyUncovered: true, branches: 6 })]
    const s = summarize('origin/main', gaps, new Date('2026-07-22T21:55:30Z'))
    expect(s).toEqual({
      date: '2026-07-22T21:55:30.000Z',
      base: 'origin/main',
      gaps: 1,
      counts: { critical: 1, high: 0, medium: 0, low: 0 },
    })
  })
})
