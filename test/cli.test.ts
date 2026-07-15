import { describe, expect, it } from 'vitest'
import { canonical, dirtyTreeError, gateResult } from '../src/cli.js'

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
