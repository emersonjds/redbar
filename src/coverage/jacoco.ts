import type { Coverage } from '../types.js'
import { addLine, type LineHits, toCoverage } from './merge.js'

// ponytail: regex instead of an XML parser. JaCoCo output is machine-generated, flat, and
// namespace-free — worth the ~30 lines over a dependency. If a real report ever fails to
// parse, that is when fast-xml-parser earns its place.
const PACKAGE = /<package\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/package>/g
const SOURCEFILE = /<sourcefile\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/sourcefile>/g
const LINE = /<line\s+nr="(\d+)"[^>]*\bci="(\d+)"/g

/**
 * The report carries a package + a filename, never a source root — the root comes from the
 * registry (`src/main/java`, `src/main/kotlin`) and from the modules found on disk.
 * ponytail: one key per candidate root; the roots that do not exist never meet a changed path,
 * so they cost nothing. Ceiling: an AGGREGATE report of a multi-module build with the same
 * package + class name in two modules merges them. Split the roots then, or read each module report.
 */
export function parseJacoco(xml: string, sourceRoots: string[] = ['src/main/java']): Coverage {
  const acc: LineHits = new Map()
  const roots = sourceRoots.length > 0 ? sourceRoots : ['']

  for (const [, pkg, pkgBody] of xml.matchAll(PACKAGE)) {
    for (const [, name, sfBody] of (pkgBody ?? '').matchAll(SOURCEFILE)) {
      for (const root of roots) {
        const file = [root, pkg, name].filter(Boolean).join('/')
        for (const [, nr, ci] of (sfBody ?? '').matchAll(LINE)) {
          addLine(acc, file, Number(nr), Number(ci) > 0)
        }
      }
    }
  }
  return toCoverage(acc)
}
