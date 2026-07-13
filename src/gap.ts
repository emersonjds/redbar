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
    if (!isProductCode(file, lang)) continue // test, config, doc, asset — never a gap

    const fc = coverage.get(file)

    // A source file ABSENT from the report is not "uninstrumented" — it is a file that no test
    // imports, which is the biggest gap there is. Jest and pytest only instrument what a test
    // imported, so a wholly untested file never appears in the report at all. Treating that as
    // "nothing to do" is how redbar reported 6 gaps on a repo with 93 untested changed files.
    const uncovered = new Set(fc ? fc.uncovered : changedInFile)
    const covered = new Set(fc ? fc.covered : [])

    const gapLines = changedInFile.filter((n) => uncovered.has(n)).sort((a, b) => a - b)
    if (gapLines.length === 0) continue

    const source = readSource(file) ?? ''
    const symbols = extractSymbols(source, lang)
    const kind = classify(file, source)

    // group by symbol IDENTITY, not by name: two symbols can share a name (overloads, several
    // `impl Foo` blocks) and only the one that CONTAINS the line describes the gap
    const bySymbol = new Map<SourceSymbol | null, number[]>()
    for (const line of gapLines) {
      const span = symbolAt(symbols, line)
      const acc = bySymbol.get(span) ?? []
      acc.push(line)
      bySymbol.set(span, acc)
    }

    for (const [span, lines] of bySymbol) {
      const fullyUncovered = span ? !hasCoveredLine(span, covered) : false
      const branches = span
        ? countBranches(source, span.start, span.end)
        : countBranches(source, lines[0]!, lines.at(-1)!)

      gaps.push({
        file,
        symbol: span?.name ?? null,
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

/**
 * Product code = a source extension for this language, and not a test/spec/fixture.
 * This is what lets an absent-from-report file be treated as a total gap without every changed
 * README, lockfile and snapshot becoming one too. Both rules are registry data — no language
 * branching here.
 */
function isProductCode(file: string, lang: Language): boolean {
  if (lang.testFilePattern.test(file)) return false
  return lang.sourceExtensions.some((ext) => file.endsWith(ext))
}

function hasCoveredLine(span: SourceSymbol, covered: Set<number>): boolean {
  for (const line of covered) if (line >= span.start && line <= span.end) return true
  return false
}
