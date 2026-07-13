import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
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
