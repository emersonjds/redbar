import type { Coverage, FileCoverage } from '../types.js'

// ponytail: regex instead of an XML parser. JaCoCo output is machine-generated, flat, and
// namespace-free — worth the ~30 lines over a dependency. If a real report ever fails to
// parse, that is when fast-xml-parser earns its place.
const PACKAGE = /<package\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/package>/g
const SOURCEFILE = /<sourcefile\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/sourcefile>/g
const LINE = /<line\s+nr="(\d+)"[^>]*\bci="(\d+)"/g

export function parseJacoco(xml: string, sourceRoots = ['src/main/java']): Coverage {
  const cov: Coverage = new Map()
  const root = sourceRoots[0] ?? ''

  for (const [, pkg, pkgBody] of xml.matchAll(PACKAGE)) {
    for (const [, name, sfBody] of (pkgBody ?? '').matchAll(SOURCEFILE)) {
      const file = [root, pkg, name].filter(Boolean).join('/')
      const fc: FileCoverage = { file, covered: [], uncovered: [] }
      for (const [, nr, ci] of (sfBody ?? '').matchAll(LINE)) {
        ;(Number(ci) > 0 ? fc.covered : fc.uncovered).push(Number(nr))
      }
      cov.set(file, fc)
    }
  }
  return cov
}
