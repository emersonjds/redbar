// test/assertions.test.ts
import { describe, expect, it } from 'vitest'
import { countAssertions } from '../src/assertions.js'
import { byId, LANGUAGES } from '../src/languages.js'

describe('countAssertions', () => {
  it('counts expect() in a vitest test', () => {
    const source = `
      it('adds', () => {
        expect(add(1, 2)).toBe(3)
        expect(add(0, 0)).toBe(0)
      })`
    expect(countAssertions(source, byId('ts')!)).toBe(2)
  })

  it('is zero for a test that calls the code and asserts nothing', () => {
    // the exact failure mode this gate exists for: coverage rises, the suite is green,
    // and the test proves nothing at all
    const source = `
      it('runs', () => {
        applyDiscount(100, 'A', 'gold')
      })`
    expect(countAssertions(source, byId('ts')!)).toBe(0)
  })

  it('counts python asserts', () => {
    expect(countAssertions('def test_x():\n    assert add(1, 2) == 3\n', byId('python')!)).toBe(1)
  })

  it('counts java assertions', () => {
    const source = 'void t() { assertEquals(3, add(1,2)); assertThat(x).isEqualTo(1); }'
    expect(countAssertions(source, byId('java')!)).toBe(2)
  })

  it('counts rust assert macros', () => {
    expect(countAssertions('assert_eq!(add(1,2), 3);\nassert!(ok);', byId('rust')!)).toBe(2)
  })

  it('ignores an assertion inside a comment or a string', () => {
    // stripNonCode already exists for exactly this, and the branch counter uses it — a gate that
    // can be passed by writing `// expect(true)` is not a gate
    expect(countAssertions('// expect(x).toBe(1)\nconst s = "expect(y).toBe(2)"', byId('ts')!)).toBe(0)
  })

  it('counts each PHPUnit assertion once, not twice', () => {
    // `\bassert\w*\(` already matches inside `$this->assertEquals(` — a second, more specific
    // pattern for the same call double-counts every idiomatic PHPUnit assertion
    const source = '$this->assertEquals(1, 2);\n$this->assertTrue(true);'
    expect(countAssertions(source, byId('php')!)).toBe(2)
  })

  it('every language in the registry declares how to spot an assertion', () => {
    for (const language of LANGUAGES) {
      expect(language.assertionPatterns.length).toBeGreaterThan(0)
    }
  })
})
