import { describe, expect, it } from 'vitest'
import { findGaps } from '../src/gap.js'
import { byId } from '../src/languages.js'
import type { ChangedLines, Coverage } from '../src/types.js'

const ts = byId('ts')!
const java = byId('java')!

const SRC = [
  'export function add(a: number, b: number) {',     // 1
  '  return a + b',                                   // 2
  '}',                                                // 3
  '',                                                 // 4
  'export function divide(a: number, b: number) {',   // 5
  '  if (b === 0) throw new Error("divide by zero")', // 6
  '  return a / b',                                   // 7
  '}',                                                // 8
].join('\n')

const read = (file: string) => (file === 'src/math.ts' ? SRC : null)

describe('findGaps', () => {
  it('crosses changed lines with uncovered lines and scores by criticality', () => {
    const coverage: Coverage = new Map([
      ['src/math.ts', { file: 'src/math.ts', covered: [1, 2], uncovered: [5, 6, 7] }],
    ])
    const changed: ChangedLines = new Map([['src/math.ts', [5, 6, 7]]])

    expect(findGaps(coverage, changed, ts, read)).toEqual([
      {
        file: 'src/math.ts',
        symbol: 'divide',
        lines: [5, 6, 7],
        fullyUncovered: true,
        branches: 1,
        kind: 'unit',
        score: 12, // 3 lines × 2 (fullyUncovered) × (1 + 1 branch)
      },
    ])
  })

  it('ignores a changed line that is already covered', () => {
    const coverage: Coverage = new Map([
      ['src/math.ts', { file: 'src/math.ts', covered: [1, 2, 5, 6, 7], uncovered: [] }],
    ])
    const changed: ChangedLines = new Map([['src/math.ts', [1, 2, 5]]])
    expect(findGaps(coverage, changed, ts, read)).toEqual([])
  })

  it('ignores a changed file absent from the coverage report', () => {
    const changed: ChangedLines = new Map([['README.md', [1, 2]]])
    expect(findGaps(new Map(), changed, ts, read)).toEqual([])
  })

  it('one gap per symbol, most critical first', () => {
    const coverage: Coverage = new Map([
      ['src/math.ts', { file: 'src/math.ts', covered: [], uncovered: [2, 6, 7] }],
    ])
    const changed: ChangedLines = new Map([['src/math.ts', [2, 6, 7]]])

    const gaps = findGaps(coverage, changed, ts, read)
    // divide has a branch, add does not — divide leads even at a similar line count
    expect(gaps.map((g) => g.symbol)).toEqual(['divide', 'add'])
    expect(gaps[0]?.score).toBe(8) // 2 lines × 2 × (1 + 1)
    expect(gaps[1]?.score).toBe(2) // 1 line  × 2 × (1 + 0)
  })

  it('a symbol with any covered line is not fullyUncovered', () => {
    const coverage: Coverage = new Map([
      ['src/math.ts', { file: 'src/math.ts', covered: [5, 7], uncovered: [6] }],
    ])
    const changed: ChangedLines = new Map([['src/math.ts', [6]]])

    expect(findGaps(coverage, changed, ts, read)[0]).toEqual({
      file: 'src/math.ts',
      symbol: 'divide',
      lines: [6],
      fullyUncovered: false,
      branches: 1,
      kind: 'unit',
      score: 2, // 1 line × 1 × (1 + 1)
    })
  })

  it('a line with no symbol becomes a gap with symbol null', () => {
    const coverage: Coverage = new Map([
      ['src/x.ts', { file: 'src/x.ts', covered: [], uncovered: [1] }],
    ])
    const changed: ChangedLines = new Map([['src/x.ts', [1]]])
    // a bare top-level statement declares nothing, so there is no symbol to blame
    const gaps = findGaps(coverage, changed, ts, () => 'sideEffect()\n')
    expect(gaps[0]?.symbol).toBeNull()
    expect(gaps[0]?.fullyUncovered).toBe(false)
  })

  // overloads (java), several `impl Foo` blocks (rust), same-named methods in two classes:
  // grouping by NAME picks the first symbol with that name, not the one holding the gap
  it('attributes the gap to the overload that contains it, not the first of that name', () => {
    const src = [
      'package com.example;', //                             1
      '', //                                                 2
      'public class Mailer {', //                            3
      '  public void send(String to) {', //                  4
      '    System.out.println(to);', //                      5
      '  }', //                                              6
      '  public void send(String to, int retries) {', //     7
      '    if (retries > 0 && to != null) {', //             8
      '      for (int i = 0; i < retries; i++) send(to);', // 9
      '    }', //                                            10
      '  }', //                                              11
      '}', //                                                12
    ].join('\n')
    const file = 'src/main/java/com/example/Mailer.java'
    const coverage: Coverage = new Map([
      [file, { file, covered: [4, 5], uncovered: [8, 9, 10] }],
    ])
    const changed: ChangedLines = new Map([[file, [8, 9, 10]]])

    const gaps = findGaps(coverage, changed, java, () => src)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({
      symbol: 'send',
      lines: [8, 9, 10],
      fullyUncovered: true, // the 2-arg overload has no covered line — the 1-arg one does
      branches: 3, // if, &&, for
      score: 24, // 3 lines × 2 × (1 + 3)
    })
  })

  it('a gap in a route is classified as e2e', () => {
    const coverage: Coverage = new Map([
      ['app/checkout/page.tsx', { file: 'app/checkout/page.tsx', covered: [], uncovered: [1] }],
    ])
    const changed: ChangedLines = new Map([['app/checkout/page.tsx', [1]]])
    const gaps = findGaps(coverage, changed, ts, () => 'export function Page() { return null }')
    expect(gaps[0]?.kind).toBe('e2e')
  })

  // Found by running redbar on a real React Native repo: 93 changed .ts/.tsx files, and the
  // jest lcov listed 18 — because jest only instruments what a test IMPORTED. Every file no
  // test touches was absent from the report, and findGaps skipped it as "uninstrumented".
  // The file with zero tests was invisible to the tool whose whole job is finding files with
  // zero tests.
  describe('a changed source file absent from the coverage report', () => {
    it('is a total gap, not an uninstrumented file', () => {
      const src = 'export function pay(a: number) {\n  if (a < 0) throw new Error()\n  return a\n}\n'
      const coverage: Coverage = new Map() // the report never mentions it
      const changed: ChangedLines = new Map([['src/pay.ts', [1, 2, 3, 4]]])

      const gaps = findGaps(coverage, changed, ts, () => src)

      expect(gaps).toHaveLength(1)
      expect(gaps[0]).toMatchObject({
        file: 'src/pay.ts',
        symbol: 'pay',
        fullyUncovered: true,
        kind: 'unit',
      })
      expect(gaps[0]!.score).toBeGreaterThan(0)
    })

    it('does not turn a test file into a gap', () => {
      const changed: ChangedLines = new Map([
        ['src/pay.test.ts', [1, 2]],
        ['__tests__/pay.integration.test.ts', [1]],
        ['jest.setup.ts', [1]],
      ])
      expect(findGaps(new Map(), changed, ts, () => 'it("works", () => {})')).toEqual([])
    })

    it('does not turn a non-source file into a gap', () => {
      const changed: ChangedLines = new Map([
        ['README.md', [1, 2]],
        ['package.json', [3]],
        ['src/logo.svg', [1]],
      ])
      expect(findGaps(new Map(), changed, ts, () => 'whatever')).toEqual([])
    })

    // all of these showed up as "gaps" on a real React Native repo. A .d.ts emits no runtime
    // and cannot be tested at all; build config is not product code. Noise in a to-do list.
    it('does not turn type declarations or build config into a gap', () => {
      const changed: ChangedLines = new Map([
        ['src/types/assets.d.ts', [1]],
        ['jest.resolver.js', [1, 9]],
        ['metro.config.js', [1]],
        ['vite.config.ts', [1]],
        ['babel.config.js', [1]],
      ])
      expect(findGaps(new Map(), changed, ts, () => 'export const x = 1')).toEqual([])
    })

    it('still treats a real source file as a gap', () => {
      // real React: declared without `export`, exported at the bottom
      const src = [
        'const Home = () => {', // 1
        '  if (!user) return null', // 2
        '  return <View />', // 3
        '}', // 4
        'export default Home', // 5
      ].join('\n')
      const changed: ChangedLines = new Map([['src/pages/Home/index.tsx', [1, 2, 3, 4]]])

      const gaps = findGaps(new Map(), changed, ts, () => src)

      expect(gaps).toHaveLength(1)
      expect(gaps[0]).toMatchObject({ symbol: 'Home', fullyUncovered: true, branches: 1 })
    })
  })

  // architectural invariant: a report that reshuffles between identical runs cannot be
  // diffed in a PR, and the CI gate would flap
  it('ranks deterministically, including on a score tie', () => {
    const src = 'export function a() {\n  return 1\n}\nexport function b() {\n  return 2\n}\n'
    const coverage: Coverage = new Map([
      ['src/z.ts', { file: 'src/z.ts', covered: [], uncovered: [2] }],
      ['src/a.ts', { file: 'src/a.ts', covered: [], uncovered: [2] }],
    ])
    const changed: ChangedLines = new Map([
      ['src/z.ts', [2]],
      ['src/a.ts', [2]],
    ])

    const once = findGaps(coverage, changed, ts, () => src)
    const twice = findGaps(coverage, changed, ts, () => src)

    expect(once.map((g) => g.score)).toEqual([2, 2]) // a genuine tie
    expect(once.map((g) => g.file)).toEqual(['src/a.ts', 'src/z.ts']) // broken alphabetically
    expect(twice).toEqual(once)
  })
})
