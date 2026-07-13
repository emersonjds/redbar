/**
 * Blanks out everything in a source file that is not code — comment tails (`//`, `#`), block
 * comments, quoted strings, python docstrings / java text blocks, and regex literals — keeping
 * the line count intact so line numbers still line up. Pure, no lexer, no per-language branching.
 *
 * ponytail: a scanner, not a parser. It exists because `if`, `for` and `&&` inside a comment or a
 * string are not branches, and a `{` inside a string is not a block. Known ceiling:
 *   - a single-quoted string holding an UNBALANCED bracket (`'/^{/'` in PHP) leaks that bracket;
 *     refusing to strip it is what keeps a rust lifetime (`&'a str) -> &'a`) from eating a paren.
 *   - a template literal spanning several lines leaks its continuation lines as code.
 * Both are cosmetic (a few phantom branches). An AST is the upgrade path if they ever bite.
 */
export function stripNonCode(source: string): string {
  const out: string[] = []
  let block: string | null = null // the delimiter that closes the block we are inside

  for (const line of source.split('\n')) {
    let code = ''
    let i = 0

    while (i < line.length) {
      if (block) {
        const end = line.indexOf(block, i)
        if (end < 0) break
        i = end + block.length
        block = null
        continue
      }

      const c = line[i]!
      const two = line.slice(i, i + 2)
      const three = line.slice(i, i + 3)

      // `#` is a comment in python/php/shell and an attribute in rust; only `this.#x` is code
      if (two === '//' || (c === '#' && code.at(-1) !== '.')) break
      if (two === '/*') {
        block = '*/'
        i += 2
      } else if (three === '"""' || three === "'''") {
        block = three
        i += 3
      } else if (c === '"' || c === '`') {
        i = skipQuoted(line, i)
      } else if (c === "'") {
        const end = skipSingle(line, i)
        if (end === i) code += c // a rust lifetime, not a string
        i = end === i ? i + 1 : end
      } else if (c === '/' && REGEX_POS.test(code)) {
        i = skipRegex(line, i)
      } else {
        code += c
        i++
      }
    }
    out.push(code)
  }
  return out.join('\n')
}

/** a `/` opens a regex literal only where a value cannot be — otherwise it is division */
const REGEX_POS = /(^|[(,=:[!&|?{};+*%<>~^-])\s*$|\breturn\s*$/

/** index just past the closing quote, or end of line when unterminated */
function skipQuoted(line: string, start: number): number {
  const quote = line[start]!
  for (let i = start + 1; i < line.length; i++) {
    if (line[i] === '\\') i++
    else if (line[i] === quote) return i + 1
  }
  return line.length
}

/**
 * Single quotes are ambiguous: a string in php/js/python, a lifetime in rust (`&'a str`).
 * Strip only when the quotes close on this line AND the content's brackets balance — that keeps
 * a false lifetime pair from deleting a real paren, which would wreck the brace depth.
 */
function skipSingle(line: string, start: number): number {
  const end = skipQuoted(line, start)
  if (end > line.length) return start
  const content = line.slice(start + 1, end - 1)
  if (end === line.length && line[end - 1] !== "'") return start // unterminated
  let depth = 0
  for (const ch of content) {
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch) && --depth < 0) return start
  }
  return depth === 0 ? end : start
}

/** index just past the regex literal and its flags */
function skipRegex(line: string, start: number): number {
  let inClass = false
  for (let i = start + 1; i < line.length; i++) {
    const c = line[i]
    if (c === '\\') i++
    else if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) {
      let j = i + 1
      while (j < line.length && /[a-z]/.test(line[j]!)) j++ // flags
      return j
    }
  }
  return line.length
}
