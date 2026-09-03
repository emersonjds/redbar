// Pure: everything arrives in AuditInput, already gathered by the caller. No disk, no process,
// no model — the same contract gap.ts and execute.ts hold. Every number below is arithmetic over
// the coverage report, the file tree and the manifest, and every failed line carries the
// arithmetic that produced it, exactly as `explain` does for a gap's score.
import { countAssertions } from './assertions.js'
import { classify } from './classify.js'
import { stripNonCode } from './code.js'
import type { Inspection } from './engine.js'
import { detectProfile, kindPriority, type Profile } from './profile.js'
import type { Coverage, TestKind } from './types.js'

export type Category = 'setup' | 'coverage' | 'rigor' | 'pyramid'

/** One thing the audit checked. `passed` decides which block it renders in. */
export type Check = {
  category: Category
  passed: boolean
  /** the sentence shown to the human, arithmetic included */
  detail: string
}

/** Everything the audit needs, already gathered by the caller. Nothing here is read from disk. */
export type AuditInput = {
  /** the whole-repo inspection: gaps, language, runner, staleness */
  inspection: Inspection
  coverage: Coverage
  /**
   * repo-relative paths of TEST files — what `language.testPattern` matched, never
   * `nonProductPattern`. That other pattern answers "not product code": it also matches
   * `vitest.config.ts`, `.d.ts` and generated files, and grading a config file as a test that
   * asserts nothing is a false accusation.
   */
  testFiles: string[]
  /** repo-relative paths of product files, whether or not the report knows them */
  productFiles: string[]
  readSource: (file: string) => string | null
  /** the project manifest, already read — the same text selectRunner reads */
  manifest: string
}

export type Audit = {
  /**
   * Partial on purpose: no test file short-circuits, and the three other categories are then
   * ABSENT rather than `0`. A `0` would claim a measurement that never happened.
   */
  scores: Partial<Record<Category, number>>
  overall: number
  checks: Check[]
  profile: Profile
  /** no test file: only Setup was computed. The report stops and points at `redbar init`. */
  unmeasurable: boolean
  stale?: boolean
}

/** Fixed, not configurable: a configurable weight makes two projects' scores incomparable. */
const WEIGHTS: Record<Category, number> = { setup: 0.2, coverage: 0.4, rigor: 0.2, pyramid: 0.2 }

/**
 * More than half of a layer untested is the line where the pyramid check flips to FAILED. It is a
 * threshold, so it is stated once, here, and never inside a score — the score is the continuous
 * measure, this only decides which block the sentence renders in.
 */
const LAYER_LIMIT = 0.5

export function audit(input: AuditInput): Audit {
  const profile = detectProfile(input.manifest)

  // sorted and deduped BEFORE anything is counted — the caller's walk order is a filesystem
  // artifact, not a contract, and Setup and Rigor must never report two different counts of the
  // same list.
  const productFiles = unique(input.productFiles)
  const testFiles = unique(input.testFiles)

  const setup = scoreSetup(input, testFiles)

  // Zero test files, not `setup.score === 0`: Rigor DIVIDES by this count, and a repo with a runner
  // and a report but no file matching `testPattern` would take `scoreRigor`'s `return 0` — a
  // measurement that never happened, the thing `Partial<Record<Category, number>>` exists against.
  // Scoring coverage for someone with no tests is a correct answer to a question they did not ask.
  if (testFiles.length === 0) {
    return {
      scores: { setup: setup.score },
      // the fixed weight applied to the one category that was measured. Nothing is renormalised:
      // a per-repo weight makes two repos incomparable, which is the whole point of WEIGHTS.
      overall: round(setup.score * WEIGHTS.setup),
      checks: setup.checks,
      profile,
      unmeasurable: true,
      stale: input.inspection.stale,
    }
  }

  const coverage = scoreCoverage(input, productFiles)
  const rigor = scoreRigor(input, testFiles)
  const pyramid = scorePyramid(input, productFiles, profile)

  const scores = {
    setup: setup.score,
    coverage: coverage.score,
    rigor: rigor.score,
    pyramid: pyramid.score,
  }

  return {
    scores,
    overall: round(
      scores.setup * WEIGHTS.setup +
        scores.coverage * WEIGHTS.coverage +
        scores.rigor * WEIGHTS.rigor +
        scores.pyramid * WEIGHTS.pyramid,
    ),
    checks: [...setup.checks, ...coverage.checks, ...rigor.checks, ...pyramid.checks],
    profile,
    unmeasurable: false,
    stale: input.inspection.stale,
  }
}

