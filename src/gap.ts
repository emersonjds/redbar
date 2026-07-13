import { classify, countBranches } from './classify.js'
import type { Language } from './languages.js'
import { extractSymbols, symbolAt, type SourceSymbol } from './symbols.js'
import type { ChangedLines, Coverage, Gap } from './types.js'

export type SourceReader = (file: string) => string | null

export function findGaps(
  coverage: Coverage,
  changed: ChangedLines,
  lang: Language,
  readSource: SourceReader,
): Gap[] {
  const gaps: Gap[] = []

  for (const [file, changedInFile] of changed) {
    const fc = coverage.get(file)
    if (!fc) continue // not instrumented: test, config, doc

    const uncovered = new Set(fc.uncovered)
    const gapLines = changedInFile.filter((n) => uncovered.has(n)).sort((a, b) => a - b)
    if (gapLines.length === 0) continue

    const source = readSource(file) ?? ''
    const symbols = extractSymbols(source, lang)
    const covered = new Set(fc.covered)
    const kind = classify(file, source)

    // group the gap lines by the symbol containing them
    const bySymbol = new Map<string | null, number[]>()
    for (const line of gapLines) {
      const name = symbolAt(symbols, line)
      const acc = bySymbol.get(name) ?? []
      acc.push(line)
      bySymbol.set(name, acc)
    }

    for (const [symbol, lines] of bySymbol) {
      const span = symbols.find((s) => s.name === symbol)
      const fullyUncovered = span ? !hasCoveredLine(span, covered) : false
      const branches = span
        ? countBranches(source, span.start, span.end)
        : countBranches(source, lines[0]!, lines.at(-1)!)

      gaps.push({
        file,
        symbol,
        lines,
        fullyUncovered,
        branches,
        kind,
        score: lines.length * (fullyUncovered ? 2 : 1) * (1 + branches),
      })
    }
  }

  return gaps.sort(
    (a, b) => b.score - a.score || b.lines.length - a.lines.length || a.file.localeCompare(b.file),
  )
}

function hasCoveredLine(span: SourceSymbol, covered: Set<number>): boolean {
  for (const line of covered) if (line >= span.start && line <= span.end) return true
  return false
}
