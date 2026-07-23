import { describe, expect, it } from 'vitest'
import {
  authorizationOutcome,
  canonical,
  dirtyTreeError,
  gateResult,
  parseSeverityThreshold,
  renderExecutePlan,
  resolveRun,
} from '../src/cli.js'
import { bandReason, scoreArithmetic } from '../src/explain.js'

describe('canonical', () => {
  it('expande os atalhos de uma letra, estilo cargo/npm', () => {
    expect(canonical('i')).toBe('inspect')
    expect(canonical('b')).toBe('briefing')
    expect(canonical('x')).toBe('execute')
    expect(canonical('why')).toBe('explain')
  })

  it('deixa o nome completo e o desconhecido passarem intactos', () => {
    expect(canonical('inspect')).toBe('inspect')
    expect(canonical('nope')).toBe('nope')
  })
})
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

describe('dirtyTreeError', () => {
  it('returns null on a clean tree', () => {
    expect(dirtyTreeError('')).toBeNull()
    expect(dirtyTreeError('\n')).toBeNull()
  })

  it('refuses a tree with a modified file, and names it', () => {
    const message = dirtyTreeError(' M src/checkout.ts\n')
    expect(message).not.toBeNull()
    expect(message).toContain('src/checkout.ts')
    expect(message).toMatch(/commit or stash/i)
  })

  it('refuses a tree with an untracked file', () => {
    const message = dirtyTreeError('?? notes.md\n')
    expect(message).toContain('notes.md')
  })

  it('names every dirty path, staged or not', () => {
    const message = dirtyTreeError('M  src/a.ts\n D src/b.ts\n?? c.ts\n')
    for (const file of ['src/a.ts', 'src/b.ts', 'c.ts']) expect(message).toContain(file)
  })

  it('says why: execute reverts files and cannot tell its writes from the developer\'s', () => {
    const message = dirtyTreeError(' M src/a.ts\n') ?? ''
    expect(message).toMatch(/revert/i)
  })

  it('decodes a git rename entry and reports the new path', () => {
    const message = dirtyTreeError('R  old.ts -> new.ts\n')
    expect(message).not.toBeNull()
    expect(message).toContain('new.ts')
    expect(message).not.toContain('old.ts')
  })
})

describe('parseSeverityThreshold', () => {
  it('defaults to critical — execute writes the least without an opt-in', () => {
    expect(parseSeverityThreshold(undefined)).toBe('critical')
  })

  it('takes any band name, and "all" for the escape hatch', () => {
    expect(parseSeverityThreshold('high')).toBe('high')
    expect(parseSeverityThreshold('low')).toBe('low')
    expect(parseSeverityThreshold('all')).toBe('all')
  })

  it('rejects a value that is not a band', () => {
    expect(() => parseSeverityThreshold('urgent')).toThrow(/severity/i)
  })
})

describe('authorizationOutcome', () => {
  it('proceeds without asking when --yes is passed', () => {
    expect(authorizationOutcome({ yes: true, isTTY: false })).toBe('proceed')
    expect(authorizationOutcome({ yes: true, isTTY: true })).toBe('proceed')
  })

  it('asks on an interactive terminal', () => {
    expect(authorizationOutcome({ yes: false, isTTY: true })).toBe('ask')
  })

  it('stops — touches nothing — when there is no --yes and no TTY to ask', () => {
    expect(authorizationOutcome({ yes: false, isTTY: false })).toBe('stop')
  })
})

describe('resolveRun', () => {
  const runs = ['2026-07-22T09-10-00', '2026-07-22T21-55-30', '2026-07-29T09-10-00']

  it('matches an exact run id', () => {
    expect(resolveRun(runs, '2026-07-29T09-10-00')).toBe('2026-07-29T09-10-00')
  })

  it('matches a date prefix, taking that day\'s latest run', () => {
    expect(resolveRun(runs, '2026-07-22')).toBe('2026-07-22T21-55-30')
  })

  it('throws when nothing matches', () => {
    expect(() => resolveRun(runs, '2020-01-01')).toThrow(/no run matches/i)
  })
})

describe('renderExecutePlan', () => {
  const critical = gap({ fullyUncovered: true, branches: 6, symbol: 'Checkout', score: 240 })

  it('shows each gap with its measured why — band, symbol, the score arithmetic, the reason', () => {
    const plan = renderExecutePlan([critical])
    expect(plan).toContain('Checkout')
    expect(plan).toContain('critical')
    expect(plan).toContain(scoreArithmetic(critical)) // the arithmetic, verbatim
    expect(plan).toContain(bandReason(critical).replace(/^ — /, '')) // the measured reason
  })

  it('the why is the same string every run — nothing here is model-authored', () => {
    expect(renderExecutePlan([critical])).toBe(renderExecutePlan([critical]))
  })
})
