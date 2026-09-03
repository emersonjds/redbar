import { describe, expect, it } from 'vitest'
import { audit, type AuditInput } from '../src/audit.js'
import type { Inspection } from '../src/engine.js'
import { LANGUAGES, byId } from '../src/languages.js'
import type { Coverage, Gap } from '../src/types.js'

const ts = byId('ts')!
const vitest = ts.runners[0]!

const MANIFEST_WITH_RUNNER = '{"devDependencies":{"vitest":"^1.0.0","express":"^4.0.0"}}'

function inspection(gaps: Gap[] = [], stale?: boolean): Inspection {
  return { language: ts, runner: vitest, base: '(whole repository)', gaps, coverage: new Map(), stale }
}

function gap(file: string, kind: Gap['kind'], lines: number[]): Gap {
  return { file, symbol: null, lines, fullyUncovered: true, branches: 0, kind, score: 1 }
}

function coverageOf(entries: Record<string, { covered: number[]; uncovered: number[] }>): Coverage {
  return new Map(Object.entries(entries).map(([file, c]) => [file, { file, ...c }]))
}

function input(over: Partial<AuditInput> = {}): AuditInput {
  const sources: Record<string, string> = {
    'src/math.ts': 'export const add = (a, b) => a + b\n',
    'test/math.test.ts': "import { add } from '../src/math.js'\nit('adds', () => { expect(add(1, 1)).toBe(2) })\n",
  }

  return {
    inspection: inspection(),
    coverage: coverageOf({ 'src/math.ts': { covered: [1], uncovered: [] } }),
    testFiles: ['test/math.test.ts'],
    productFiles: ['src/math.ts'],
    readSource: (file) => sources[file] ?? null,
    manifest: MANIFEST_WITH_RUNNER,
    ...over,
  }
}

/** every number a failed line claims must be in the sentence — the `explain` contract */
function failedDetails(result: ReturnType<typeof audit>): string[] {
  return result.checks.filter((c) => !c.passed).map((c) => c.detail)
}

