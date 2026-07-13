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

  const coverage = parse(readFileSync(full, 'utf8'), language.format, root)

  const base = opts.base ?? (opts.changed ? '' : detectBase(root))
  const changed = opts.changed ?? changedLines(root, base)

  const readSource = (file: string): string | null => {
    const p = join(root, file)
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  }

  return { language, base, gaps: findGaps(coverage, changed, language, readSource) }
}

function parse(text: string, format: CoverageFormat, root: string): Coverage {
  if (format === 'lcov') return parseLcov(text, root)
  if (format === 'jacoco') return parseJacoco(text)
  return parseCobertura(text)
}
