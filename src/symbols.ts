import type { Language } from './languages.js'

export type SourceSymbol = { name: string; start: number; end: number }

// ponytail: line-by-line regex, not an AST. The goal is to NAME the gap, not to understand
// the language. A symbol that slips through becomes a gap with symbol: null — the gap still
// ships. Swap for an AST (tree-sitter) only if the names come out wrong on a real repo.
export function extractSymbols(source: string, lang: Language): SourceSymbol[] {
  const lines = source.split('\n')
  const symbols: SourceSymbol[] = []

  lines.forEach((line, i) => {
    for (const pattern of lang.symbolPatterns) {
      const m = pattern.exec(line)
      if (m?.[1]) {
        symbols.push({ name: m[1], start: i + 1, end: lines.length })
        break
      }
    }
  })

  // a symbol ends where the next one starts, minus one
  for (let i = 0; i < symbols.length - 1; i++) symbols[i]!.end = symbols[i + 1]!.start - 1
  return symbols
}

export function symbolAt(symbols: SourceSymbol[], line: number): string | null {
  // backwards: the innermost symbol (the method) beats the class enclosing it
  for (let i = symbols.length - 1; i >= 0; i--) {
    const s = symbols[i]!
    if (line >= s.start && line <= s.end) return s.name
  }
  return null
}
