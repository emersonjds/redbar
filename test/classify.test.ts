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

  it('does not count the word if inside an identifier', () => {
    expect(countBranches('const notify = 1\nconst ifs = 2', 1, 2)).toBe(0)
  })
})
