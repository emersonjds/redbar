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

/**
 * changedFiles() is called twice per gap now (baseline, then after the agent runs) — this returns
 * one array per call, in order, and keeps repeating the last one for any call beyond the list. That
 * "repeat the last state" behaviour models a real working tree: nothing else touches it between
 * calls unless a test says so.
 */
const sequence = (...states: string[][]) => {
  let i = 0
  return () => states[Math.min(i++, states.length - 1)]!
}

/** every effect stubbed; each test overrides only the one it is about */
const effects = (over: Partial<Effects> = {}): Effects => ({
  runAgent: () => 'done',
  changedFiles: sequence([], ['src/calc.test.ts']),
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

describe('executeGaps — the baseline (a human or a prior gap must never be blamed on this one)', () => {
  it('does not revert a product file that was already dirty before the agent ran', () => {
    const revertFile = vi.fn()
    // baseline already contains src/calc.ts — a human's uncommitted edit that existed before
    // this gap's agent ever ran. The agent then adds a test file of its own.
    const attempts = executeGaps(
      [gap()],
      ts,
      {},
      effects({
        changedFiles: sequence(['src/calc.ts'], ['src/calc.ts', 'src/calc.test.ts']),
        revertFile,
      }),
      source,
    )

    expect(revertFile).not.toHaveBeenCalled()
    expect(attempts[0]!.verdict).toBe('closed')
  })

  it('gap 2 does not adopt gap 1\'s already-written test file when its own agent writes nothing', () => {
    // gap 1's baseline is empty, then it writes src/calc.test.ts, which is accepted and stays
    // dirty in the tree forever after. Gap 2's baseline is taken AFTER that, so it already
    // contains src/calc.test.ts — and gap 2's agent writes nothing at all.
    const attempts = executeGaps(
      [gap(), gap({ file: 'src/other.ts', symbol: 'other' })],
      ts,
      {},
      effects({ changedFiles: sequence([], ['src/calc.test.ts']) }),
      source,
    )

    expect(attempts[0]).toMatchObject({ verdict: 'closed', testFile: 'src/calc.test.ts' })
    expect(attempts[1]).toMatchObject({ verdict: 'no-output' })
    expect(attempts[1]!.testFile).toBeUndefined()
  })

  it('gap 2\'s scope gate does not delete gap 1\'s already-accepted test file', () => {
    const deleteFile = vi.fn()
    // gap 1 writes and gets src/calc.test.ts accepted. gap 2's baseline picks that up, then gap
    // 2's agent touches product code (src/other.ts) and writes its own test (src/other.test.ts) —
    // triggering the scope gate, which must only ever touch what GAP 2 produced.
    const attempts = executeGaps(
      [gap(), gap({ file: 'src/other.ts', symbol: 'other' })],
      ts,
      {},
      effects({
        changedFiles: sequence(
          [],
          ['src/calc.test.ts'],
          ['src/calc.test.ts'],
          ['src/calc.test.ts', 'src/other.ts', 'src/other.test.ts'],
        ),
        deleteFile,
      }),
      source,
    )

    expect(deleteFile).toHaveBeenCalledWith('src/other.test.ts')
    expect(deleteFile).not.toHaveBeenCalledWith('src/calc.test.ts')
    expect(attempts[1]).toMatchObject({ verdict: 'touched-source' })
  })
})

describe('executeGaps — gate 1: scope', () => {
  it('reverts product code the agent edited, and does not close the gap', () => {
    const revertFile = vi.fn()
    const attempts = executeGaps(
      [gap()],
      ts,
      {},
      effects({
        changedFiles: sequence([], ['src/calc.test.ts', 'src/calc.ts']),
        revertFile,
      }),
      source,
    )

    // an agent that "fixes" the product to make its test pass closes the gap, raises coverage,
    // greens the suite — and silently changed the behaviour of the system
    expect(revertFile).toHaveBeenCalledWith('src/calc.ts')
    expect(attempts[0]).toMatchObject({ verdict: 'touched-source', line: 10 })
  })

  it('does not revert the test file itself, only the product file, when the agent touches both', () => {
    const revertFile = vi.fn()
    executeGaps(
      [gap()],
      ts,
      {},
      effects({
        changedFiles: sequence([], ['src/calc.test.ts', 'src/calc.ts']),
        revertFile,
      }),
      source,
    )

    expect(revertFile).toHaveBeenCalledWith('src/calc.ts')
    expect(revertFile).not.toHaveBeenCalledWith('src/calc.test.ts')
  })
})

describe('executeGaps — gate 1b: exactly one test file', () => {
  it('deletes every test file and marks too-many-files when the agent writes more than one', () => {
    const deleteFile = vi.fn()
    const attempts = executeGaps(
      [gap()],
      ts,
      {},
      effects({
        changedFiles: sequence([], ['src/calc.test.ts', 'src/calc.extra.test.ts']),
        deleteFile,
      }),
      source,
    )

    expect(deleteFile).toHaveBeenCalledWith('src/calc.test.ts')
    expect(deleteFile).toHaveBeenCalledWith('src/calc.extra.test.ts')
    expect(attempts[0]).toMatchObject({ verdict: 'too-many-files', line: 10 })
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

  it('notes that the file could not be read — a different claim than "asserts nothing"', () => {
    const attempts = executeGaps([gap()], ts, {}, effects({ readFile: () => null }), source)

    expect(attempts[0]!.verdict).toBe('no-assertion')
    expect(attempts[0]!.note).toMatch(/could not.*read/i)
  })

  it('notes that the file asserts nothing when it was read fine but is empty of assertions', () => {
    const attempts = executeGaps([gap()], ts, {}, effects({ readFile: () => EMPTY_TEST }), source)

    expect(attempts[0]!.note).toMatch(/asserts nothing/i)
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

  it('marks timeout when the agent throws, and carries on to the next gap using ITS OWN output', () => {
    const gaps = [gap(), gap({ file: 'src/other.ts', symbol: 'other' })]
    let first = true
    const attempts = executeGaps(
      gaps,
      ts,
      {},
      effects({
        // gap 1 throws before ever calling changedFiles a second time; gap 2 runs clean and
        // writes a file that belongs to it alone — never the shared 'src/calc.test.ts' constant
        // the old version of this test relied on.
        changedFiles: sequence([], [], ['src/other.test.ts']),
        runAgent: () => {
          if (first) { first = false; throw new Error('ETIMEDOUT') }
          return 'ok'
        },
      }),
      source,
    )

    expect(attempts).toHaveLength(2)
    expect(attempts[0]!.verdict).toBe('timeout')
    expect(attempts[1]).toMatchObject({ verdict: 'closed', testFile: 'src/other.test.ts' }) // one bad gap does not end the run
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

  it('carries ONE gap, never the whole list — the OTHER gap\'s identity never leaks into this prompt', () => {
    const gapB = gap({ symbol: 'wholeOtherSymbolNeverMentioned', file: 'src/wholly-unrelated-path.ts' })
    const prompt = buildPrompt(gap(), ts, {}, source())

    expect(prompt).not.toContain(gapB.symbol)
    expect(prompt).not.toContain(gapB.file)
  })
})
