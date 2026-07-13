import { describe, expect, it } from 'vitest'
import { gateResult } from '../src/cli.js'
import type { Gap } from '../src/types.js'

const gap = (overrides: Partial<Pick<Gap, 'fullyUncovered' | 'branches'>>): Gap => ({
  file: 'src/foo.ts',
  symbol: 'foo',
  lines: [1],
  fullyUncovered: true,
  branches: 6,
  kind: 'unit',
  score: 100,
  ...overrides,
})

describe('gateResult', () => {
  it('counts gaps by severity band', () => {
    const gaps = [
      gap({ fullyUncovered: true, branches: 6 }), // critical
      gap({ fullyUncovered: true, branches: 1 }), // high
      gap({ fullyUncovered: true, branches: 0 }), // medium
      gap({ fullyUncovered: false, branches: 0 }), // low
    ]
    const { counts } = gateResult(gaps, { maxCritical: 0, maxHigh: Infinity })
    expect(counts).toEqual({ critical: 1, high: 1, medium: 1, low: 1 })
  })

  it('fails when critical count exceeds maxCritical (default 0)', () => {
    const gaps = [gap({ fullyUncovered: true, branches: 6 })]
    expect(gateResult(gaps, { maxCritical: 0, maxHigh: Infinity }).failed).toBe(true)
    expect(gateResult(gaps, { maxCritical: 1, maxHigh: Infinity }).failed).toBe(false)
  })

  it('fails when high count exceeds maxHigh', () => {
    const gaps = [gap({ fullyUncovered: true, branches: 1 })]
    expect(gateResult(gaps, { maxCritical: 0, maxHigh: 0 }).failed).toBe(true)
    expect(gateResult(gaps, { maxCritical: 0, maxHigh: 1 }).failed).toBe(false)
  })

  it('passes on an empty gap list', () => {
    expect(gateResult([], { maxCritical: 0, maxHigh: Infinity }).failed).toBe(false)
  })

  it('medium and low counts never affect the gate', () => {
    const gaps = Array.from({ length: 50 }, () => gap({ fullyUncovered: false, branches: 0 }))
    expect(gateResult(gaps, { maxCritical: 0, maxHigh: 0 }).failed).toBe(false)
  })
})
