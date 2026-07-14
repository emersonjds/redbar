import { describe, expect, it, vi } from 'vitest'
import { buildPrompt, executeGaps, type Effects } from '../src/execute.js'
import { byId } from '../src/languages.js'
import type { Gap } from '../src/types.js'

const ts = byId('ts')!

const gap = (over: Partial<Gap> = {}): Gap => ({
  file: 'src/calc.ts',
  symbol: 'divide',
  lines: [10, 11],
  fullyUncovered: true,
  branches: 6,
  kind: 'unit',
  score: 100,
  ...over,
})

const PASSING_TEST = `
import { expect, it } from 'vitest'
import { divide } from './calc.js'
it('throws on zero', () => {
  expect(() => divide(1, 0)).toThrow()
})`

const EMPTY_TEST = `
import { it } from 'vitest'
import { divide } from './calc.js'
it('runs', () => { divide(1, 2) })`

/** every effect stubbed; each test overrides only the one it is about */
const effects = (over: Partial<Effects> = {}): Effects => ({
  runAgent: () => 'done',
  changedFiles: () => ['src/calc.test.ts'],
  readFile: () => PASSING_TEST,
  deleteFile: vi.fn(),
  revertFile: vi.fn(),
  runTest: () => true,
  ...over,
})

const source = () => 'export function divide(a, b) { if (b === 0) throw new Error() }'

describe('executeGaps — the happy path', () => {
  it('accepts a test that asserts something and passes', () => {
    const attempts = executeGaps([gap()], ts, {}, effects(), source)

    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ verdict: 'closed', testFile: 'src/calc.test.ts', line: 10 })
  })

  it('works the gaps worst-band first — the agent spends its best attempt on the worst gap', () => {
    const seen: string[] = []
    const gaps = [
      gap({ symbol: 'mild', fullyUncovered: false, branches: 0, score: 9999 }),
      gap({ symbol: 'nasty', file: 'src/x.ts' }),
    ]
    executeGaps(gaps, ts, {}, effects({ runAgent: (p) => { seen.push(p); return 'ok' } }), source)

    expect(seen[0]).toContain('nasty')
  })
})

describe('executeGaps — gate 1: scope', () => {
  it('reverts product code the agent edited, and does not close the gap', () => {
    const revertFile = vi.fn()
    const attempts = executeGaps(
      [gap()],
      ts,
      {},
      effects({ changedFiles: () => ['src/calc.test.ts', 'src/calc.ts'], revertFile }),
      source,
    )

    // an agent that "fixes" the product to make its test pass closes the gap, raises coverage,
    // greens the suite — and silently changed the behaviour of the system
    expect(revertFile).toHaveBeenCalledWith('src/calc.ts')
    expect(attempts[0]).toMatchObject({ verdict: 'touched-source', line: 10 })
  })

  it('does not revert the test file itself', () => {
    const revertFile = vi.fn()
    executeGaps([gap()], ts, {}, effects({ revertFile }), source)

    expect(revertFile).not.toHaveBeenCalled()
  })
})

describe('executeGaps — gate 2: assertions', () => {
  it('deletes a test that asserts nothing, and marks it no-assertion', () => {
    const deleteFile = vi.fn()
    const attempts = executeGaps([gap()], ts, {}, effects({ readFile: () => EMPTY_TEST, deleteFile }), source)

    expect(deleteFile).toHaveBeenCalledWith('src/calc.test.ts')
    expect(attempts[0]).toMatchObject({ verdict: 'no-assertion', line: 10 })
  })

  it('never runs a test that asserts nothing — it would pass, and that is the trap', () => {
    const runTest = vi.fn(() => true)
    executeGaps([gap()], ts, {}, effects({ readFile: () => EMPTY_TEST, runTest }), source)

    expect(runTest).not.toHaveBeenCalled()
  })
})

describe('executeGaps — gate 3: execution', () => {
  it('retries once, and keeps the test when the second run passes', () => {
    let calls = 0
    const attempts = executeGaps(
      [gap()],
      ts,
      {},
      effects({ runTest: () => ++calls > 1 }),
      source,
    )

    expect(calls).toBe(2)
    expect(attempts[0]).toMatchObject({ verdict: 'closed', line: 10 })
  })

  it('deletes the test and marks needs-human when it fails twice', () => {
    const deleteFile = vi.fn()
    const attempts = executeGaps([gap()], ts, {}, effects({ runTest: () => false, deleteFile }), source)

    expect(deleteFile).toHaveBeenCalledWith('src/calc.test.ts')
    expect(attempts[0]).toMatchObject({ verdict: 'needs-human', line: 10 })
  })

  it('carries the agent stdout as the note on needs-human — it is the only place a model speaks', () => {
    const attempts = executeGaps(
      [gap()],
      ts,
      {},
      effects({ runTest: () => false, runAgent: () => 'the function needs a live database' }),
      source,
    )

    expect(attempts[0]!.note).toContain('live database')
  })
})

describe('executeGaps — the agent misbehaves', () => {
  it('marks no-output when the agent writes no test file at all', () => {
    const attempts = executeGaps([gap()], ts, {}, effects({ changedFiles: () => [] }), source)
    expect(attempts[0]).toMatchObject({ verdict: 'no-output', line: 10 })
  })

  it('marks timeout when the agent throws, and carries on to the next gap', () => {
    const gaps = [gap(), gap({ file: 'src/other.ts', symbol: 'other' })]
    let first = true
    const attempts = executeGaps(
      gaps,
      ts,
      {},
      effects({
        runAgent: () => {
          if (first) { first = false; throw new Error('ETIMEDOUT') }
          return 'ok'
        },
      }),
      source,
    )

    expect(attempts).toHaveLength(2)
    expect(attempts[0]!.verdict).toBe('timeout')
    expect(attempts[1]!.verdict).toBe('closed') // one bad gap does not end the run
  })
})

describe('buildPrompt', () => {
  it('carries the gap, the layer, the source and the one-file rule', () => {
    const prompt = buildPrompt(gap(), ts, {}, source())

    expect(prompt).toContain('divide')
    expect(prompt).toContain('src/calc.ts')
    expect(prompt).toContain('unit')
    expect(prompt).toMatch(/exactly one test file/i)
    expect(prompt).toMatch(/never weaken an assertion/i)
  })

  it('inlines the convention for the layer when the project ships one', () => {
    const prompt = buildPrompt(gap({ kind: 'e2e' }), ts, { e2e: 'NEVER USE A CSS SELECTOR' }, source())
    expect(prompt).toContain('NEVER USE A CSS SELECTOR')
  })

  it('names the canonical standard when no convention file exists for the layer', () => {
    const prompt = buildPrompt(gap({ kind: 'e2e' }), ts, {}, source())
    expect(prompt).toContain(ts.standards.e2e.url)
  })

  it('carries ONE gap, never the whole list — a small prompt is a focused agent', () => {
    const prompt = buildPrompt(gap(), ts, {}, source())
    expect(prompt).not.toContain('other')
  })
})
