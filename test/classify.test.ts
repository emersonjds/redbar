import { describe, expect, it } from 'vitest'
import { classify, countBranches } from '../src/classify.js'

describe('classify', () => {
  it('a next route is e2e by path', () => {
    expect(classify('app/checkout/page.tsx', 'export default function Page() {}')).toBe('e2e')
  })

  it('a spring controller is e2e by content', () => {
    const src = '@RestController\npublic class OrderController {}'
    expect(classify('src/main/java/com/x/OrderController.java', src)).toBe('e2e')
  })

  it('a laravel route is e2e by content', () => {
    expect(classify('src/Http/Web.php', "Route::get('/x', fn () => 1);")).toBe('e2e')
  })

  it('a repository is integration by name', () => {
    expect(classify('src/db/OrderRepository.ts', 'export class OrderRepository {}')).toBe(
      'integration',
    )
  })

  it('a file that talks sql is integration by content', () => {
    const src = 'import { sql } from "./db.js"\nexport async function save() {}'
    expect(classify('src/save.ts', src)).toBe('integration')
  })

  it('pure logic is unit', () => {
    expect(classify('src/math.ts', 'export function add(a, b) { return a + b }')).toBe('unit')
  })

  it('a next.js app-router page is still e2e', () => {
    expect(classify('app/checkout/page.tsx', 'export default function Page() {}')).toBe('e2e')
  })

  it('a python module under app/ is a package, not a route', () => {
    expect(classify('app/calc.py', 'def divide(a, b):\n    return a / b')).toBe('unit')
  })
})

describe('countBranches', () => {
  const src = [
    'export function add(a, b) {',                    // 1
    '  return a + b',                                 // 2
    '}',                                              // 3
    'export function divide(a, b) {',                 // 4
    '  if (b === 0) throw new Error()',               // 5
    '  if (a < 0 && b < 0) return Math.abs(a / b)',   // 6
    '  return a / b',                                 // 7
    '}',                                              // 8
  ].join('\n')

  it('counts branches only within the symbol range', () => {
    expect(countBranches(src, 1, 3)).toBe(0) // add: straight line
    expect(countBranches(src, 4, 8)).toBe(3) // divide: if, if, &&
  })

  // found by running redbar on redbar: a static data table scored 21 branches, because
  // every `?` in a regex quantifier and every optional type was counted as one
  it('does not count regex quantifiers or optional types as branches', () => {
    const dataTable = [
      'export const LANGUAGES = [',
      '  { id: "ts", symbolPatterns: [/^export\\s+(?:async\\s+)?function\\s+(\\w+)/] },',
      '  { id: "go", reportPath: "coverage.xml", canFix: false },',
      ']',
    ].join('\n')
    expect(countBranches(dataTable, 1, 4)).toBe(0)
  })

  it('does not count the word if inside an identifier', () => {
    expect(countBranches('const notify = 1\nconst ifs = 2', 1, 2)).toBe(0)
  })

  // self-demonstrating: redbar's own LANGUAGES table scored 3 phantom branches — a `for` inside
  // a regex literal, an `&&` inside a shell string, a `for` inside a comment
  it('ignores keywords inside regex literals, strings and comments', () => {
    const src = [
      'export const LANGUAGES = [',
      '  { symbolPatterns: [/^\\s*impl\\s+(?:\\w+\\s+for\\s+)?(\\w+)/] },',
      "  { coverageCommand: 'go test ./... && gocover-cobertura < c.out > c.xml' },",
      '  // maven has no install-by-command: init prints the block for the human to paste',
      '  { install: `npm install -D ${libs.join(" ")}` }, // while we are at it',
      '  { doc: "returns null if the case is unknown" },',
      ']',
    ].join('\n')
    expect(countBranches(src, 1, 7)).toBe(0)
  })

  it('still counts the branches in real code around the noise', () => {
    const src = [
      'function divide(a, b) {',
      '  // guard: throw if b is zero',
      '  if (b === 0) throw new Error("cannot divide, if b is 0")',
      '  return a / b // plain division, not a regex',
      '}',
    ].join('\n')
    expect(countBranches(src, 1, 5)).toBe(1) // the real `if`, nothing else
  })

  it('ignores keywords inside a block comment', () => {
    const src = ['/**', ' * Loops for each item and returns null if empty.', ' */', 'const x = 1'].join(
      '\n',
    )
    expect(countBranches(src, 1, 4)).toBe(0)
  })

  it('ignores keywords inside a python docstring and a hash comment', () => {
    const src = [
      'def divide(a, b):',
      '    """Divide a by b.',
      '',
      '    Raises if b is zero, loops for nothing.',
      '    """',
      '    # returns None if b is zero',
      '    if b == 0:',
      '        return None',
      '    return a / b',
    ].join('\n')
    expect(countBranches(src, 1, 9)).toBe(1)
  })
})
