import { describe, expect, it } from 'vitest'
import { stripNonCode } from '../src/code.js'

describe('stripNonCode', () => {
  it('blanks a line comment but keeps the code before it', () => {
    expect(stripNonCode('if (x) {} // check x')).toBe('if (x) {} ')
  })

  it('blanks a python/shell comment, not a rust attribute or a private field access', () => {
    expect(stripNonCode('# skip this test')).toBe('')
    // `this.#x` is real code: the field access must survive
    expect(stripNonCode('return this.#x')).toBe('return this.#x')
  })

  it('blanks a block comment and keeps the line count intact', () => {
    expect(stripNonCode('a /* mid */ b')).toBe('a  b')
  })

  it('blanks a block comment spanning several lines', () => {
    expect(stripNonCode('a /* start\nstill inside\nend */ b')).toBe('a \n\n b')
  })

  it('blanks a python triple-quoted docstring', () => {
    expect(stripNonCode('x = 1\n"""\nif fake: pass\n"""\ny = 2')).toBe('x = 1\n\n\n\ny = 2')
  })

  it('blanks a double-quoted string, keeping any if/for inside it out of the branch count', () => {
    expect(stripNonCode('const s = "if (x) { fake }"')).toBe('const s = ')
  })

  it('does not let an escaped quote inside a string close it early', () => {
    expect(stripNonCode('const s = "a \\" b" + c')).toBe('const s =  + c')
  })

  it('blanks a template literal on one line', () => {
    expect(stripNonCode('const s = `hello ${name}`')).toBe('const s = ')
  })

  it('strips a single-quoted string that closes on the line with balanced brackets', () => {
    expect(stripNonCode("const s = 'if (x) {}'")).toBe('const s = ')
  })

  // a rust lifetime is not a string: stripping the quote pair would delete the `(` and wreck the
  // brace/paren depth the criticality counter relies on
  it('keeps a rust lifetime intact instead of reading it as an unterminated string', () => {
    expect(stripNonCode("fn f<'a>(x: &'a str) -> &'a str")).toBe("fn f<'a>(x: &'a str) -> &'a str")
  })

  // an unbalanced bracket inside a single-quoted string is the documented ceiling: refusing to
  // strip it leaks the bracket back into `code`, and here it also puts `/` in regex position —
  // the scanner then reads the rest of the line as an unterminated regex and drops it
  it('leaks an unbalanced bracket from a single-quoted string, the documented ceiling', () => {
    expect(stripNonCode("preg_match('/^{/', $s)")).toBe("preg_match('/^{")
  })

  it('reads a division as code, not as the start of a regex literal', () => {
    expect(stripNonCode('const half = total / 2')).toBe('const half = total / 2')
  })

  it('blanks a regex literal that opens where a value is expected', () => {
    expect(stripNonCode('return /^\\d+$/.test(s)')).toBe('return .test(s)')
  })

  it('does not treat a slash inside a character class as the closing delimiter', () => {
    expect(stripNonCode('return /[a/b]/.test(s)')).toBe('return .test(s)')
  })

  // the documented fallback for an unterminated quote: nothing on the rest of the line reads as
  // code, and the scanner reaches the end of the line instead of running off the end of the string
  it('treats an unterminated double-quoted string as blank to the end of the line', () => {
    expect(stripNonCode('const s = "never closes')).toBe('const s = ')
  })

  // same fallback, for a regex literal that never finds its closing slash
  it('treats an unterminated regex literal as blank to the end of the line', () => {
    expect(stripNonCode('return /never closes')).toBe('return ')
  })

  it('returns an empty string unchanged', () => {
    expect(stripNonCode('')).toBe('')
  })
})
