import { stripNonCode } from './code.js'
import type { Language } from './languages.js'

export type SourceSymbol = { name: string; start: number; end: number }

// ponytail: line-by-line regex, not an AST. The goal is to NAME the gap, not to understand
// the language. A symbol that slips through becomes a gap with symbol: null — the gap still
// ships. Swap for an AST (tree-sitter) only if the names come out wrong on a real repo.
export function extractSymbols(source: string, lang: Language): SourceSymbol[] {
  // declarations are matched against CODE: a commented-out `export function` is not a symbol
  const code = stripNonCode(source).split('\n')
  const symbols: SourceSymbol[] = []

  code.forEach((line, i) => {
    for (const pattern of lang.symbolPatterns) {
      const m = pattern.exec(line)
      if (m?.[1]) {
        symbols.push({ name: m[1], start: i + 1, end: endOf(code, i) })
        break
      }
    }
  })
  return symbols
}

/**
 * Where the symbol declared at `start` (0-based) actually ends.
 *
 * Bracket depth if it opens a block, indentation if it does not (python) — language-agnostic,
 * no per-language branching. The symbol used to end at the NEXT symbol's line, which made the
 * last one swallow the rest of the file: a trailing data table billed its branches to the last
 * function and any covered line in it suppressed a real gap's fullyUncovered flag.
 *
 * ponytail ceiling: a symbol whose block is opened by a macro or a leaked unbalanced bracket
 * (see stripNonCode) ends late. It ends late, never early — the old bug was ending at EOF.
 */
function endOf(code: string[], start: number): number {
  const indent = indentOf(code[start]!)
  let depth = 0
  let opened = false

  for (let i = start; i < code.length; i++) {
    const line = code[i]!
    // no block opened yet: the declaration owns the lines indented deeper than itself, and ends
    // at the next statement back at its own level. A bare `{` or `}` is not that statement —
    // it is the block of an allman-braced declaration, still to be counted below.
    if (!opened && i > start && !BRACKETS_ONLY.test(line) && indentOf(line) <= indent) {
      return trimBlank(code, start, i)
    }
    for (const ch of line) {
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if (ch === ')' || ch === ']' || ch === '}') depth--
    }
    // depth is read at end of line: `def f(a, b):` closes its parens and opens no block
    if (depth > 0) opened = true
    if (opened && depth <= 0) return i + 1
  }
  return trimBlank(code, start, code.length)
}

/** blank, or nothing but brackets and punctuation — never the statement that ends a symbol */
const BRACKETS_ONLY = /^[\s{}()[\];,]*$/

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

/** `end` is exclusive here (1-based line count); walk back over the blank lines before it */
function trimBlank(code: string[], start: number, end: number): number {
  let n = end
  while (n > start + 1 && (code[n - 1] ?? '').trim() === '') n--
  return n
}

/**
 * The symbol holding `line`, as an object: two symbols can share a name (java overloads, several
 * `impl Foo` blocks, a method in two classes) and the caller must be able to tell them apart.
 */
export function symbolAt(symbols: SourceSymbol[], line: number): SourceSymbol | null {
  // backwards: the innermost symbol (the method) beats the class enclosing it
  for (let i = symbols.length - 1; i >= 0; i--) {
    const s = symbols[i]!
    if (line >= s.start && line <= s.end) return s
  }
  return null
}
