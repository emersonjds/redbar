import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseCobertura } from './coverage/cobertura.js'
import { parseJacoco } from './coverage/jacoco.js'
import { parseLcov } from './coverage/lcov.js'
import { detect } from './detect.js'
import { isProductFile, walk } from './files.js'
import { findGaps, type SourceReader } from './gap.js'
import { changedLines, detectBase } from './git.js'
import { ensureCoverage } from './prepare.js'
import { selectRunner } from './runner.js'
import type { Language, Runner } from './languages.js'
import type { ChangedLines, Coverage, CoverageFormat, Gap } from './types.js'

export type Inspection = {
  language: Language
  runner: Runner
  base: string
  gaps: Gap[]
  /**
   * The coverage report is older than the code. The gap list is then a LOWER BOUND, not the truth:
   * code written after the last coverage run is absent from the report entirely, and absent reads
   * as "nothing to test". Every renderer must say this out loud — an agent reading a stale brief
   * writes the wrong tests and reports success.
   */
  stale?: boolean
}

export type InspectOptions = {
  base?: string
  /** inject the diff instead of shelling out to git — used by the fixtures, which are not repos */
  changed?: ChangedLines
  /** override the report path the runner declares */
  reportPath?: string
  /**
   * Scan the WHOLE repository instead of the diff.
   *
   * The diff is the right default — nobody takes a legacy repo from 12% to 80%, and everybody can
   * avoid making it worse. But a developer meeting redbar for the first time is standing on `main`
   * with an empty diff, and answering "0 gaps" to someone who has 400 untested functions is a
   * correct answer to a question they did not ask. `--all` is that first look.
   */
  all?: boolean
  /**
   * Generate the coverage report when it is missing, by running the project's own coverage command.
   *
   * Off by default, and the default is the careful one on purpose: `inspect` is a library function,
   * and a library that silently spawns someone's twenty-minute test suite is a library nobody
   * trusts. The CLI turns it on, because a developer who typed `redbar inspect` asked for an
   * answer, not for a chore.
   */
  run?: boolean
}

export function inspect(root: string, opts: InspectOptions = {}): Inspection {
  const language = detect(root)
  const runner = selectRunner(root, language)
  const reportPath = opts.reportPath ?? runner.reportPath

  const { stale } = ensureCoverage(root, language, runner, reportPath, opts.run === true)
  const full = join(root, reportPath)

  // Every coverage writer that emits absolute paths (jest, cargo-llvm-cov, pytest --cov) is keyed
  // against the real directory, so the root we strip must be a real directory too. Passing the raw
  // `.` — which is what `redbar inspect` with no argument passes — strips nothing, leaves every key
  // absolute, intersects nothing with git, and reports gaps that are an artifact of the mismatch.
  const coverage = parse(readFileSync(full, 'utf8'), language, resolve(root))

  const readSource = (file: string): string | null => {
    const p = join(root, file)
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  }

  const base = opts.all ? WHOLE_REPO : (opts.base ?? (opts.changed ? '' : detectBase(root)))
  const changed =
    opts.changed ?? (opts.all ? everyLine(root, language, readSource) : changedLines(root, base))

  return { language, runner, base, stale, gaps: findGaps(coverage, changed, language, readSource) }
}

/** what `base` reads as when there is no diff, because the whole repo is the subject */
export const WHOLE_REPO = '(whole repository)'

/**
 * Every line of every product file, as if the whole repository were the diff.
 *
 * Deliberately the whole FILE TREE, not just the files present in the coverage report: a file no
 * test ever imported never appears in the report at all, and that file is the biggest gap there
 * is. Reading the universe from the report would make the worst gaps the only invisible ones.
 * Everything downstream — the crossing, the symbol attribution, the ranking — is untouched.
 */
function everyLine(root: string, language: Language, readSource: SourceReader): ChangedLines {
  const changed: ChangedLines = new Map()

  for (const file of walk(root)) {
    if (!isProductFile(file, language)) continue

    const source = readSource(file)
    if (source === null) continue

    changed.set(
      file,
      source.split('\n').map((_, i) => i + 1),
    )
  }

  return changed
}

function parse(text: string, language: Language, root: string): Coverage {
  switch (language.format) {
    case 'lcov':
      return parseLcov(text, root)
    case 'jacoco':
      return parseJacoco(text, sourceRootsFor(language, root))
    case 'cobertura':
      // root matters: `filename` in a cobertura report is relative to <source>, not to the repo
      return parseCobertura(text, root)
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
