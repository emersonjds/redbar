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

    // The counterpart of the rule above. v8, coverlet and llvm emit a record for a file they
    // measured and found nothing executable in (a file of `export type`). Charging its source
    // lines invents a denominator no coverage tool agrees with: 13 files and 677 phantom lines on
    // one real repo.
    it('charges nothing for a file the report measured and found no executable line in', () => {
      const sources: Record<string, string> = {
        'src/math.ts': 'export const add = (a, b) => a + b\n',
        'src/types.ts': 'export type A = string\nexport type B = number\n',
      }
      const result = audit(
        input({
          productFiles: ['src/math.ts', 'src/types.ts'],
          coverage: coverageOf({
            'src/math.ts': { covered: [1], uncovered: [] },
            'src/types.ts': { covered: [], uncovered: [] },
          }),
          readSource: (file) => sources[file] ?? null,
        }),
      )

      const details = result.checks.filter((c) => c.category === 'coverage').map((c) => c.detail)
      expect(result.scores.coverage).toBe(100)
      expect(details).toContainEqual('all 1 executable line(s) are covered')
      // a file with nothing executable has no coverage to miss — it is not a dark file
      expect(details).toContainEqual('all 1 product file(s) have at least one covered line')
    })

    // The report is the authority on what was instrumented. A product file inside a directory it
    // measured and never mentioned is a file no test imports — the biggest gap there is. A product
    // file in a directory the report never touches at all (`scripts/`, `fixtures/`) is outside
    // what any coverage config reached, and charging it makes the score irreconcilable with the
    // number the project's own coverage tool prints.
    it('keeps a dark file in the denominator and leaves out a directory the report never measured', () => {
      const sources: Record<string, string> = {
        'src/math.ts': 'export const add = (a, b) => a + b\n',
        'src/dark.ts': 'export function dark() {\n  return 1\n}\n',
        'scripts/release.ts': 'run()\n',
      }
      const result = audit(
        input({
          productFiles: ['src/math.ts', 'src/dark.ts', 'scripts/release.ts'],
          readSource: (file) => sources[file] ?? null,
        }),
      )

      // 1 covered of (1 measured + 3 dark) — scripts/ is in no directory lcov.info measured
      expect(result.scores.coverage).toBe(25)
      expect(failedDetails(result)).toContainEqual('3 of 4 executable lines are untested')
      expect(failedDetails(result)).toContainEqual(
        '1 of 2 product files (50%) have no coverage at all',
      )
    })

    // The reconciliation, in the report itself: a reader with a calculator gets from the coverage
    // tool's own total to redbar's without guessing what redbar added or dropped.
    it('states where every line in the denominator came from', () => {
      const sources: Record<string, string> = {
        'src/math.ts': 'export const add = (a, b) => a + b\n',
        'src/dark.ts': 'export function dark() {\n  return 1\n}\n',
        'scripts/release.ts': 'run()\n',
      }
      const details = (files: string[]) =>
        audit(input({ productFiles: files, readSource: (file) => sources[file] ?? null }))
          .checks.filter((c) => c.category === 'coverage')
          .map((c) => c.detail)

      expect(details(['src/math.ts'])).toContainEqual(
        'denominator: 1 executable line(s) — 1 from coverage/lcov.info',
      )

      const full = details(['src/math.ts', 'src/dark.ts', 'scripts/release.ts'])
      expect(full).toContainEqual(
        'denominator: 4 executable line(s) — 1 from coverage/lcov.info, 3 in 1 product file(s) it never saw',
      )
      expect(full).toContainEqual(
        'left out: 1 product file(s) in directories the report never measured',
      )
    })

    // The report measures files that are not product code (an instrumented test helper, a
    // generated client, a config module). They are out of the denominator on purpose, and the
    // reader needs both figures to get from the coverage tool's own headline to this score.
    it('states the lines the report measured in files that are not product code', () => {
      const sources: Record<string, string> = {
        'src/math.ts': 'export const add = (a, b) => a + b\n',
        'src/routeTree.gen.ts': 'export const tree = 1\n',
      }
      const result = audit(
        input({
          productFiles: ['src/math.ts'], // the generated file is not product code
          coverage: coverageOf({
            'src/math.ts': { covered: [1], uncovered: [] },
            'src/routeTree.gen.ts': { covered: [1, 2], uncovered: [3] },
          }),
          readSource: (file) => sources[file] ?? null,
        }),
      )

      // the report says 3 of 4 lines covered; the audit scores 1 of 1, and this is the difference
      expect(result.checks.map((c) => c.detail)).toContainEqual(
        'left out: 3 line(s) (2 covered) in 1 file(s) the report measured that are not product code',
      )
      expect(result.scores.coverage).toBe(100)
    })

    // 99.95 rendered as 100 puts `Coverage 100` directly above a FAILED line that says 5 lines are
    // untested. The bar already floors for this reason; the score follows the same rule.
    it('floors the score and rounds only the percentage inside a sentence', () => {
      const sources: Record<string, string> = {
        'src/math.ts': 'export const add = (a, b) => a + b\n',
        'src/dark.ts': 'export function dark() {\n  return 1\n}\n',
        'src/half.ts': 'export function half() {\n  return 2\n}\n',
      }
      const result = audit(
        input({
          productFiles: ['src/math.ts', 'src/dark.ts', 'src/half.ts'],
          coverage: coverageOf({
            'src/math.ts': { covered: [1, 2], uncovered: [] },
            'src/half.ts': { covered: [1], uncovered: [2] },
          }),
          readSource: (file) => sources[file] ?? null,
        }),
      )

      // 3 covered of 7 executable (2 measured + 2 measured + 3 dark) = 42.85 — floored, not rounded
      expect(result.scores.coverage).toBe(42)
      expect(failedDetails(result)).toContainEqual('4 of 7 executable lines are untested')
      // 1 dark file of 3 = 33.33 — rounded, because the sentence carries both figures beside it
      expect(failedDetails(result)).toContainEqual(
        '1 of 3 product files (33%) have no coverage at all',
      )
    })

    it('never scores 100 while a line is untested', () => {
      const uncovered = Array.from({ length: 5 }, (_, i) => 9_996 + i)
      const covered = Array.from({ length: 9_995 }, (_, i) => i + 1)
      const result = audit(
        input({ coverage: coverageOf({ 'src/math.ts': { covered, uncovered } }) }),
      )

      // 9,995 of 10,000 is 99.95 — a score of 100 above a FAILED line is a lie
      expect(result.scores.coverage).toBe(99)
      expect(failedDetails(result)).toContainEqual('5 of 10,000 executable lines are untested')
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

    // two markers in two files: the set is sorted, so the sentence reads the same on any machine
    // and in any walk order
    it('names every distinct marker, in a fixed order', () => {
      const sources: Record<string, string> = {
        'test/a.test.ts': "it.skip('later', () => { expect(1).toBe(1) })\n",
        'test/b.test.ts': "describe.only('this file', () => { expect(2).toBe(2) })\n",
      }
      const result = audit(
        input({
          testFiles: ['test/a.test.ts', 'test/b.test.ts'],
          readSource: (file) => sources[file] ?? null,
        }),
      )

      expect(failedDetails(result)).toContainEqual(
        '2 of 2 test files disable a test: describe.only, it.skip',
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
        'integration weighs ×3 — 2 of 2 lines (100%) untested',
      )
    })

    // `everyLine` hands the whole file to the gap set when the report does not know it, so a
    // numerator can outrun the shared denominator. Without the clamp this layer reads as 500%
    // untested and drags the score to 0 — a layer is at worst entirely untested.
    it('clamps a layer at 100% untested instead of letting it go negative', () => {
      const sources: Record<string, string> = {
        'src/math.ts': 'export const add = (a, b) => a + b\n',
        'src/repository/user.ts': 'export function find(id) {\n  return db.get(id)\n}\n',
      }
      const result = audit(
        input({
          productFiles: ['src/math.ts', 'src/repository/user.ts'],
          coverage: coverageOf({
            'src/math.ts': { covered: [1], uncovered: [] },
            'src/repository/user.ts': { covered: [1, 2, 3], uncovered: [] },
          }),
          readSource: (file) => sources[file] ?? null,
          // 10 gap lines against a file the report says has 1 executable line
          inspection: inspection([gap('src/math.ts', 'unit', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])]),
          manifest: '{"devDependencies":{"vitest":"^1.0.0"}}', // library: unit ×3, integration ×2
        }),
      )

      // 1 − (3 × 1 + 2 × 0) ÷ 5 = 40. Unclamped the unit rate would be 10, and the score 0
      expect(result.scores.pyramid).toBe(40)
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

  // Four scores that are all equal cannot tell one weight from another: any four weights summing
  // to 1 return the same number. Coverage weighs double everything else, and this is the only
  // place that says so.
  it('weighs coverage double: four different scores, one exact overall', () => {
    const sources: Record<string, string> = {
      'src/math.ts': 'export function add(a, b) {\n  return a + b\n}\nexport const one = 1\n',
      'test/a.test.ts': "it('adds', () => { expect(1).toBe(1) })\n",
      'test/b.test.ts': "it('adds', () => { expect(2).toBe(2) })\n",
    }
    const result = audit(
      input({
        // no runner named: setup loses 25
        manifest: '{"name":"nothing-here"}',
        coverage: coverageOf({ 'src/math.ts': { covered: [1, 2], uncovered: [3, 4] } }),
        testFiles: ['test/a.test.ts', 'test/b.test.ts'],
        readSource: (file) => sources[file] ?? null,
        inspection: inspection([gap('src/math.ts', 'unit', [1, 2, 3])]),
      }),
    )

    expect(result.scores).toEqual({ setup: 75, coverage: 50, rigor: 100, pyramid: 25 })
    // 75 × 0.20 + 50 × 0.40 + 100 × 0.20 + 25 × 0.20 = 15 + 20 + 20 + 5
    expect(result.overall).toBe(60)
  })

  // the caller walks the tree AND unions the coverage report's own keys, so the same file arrives
  // twice — counting it twice would charge its lines twice
  it('counts a file handed over twice only once', () => {
    const result = audit(input({ productFiles: ['src/math.ts', 'src/math.ts'] }))

    expect(
      result.checks.filter((c) => c.category === 'coverage').map((c) => c.detail),
    ).toContainEqual('all 1 product file(s) have at least one covered line')
    expect(result.scores.coverage).toBe(100)
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
