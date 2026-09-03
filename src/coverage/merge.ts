import type { Coverage, FileCoverage } from '../types.js'

/**
 * A file legitimately appears in more than one block or record: a PHP class + its trait, a
 * coverlet `<>c__DisplayClass`, a concatenated lcov from a monorepo. Accumulate, never overwrite.
 */
export type LineHits = Map<string, Map<number, boolean>>

/**
 * The file was MEASURED. Called for every record the report opens, before any line is read.
 *
 * A file the instrumenter measured and found no executable line in (a file of nothing but
 * `export type`, an interface, a constants file) legitimately has zero lines. Creating the entry
 * only when a line arrives makes that file indistinguishable from one the report never saw — and
 * an unseen file is charged as fully uncovered, by design, everywhere downstream. Empty entry =
 * "measured, nothing to test"; absent = "no test imports this".
 */
export function addFile(acc: LineHits, file: string): void {
  if (!acc.has(file)) acc.set(file, new Map())
}

/** A line covered in ANY record is covered — hits OR together, so it can never end up in both lists. */
export function addLine(acc: LineHits, file: string, line: number, covered: boolean): void {
  addFile(acc, file)
  const lines = acc.get(file)!
  lines.set(line, covered || (lines.get(line) ?? false))
}

export function toCoverage(acc: LineHits): Coverage {
  const cov: Coverage = new Map()
  for (const [file, lines] of acc) {
    const fc: FileCoverage = { file, covered: [], uncovered: [] }
    for (const nr of [...lines.keys()].sort((a, b) => a - b)) {
      ;(lines.get(nr) ? fc.covered : fc.uncovered).push(nr)
    }
    cov.set(file, fc)
  }
  return cov
}