type Scored = { score: number; checks: Check[] }

/**
 * Three booleans, weighted 50/25/25. This is the 0-to-1 axis: without these, nothing else is
 * measurable, and the weights say which of the three the project cannot do without.
 */
function scoreSetup(input: AuditInput, testFiles: string[]): Scored {
  const { runner, language } = input.inspection
  const tests = testFiles.length
  // `selectRunner` falls back to the first runner when the manifest names none, so the manifest
  // is what separates a real match from a guess — the same regex, read the same way.
  const named = runner.detect.test(input.manifest)
  const files = input.coverage.size

  const checks: Check[] = [
    {
      category: 'setup',
      passed: tests > 0,
      // the pattern itself, not "the ts test pattern": redbar measured a regex, and a reader whose
      // tests are named some other way can see that in one line instead of being told they have
      // none. `String(regexp)` is stable, so the sentence stays byte-identical run to run.
      detail:
        tests > 0
          ? `${count(tests)} test file(s) match ${language.testPattern}`
          : `no file matches ${language.testPattern}`,
    },
    {
      category: 'setup',
      passed: named,
      detail: named
        ? `${runner.name} is named in the manifest`
        : `the manifest names no runner — ${runner.name} is a fallback guess, not a match`,
    },
    {
      category: 'setup',
      passed: files > 0,
      detail:
        files > 0
          ? `${runner.reportPath} parsed, ${count(files)} file(s) in it`
          : `${runner.reportPath} parsed 0 files — nothing was measured`,
    },
  ]

  return { score: (tests > 0 ? 50 : 0) + (named ? 25 : 0) + (files > 0 ? 25 : 0), checks }
}

/** Coverage = 100 × covered ÷ executable, over product files. */
function scoreCoverage(input: AuditInput, productFiles: string[]): Scored {
  let executable = 0
  let covered = 0
  let dark = 0

  for (const file of productFiles) {
    const l = lines(file, input)
    executable += l.executable
    covered += l.covered
    if (l.executable > 0 && l.covered === 0) dark++
  }

  // Concentration is reported, never folded into the score as a hidden multiplier: two numbers
  // multiplied together produce a third nobody can reason about.
  const checks: Check[] = [
    {
      category: 'coverage',
      passed: dark === 0,
      detail:
        dark === 0
          ? `all ${count(productFiles.length)} product file(s) have at least one covered line`
          : `${count(dark)} of ${count(productFiles.length)} product files (${percent(dark, productFiles.length)}%) have no coverage at all`,
    },
    {
      category: 'coverage',
      passed: covered === executable,
      detail:
        covered === executable
          ? `all ${count(executable)} executable line(s) are covered`
          : `${count(executable - covered)} of ${count(executable)} executable lines are untested`,
    },
  ]

  return { score: executable === 0 ? 100 : percent(covered, executable), checks }
}

/** Rigor = 100 × clean test files ÷ test files. Clean = asserts something, disables nothing. */
function scoreRigor(input: AuditInput, testFiles: string[]): Scored {
  const { language } = input.inspection
  let clean = 0
  let silent = 0
  let skipped = 0
  let exclusive = 0
  const markers = new Set<string>()

  for (const file of testFiles) {
    const source = input.readSource(file) ?? ''
    const asserts = countAssertions(source, language) > 0
    if (!asserts) silent++

    // over CODE only, the same gate countAssertions uses — a `// it.skip(...)` is not a
    // disabled test, and a gate a comment can walk through is not a gate
    const code = stripNonCode(source)
    const found = language.disabledTestPatterns.flatMap((p) => matchAll(code, p))
    for (const marker of found) markers.add(marker.trim())

    if (found.length === 0) {
      if (asserts) clean++
      continue
    }

    // `.only` reads from the text the registry pattern matched, never from the language id
    if (found.some((m) => EXCLUSIVE.test(m))) exclusive++
    else skipped++
  }

  const checks: Check[] = [
    {
      category: 'rigor',
      passed: silent === 0,
      detail:
        silent === 0
          ? `all ${count(testFiles.length)} test file(s) assert something`
          : `${count(silent)} of ${count(testFiles.length)} test files assert nothing`,
    },
    {
      category: 'rigor',
      passed: skipped + exclusive === 0,
      detail:
        skipped + exclusive === 0
          ? `no test file disables a test`
          : `${count(skipped + exclusive)} of ${count(testFiles.length)} test files disable a test: ${[...markers].sort().join(', ')}`,
    },
  ]

  // `.only` earns its own sentence because its consequence differs in kind: `.skip` disables one
  // test, `.only` silently disables every OTHER test in that file. Emitted only when it happens —
  // its passed form would say the same thing as the check above.
  if (exclusive > 0) {
    checks.push({
      category: 'rigor',
      passed: false,
      detail: `${count(exclusive)} of ${count(testFiles.length)} test files use .only — the other tests in those files never run`,
    })
  }

  // no test file means no clean test file — 0 is the measurement, not a missing one
  return { score: testFiles.length === 0 ? 0 : percent(clean, testFiles.length), checks }
}

