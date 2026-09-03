import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { inspect } from '../src/engine.js'
import type { ChangedLines } from '../src/types.js'

const root = (name: string) => join(import.meta.dirname, '..', 'fixtures', name)

// the fixtures are not git repos — the diff is injected, simulating "this whole file changed"
const CASES = [
  {
    fixture: 'ts',
    lang: 'ts',
    changed: new Map([['src/math.ts', [1, 2, 5, 6, 7]]]) as ChangedLines,
    file: 'src/math.ts',
    lines: [5, 6, 7],
  },
  {
    fixture: 'spring',
    lang: 'java',
    changed: new Map([['src/main/java/com/example/Calc.java', [4, 5, 8, 9, 10]]]) as ChangedLines,
    file: 'src/main/java/com/example/Calc.java',
    lines: [8, 9, 10],
  },
  {
    fixture: 'py',
    lang: 'python',
    changed: new Map([['app/calc.py', [1, 2, 5, 6, 7, 8]]]) as ChangedLines,
    file: 'app/calc.py',
    lines: [5, 6, 7, 8],
  },
  {
    fixture: 'rust',
    lang: 'rust',
    changed: new Map([['src/lib.rs', [1, 2, 5, 6, 7, 9]]]) as ChangedLines,
    file: 'src/lib.rs',
    lines: [5, 6, 7, 9],
  },
  {
    fixture: 'php',
    lang: 'php',
    changed: new Map([['src/Calc.php', [7, 12, 13, 15]]]) as ChangedLines,
    file: 'src/Calc.php',
    lines: [12, 13, 15],
  },
]

describe('inspect finds the planted hole in all 5 languages', () => {
  for (const c of CASES) {
    it(`${c.fixture}: exactly divide, and nothing else`, () => {
      const { language, gaps } = inspect(root(c.fixture), { changed: c.changed })

      expect(language.id).toBe(c.lang)
      expect(gaps).toHaveLength(1)
      expect(gaps[0]).toMatchObject({
        file: c.file,
        symbol: 'divide',
        lines: c.lines,
        fullyUncovered: true,
        kind: 'unit',
      })
      // divide carries an `if` in all 5 languages: criticality is picked up everywhere
      expect(gaps[0]!.branches).toBeGreaterThanOrEqual(1)
    })
  }

  it('fails loudly when the report is missing, with the exact command', () => {
    expect(() =>
      inspect(root('ts'), { changed: new Map(), reportPath: 'coverage/none.info' }),
    ).toThrow(/coverage report not found.*vitest/s)
  })
})

describe('inspect --all', () => {
  let repo: string

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'redbar-all-'))
    mkdirSync(join(repo, 'src', 'coverage'), { recursive: true })
    mkdirSync(join(repo, 'coverage'), { recursive: true })
    writeFileSync(join(repo, 'package.json'), '{"devDependencies":{"vitest":"^1.0.0"}}')
    // `walk` skips every directory named `coverage` — this one holds real source
    writeFileSync(join(repo, 'src', 'coverage', 'lcov.ts'), 'export function parse() {\n  return 1\n}\n')
    // line 2 is blank: not executable, never in a report, and not a gap
    writeFileSync(join(repo, 'src', 'dark.ts'), 'export function dark() {\n\n  return 2\n}\n')
    writeFileSync(
      join(repo, 'coverage', 'lcov.info'),
      'SF:src/coverage/lcov.ts\nDA:1,1\nDA:2,0\nend_of_record\n',
    )
  })

  // the report is the authority on what was instrumented: a measured file the walk cannot reach
  // is still code somebody has to test
  it('ranks a gap in a file the walk skips but the report measured', () => {
    const gaps = inspect(repo, { all: true }).gaps

    expect(gaps.map((g) => g.file)).toContain('src/coverage/lcov.ts')
    expect(gaps.find((g) => g.file === 'src/coverage/lcov.ts')?.lines).toEqual([2])
  })

  // the Pyramid numerator and the Coverage denominator count the same lines, or the same document
  // holds two answers to "how many lines are untested"
  it('never counts a blank line as an untested line', () => {
    const gaps = inspect(repo, { all: true }).gaps

    expect(gaps.find((g) => g.file === 'src/dark.ts')?.lines).toEqual([1, 3, 4])
  })
})
