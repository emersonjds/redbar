import type { Coverage, FileCoverage } from '../types.js'

/**
 * A file legitimately appears in more than one block or record: a PHP class + its trait, a
 * coverlet `<>c__DisplayClass`, a concatenated lcov from a monorepo. Accumulate, never overwrite.
 */
export type LineHits = Map<string, Map<number, boolean>>

/** A line covered in ANY record is covered — hits OR together, so it can never end up in both lists. */
export function addLine(acc: LineHits, file: string, line: number, covered: boolean): void {
  let lines = acc.get(file)
  if (!lines) acc.set(file, (lines = new Map()))
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