describe('audit', () => {
  describe('setup', () => {
    it('scores 100 when there are tests, a runner in the manifest, and a parsed report', () => {
      expect(audit(input()).scores.setup).toBe(100)
    })

    it('loses 25 when the runner is a fallback guess rather than named in the manifest', () => {
      const result = audit(input({ manifest: '{"name":"nothing-here"}' }))

      expect(result.scores.setup).toBe(75)
      expect(failedDetails(result)).toContainEqual(expect.stringContaining('vitest'))
    })

    it('loses 25 when the coverage report parsed no file', () => {
      expect(audit(input({ coverage: new Map() })).scores.setup).toBe(75)
    })

    // Setup === 0 is the 0-to-1 axis: scoring coverage for someone who has no tests answers a
    // question they did not ask.
    it('short-circuits at 0: the other categories are ABSENT, not zero', () => {
      const result = audit(
        input({ testFiles: [], coverage: new Map(), manifest: '{"name":"empty"}' }),
      )

      expect(result.unmeasurable).toBe(true)
      expect(result.scores).toEqual({ setup: 0 })
      expect(result.scores.coverage).toBeUndefined()
      expect(result.scores.rigor).toBeUndefined()
      expect(result.scores.pyramid).toBeUndefined()
      expect(result.checks.every((c) => c.category === 'setup')).toBe(true)
      expect(result.overall).toBe(0)
    })

    // Rigor divides by the number of test files. A repository with a runner, a report and no file
    // the runner collects still has nothing to divide by, and `scoreRigor`'s `return 0` would be a
    // measurement that never happened — the short-circuit is about the DENOMINATOR, not about Setup.
    it('short-circuits on zero test files even when the runner and the report are fine', () => {
      const result = audit(input({ testFiles: [] }))

      expect(result.unmeasurable).toBe(true)
      expect(result.scores).toEqual({ setup: 50 })
      expect(result.overall).toBe(10) // 50 × 0.20, the fixed weight, nothing renormalised
    })

    it('names the pattern it measured instead of accusing the repository of having no tests', () => {
      const result = audit(input({ testFiles: [] }))

      expect(failedDetails(result)).toContainEqual(`no file matches ${ts.testPattern}`)
      expect(result.checks.some((c) => c.detail.includes('the repository has 0 tests'))).toBe(false)
    })

    it('the passing sentence names the pattern too', () => {
      const passed = audit(input()).checks.filter((c) => c.passed).map((c) => c.detail)

      expect(passed).toContainEqual(`1 test file(s) match ${ts.testPattern}`)
    })
  })

  describe('coverage', () => {
    // the rule gap.ts already rests on: an absent file is a file no test imports, which is the
    // biggest gap there is — never "uninstrumented"
    it('counts a product file absent from the report as fully uncovered', () => {
      const sources: Record<string, string> = {
        'src/math.ts': 'export const add = (a, b) => a + b\n',
        // 4 non-blank lines, absent from the coverage map
        'src/dark.ts': 'export function dark() {\n\n  return 1\n}\n',
      }
      const result = audit(
        input({
          productFiles: ['src/math.ts', 'src/dark.ts'],
          readSource: (file) => sources[file] ?? null,
        }),
      )

      // 1 covered of (1 present + 3 non-blank absent) = 25%
      expect(result.scores.coverage).toBe(25)
      expect(failedDetails(result)).toContainEqual(
        '1 of 2 product files (50%) have no coverage at all',
      )
      expect(failedDetails(result)).toContainEqual('3 of 4 executable lines are untested')
    })

    it('scores 100 and passes both checks when every executable line is covered', () => {
      const result = audit(input())

      expect(result.scores.coverage).toBe(100)
      expect(result.checks.filter((c) => c.category === 'coverage').every((c) => c.passed)).toBe(
        true,
      )
    })

    it('uses the same executable-line definition for coverage and pyramid', () => {
      const sources: Record<string, string> = {
        'src/math.ts': 'export const add = (a, b) => a + b\n',
        'src/dark.ts': 'export function dark() {\n\n  return 1\n}\n',
      }
      const result = audit(
        input({
          productFiles: ['src/math.ts', 'src/dark.ts'],
          readSource: (file) => sources[file] ?? null,
          // the whole absent file reads as a gap, blank line included
          inspection: inspection([gap('src/dark.ts', 'unit', [1, 2, 3, 4])]),
          manifest: '{"devDependencies":{"vitest":"^1.0.0"}}',
        }),
      )

      // 3 unit lines of 4 are dark, and the rate never exceeds 1 even though the gap carries 4
      expect(result.scores.pyramid).toBe(0)
      expect(result.scores.coverage).toBe(25)
    })
  })

  describe('rigor', () => {
    it('a test file with no assertion is not clean', () => {
      const sources: Record<string, string> = {
        'src/math.ts': 'export const add = (a, b) => a + b\n',
        'test/a.test.ts': "it('adds', () => { expect(1).toBe(1) })\n",
        'test/b.test.ts': "it('runs it', () => { add(1, 1) })\n",
      }
      const result = audit(
        input({
          testFiles: ['test/a.test.ts', 'test/b.test.ts'],
          readSource: (file) => sources[file] ?? null,
        }),
      )

      expect(result.scores.rigor).toBe(50)
      expect(failedDetails(result)).toContainEqual('1 of 2 test files assert nothing')
    })

    // the same gate countAssertions uses: a gate a comment can walk through is not a gate
    it('does not count a commented-out assertion', () => {
      const sources: Record<string, string> = {
        'test/a.test.ts': "it('adds', () => {\n  // expect(add(1, 1)).toBe(2)\n})\n",
      }
      const result = audit(
        input({ testFiles: ['test/a.test.ts'], readSource: (file) => sources[file] ?? null }),
      )

      expect(result.scores.rigor).toBe(0)
    })

    it('does not read a disabled-test marker out of a comment or a string', () => {
      const sources: Record<string, string> = {
        'test/a.test.ts':
          "// it.skip('later', () => {})\nit('names the flag', () => { expect('describe.only').toBeTruthy() })\n",
      }
      const result = audit(
        input({ testFiles: ['test/a.test.ts'], readSource: (file) => sources[file] ?? null }),
      )

      expect(result.scores.rigor).toBe(100)
    })

    it('marks a file with a real .skip unclean and names the marker', () => {
      const sources: Record<string, string> = {
        'test/a.test.ts': "it.skip('later', () => { expect(1).toBe(1) })\n",
      }
      const result = audit(
        input({ testFiles: ['test/a.test.ts'], readSource: (file) => sources[file] ?? null }),
      )

      expect(result.scores.rigor).toBe(0)
      expect(failedDetails(result)).toContainEqual(
        '1 of 1 test files disable a test: it.skip',
      )
    })

    // .skip disables one test; .only silently disables every OTHER test in the file. Different
    // consequence, own sentence.
    it('reports .only in its own sentence', () => {
      const sources: Record<string, string> = {
        'test/a.test.ts': "it.only('this one', () => { expect(1).toBe(1) })\nit('never runs', () => { expect(2).toBe(2) })\n",
      }
      const result = audit(
        input({ testFiles: ['test/a.test.ts'], readSource: (file) => sources[file] ?? null }),
      )

      expect(failedDetails(result)).toContainEqual(
        '1 of 1 test files use .only — the other tests in those files never run',
      )
    })
  })

  describe('pyramid', () => {
    // a library with no e2e surface must not lose points for having no e2e test
    it('a kind with no product lines contributes nothing to either sum', () => {
      const sources: Record<string, string> = {
        'src/math.ts': 'export const add = (a, b) => a + b\n',
      }
      const result = audit(
        input({
          readSource: (file) => sources[file] ?? null,
          manifest: '{"devDependencies":{"vitest":"^1.0.0"}}', // library profile: unit weighs most
        }),
      )

      expect(result.scores.pyramid).toBe(100)
      expect(result.checks.filter((c) => c.category === 'pyramid')).toHaveLength(1)
      expect(result.checks.find((c) => c.category === 'pyramid')?.detail).toContain('unit')
    })

    it('weighs the kind that matters most for the profile', () => {
      const sources: Record<string, string> = {
        // 2 non-blank lines each, both absent from the coverage report
        'src/repository/user.ts': 'export function find(id) {\n}\n',
        'src/math.ts': 'export const add = (a, b) => a + b\n',
      }
      const result = audit(
        input({
          coverage: new Map(),
          productFiles: ['src/repository/user.ts', 'src/math.ts'],
          readSource: (file) => sources[file] ?? null,
          inspection: inspection([gap('src/repository/user.ts', 'integration', [1, 2])]),
        }),
      )

      // backend (express in the manifest): integration ×3, unit ×2, e2e ×1 — e2e has no product
      // line, so it is out of both sums. 1 − (3×1 + 2×0) ÷ 5 = 40
      expect(result.profile).toBe('backend')
      expect(result.scores.pyramid).toBe(40)
      expect(failedDetails(result)).toContainEqual(
        'integration weighs ×3 (a backend project) — 2 of 2 lines (100%) untested',
      )
    })

    it('never divides by zero when the repository has no product file', () => {
      const result = audit(input({ productFiles: [], coverage: new Map() }))

      expect(result.scores.pyramid).toBe(100)
      expect(result.scores.coverage).toBe(100)
      expect(Number.isNaN(result.overall)).toBe(false)
    })
  })

  it('averages the four categories with the fixed weights', () => {
    const result = audit(input())

    // setup 100 ×0.20 + coverage 100 ×0.40 + rigor 100 ×0.20 + pyramid 100 ×0.20
    expect(result.overall).toBe(100)
    expect(Object.values(result.scores).every((s) => Number.isInteger(s))).toBe(true)
  })

  it('carries the arithmetic in every failed detail', () => {
    const sources: Record<string, string> = {
      'src/math.ts': 'export const add = (a, b) => a + b\n',
      'src/dark.ts': 'export function dark() {\n  return 1\n}\n',
      'test/a.test.ts': "it.only('one', () => { add(1, 1) })\n",
    }
    const result = audit(
      input({
        productFiles: ['src/math.ts', 'src/dark.ts'],
        testFiles: ['test/a.test.ts'],
        readSource: (file) => sources[file] ?? null,
        inspection: inspection([gap('src/dark.ts', 'unit', [1, 2])]),
      }),
    )

    const failed = failedDetails(result)
    expect(failed.length).toBeGreaterThan(0)
    for (const detail of failed) expect(detail).toMatch(/\d/)
  })

  it('surfaces a stale report so the reader knows the score is a lower bound', () => {
    expect(audit(input({ inspection: inspection([], true) })).stale).toBe(true)
  })

  it('is deterministic: the same repository audited twice is byte-identical', () => {
    const sources: Record<string, string> = {
      'src/math.ts': 'export const add = (a, b) => a + b\n',
      'src/dark.ts': 'export function dark() {\n  return 1\n}\n',
      'src/routes/health.ts': 'export const health = () => ({ ok: true })\n',
      'test/a.test.ts': "it('adds', () => { expect(1).toBe(1) })\n",
      'test/b.test.ts': "it.skip('later', () => {})\n",
    }
    const build = (files: string[], tests: string[]): AuditInput =>
      input({
        productFiles: files,
        testFiles: tests,
        readSource: (file) => sources[file] ?? null,
        inspection: inspection([gap('src/dark.ts', 'unit', [1, 2])]),
      })

    const first = audit(build(['src/math.ts', 'src/dark.ts', 'src/routes/health.ts'], ['test/a.test.ts', 'test/b.test.ts']))
    // same repository, files handed over in a different order — walk() order is not a contract
    const second = audit(build(['src/routes/health.ts', 'src/dark.ts', 'src/math.ts'], ['test/b.test.ts', 'test/a.test.ts']))

    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})

describe('the disabled-test registry', () => {
  it('every language declares at least one disabled-test pattern', () => {
    for (const lang of LANGUAGES) {
      expect(lang.disabledTestPatterns.length, `${lang.id} declares none`).toBeGreaterThan(0)
    }
  })
})