/** matches whose text says "every other test in this file is now disabled" */
const EXCLUSIVE = /only|^f(?:it|describe)\b/

/**
 * Pyramid = 100 × (1 − Σ(weight × rate) ÷ Σ weight), the weights coming from `kindPriority`.
 *
 * A kind with no product line at all contributes 0 to BOTH sums, so a library with no e2e surface
 * is not penalised for having no e2e test.
 */
function scorePyramid(input: AuditInput, productFiles: string[], profile: Profile): Scored {
  const product = new Map<TestKind, number>()
  for (const file of productFiles) {
    const kind = classify(file, input.readSource(file) ?? '')
    product.set(kind, (product.get(kind) ?? 0) + lines(file, input).executable)
  }

  const gaps = new Map<TestKind, number>()
  for (const gap of input.inspection.gaps) {
    gaps.set(gap.kind, (gaps.get(gap.kind) ?? 0) + gap.lines.length)
  }

  const order = kindPriority(profile)
  const checks: Check[] = []
  let weighted = 0
  let total = 0

  for (const [index, kind] of order.entries()) {
    const productLines = product.get(kind) ?? 0
    if (productLines === 0) continue

    const weight = order.length - index // 3, 2, 1 by position in kindPriority
    // `everyLine` hands the whole file to the gap set when the report does not know it, blank
    // lines included, so the numerator can outrun the shared executable-line denominator. Clamp:
    // a layer is at worst 100% untested.
    const gapLines = Math.min(gaps.get(kind) ?? 0, productLines)
    const rate = gapLines / productLines

    weighted += weight * rate
    total += weight

    checks.push({
      category: 'pyramid',
      passed: rate <= LAYER_LIMIT,
      // the profile is NOT repeated here: it is named once in the header, and the order it
      // produces is stated once under the bars. Three rows apologising for the same profile is
      // noise around a measurement.
      detail: `${kind} weighs ×${weight} — ${count(gapLines)} of ${count(productLines)} lines (${percent(gapLines, productLines)}%) untested`,
    })
  }

  return { score: total === 0 ? 100 : round(100 * (1 - weighted / total)), checks }
}

/**
 * THE definition of "executable lines" in one file — Coverage and Pyramid both call this, so the
 * two scores can never disagree about the size of the same file.
 *
 * Present in the report: exactly what the report says, `covered + uncovered`; blank lines, imports
 * and closing braces are already excluded by the instrumenter. Absent from the report: there is no
 * instrumenter output to read, so every non-blank line counts and none is covered. Absence means
 * "no test imports this file" — never "uninstrumented", the rule gap.ts already rests on. Counting
 * from the source overstates that file's weight slightly, and the overstatement runs in the safe
 * direction: it inflates the cost of a file nobody tests at all.
 */
function lines(file: string, input: AuditInput): { executable: number; covered: number } {
  const fc = input.coverage.get(file)
  if (fc) return { executable: fc.covered.length + fc.uncovered.length, covered: fc.covered.length }

  const source = input.readSource(file) ?? ''
  return { executable: source.split('\n').filter((l) => l.trim() !== '').length, covered: 0 }
}

/** every match of `pattern` in `code`, as text — the pattern is registry data and may lack /g */
function matchAll(code: string, pattern: RegExp): string[] {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
  return code.match(global) ?? []
}

/** the caller's file order is a filesystem artifact, not a contract */
function unique(files: string[]): string[] {
  return [...new Set(files)].sort()
}

/** THE rounding rule: Math.round, applied once, at the end. Every score is an integer 0-100. */
function round(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)))
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : round(100 * (part / whole))
}

/** thousands separator, locale pinned so the same input renders the same bytes anywhere */
function count(n: number): string {
  return n.toLocaleString('en-US')
}
