import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCobertura } from './coverage/cobertura.js'
import { parseJacoco } from './coverage/jacoco.js'
import { parseLcov } from './coverage/lcov.js'
import { detect } from './detect.js'
import { findGaps } from './gap.js'
import { changedLines, detectBase } from './git.js'
import type { Language } from './languages.js'
import type { ChangedLines, Coverage, CoverageFormat, Gap } from './types.js'

export type Inspection = { language: Language; base: string; gaps: Gap[] }

export type InspectOptions = {
  base?: string
  /** inject the diff instead of shelling out to git — used by the fixtures, which are not repos */
  changed?: ChangedLines
  /** override the report path declared in the registry */
  reportPath?: string
}

export function inspect(root: string, opts: InspectOptions = {}): Inspection {
  const language = detect(root)
  const reportPath = opts.reportPath ?? language.reportPath
  const full = join(root, reportPath)

  if (!existsSync(full)) {
    throw new Error(
      `redbar: coverage report not found at ${reportPath}. Run: ${language.coverageCommand}`,
    )
  }

  const coverage = parse(readFileSync(full, 'utf8'), language, root)

  const base = opts.base ?? (opts.changed ? '' : detectBase(root))
  const changed = opts.changed ?? changedLines(root, base)

  const readSource = (file: string): string | null => {
    const p = join(root, file)
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  }

  return { language, base, gaps: findGaps(coverage, changed, language, readSource) }
}

function parse(text: string, language: Language, root: string): Coverage {
  switch (language.format) {
    case 'lcov':
      return parseLcov(text, root)
    case 'jacoco':
      return parseJacoco(text, sourceRootsFor(language, root))
    case 'cobertura':
      return parseCobertura(text)
    default:
      // a new CoverageFormat with no parser is a compile error here, not a silent misroute
      return assertNever(language.format)
  }
}

/**
 * JaCoCo keys are package-relative, so the source root has to be prepended to cross with git.
 * Pick the one that actually exists on disk — a Kotlin or multi-module repo does not use the
 * default, and guessing wrong yields zero gaps and no error.
 */
function sourceRootsFor(language: Language, root: string): string[] | undefined {
  const roots = language.sourceRoots
  if (!roots) return undefined
  return [roots.find((r) => existsSync(join(root, r))) ?? roots[0]!]
}

function assertNever(format: never): never {
  throw new Error(`redbar: no parser wired for coverage format "${String(format)}"`)
}
