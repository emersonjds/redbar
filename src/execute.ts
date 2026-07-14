/**
 * The gap loop.
 *
 * Every effect — spawning the agent, reading, deleting, reverting, running a test — arrives as a
 * parameter. Nothing here touches disk or spawns a process, which is why the whole loop (three
 * gates, seven verdicts, the retry) is exercised in test/execute.test.ts without a repo or an agent
 * anywhere in sight. cli.ts supplies the real effects.
 */
import { countAssertions } from './assertions.js'
import type { Conventions } from './briefing.js'
import type { Language } from './languages.js'
import type { Attempt } from './outcome.js'
import { ranked, severity } from './severity.js'
import type { Gap } from './types.js'

export type Effects = {
  /** run the agent once, headless, on one prompt. Returns its stdout. Throws on timeout. */
  runAgent: (prompt: string) => string
  /** repo-relative paths the agent created or modified — from git, not from the agent's word */
  changedFiles: () => string[]
  readFile: (file: string) => string | null
  deleteFile: (file: string) => void
  /** `git checkout -- <file>` */
  revertFile: (file: string) => void
  /** run just this test file. true when it passes. */
  runTest: (testFile: string) => boolean
  /** progress, for the human watching the terminal */
  onVerdict?: (attempt: Attempt, index: number, total: number) => void
}

export function executeGaps(
  gaps: Gap[],
  language: Language,
  conventions: Conventions,
  effects: Effects,
  source: (file: string) => string | null,
): Attempt[] {
  const work = ranked(gaps)
  const attempts: Attempt[] = []

  work.forEach((gap, i) => {
    const attempt = attemptGap(gap, language, conventions, effects, source)
    attempts.push(attempt)
    effects.onVerdict?.(attempt, i, work.length)
  })

  return attempts
}

function attemptGap(
  gap: Gap,
  language: Language,
  conventions: Conventions,
  effects: Effects,
  source: (file: string) => string | null,
): Attempt {
  const id = { file: gap.file, symbol: gap.symbol, line: gap.lines[0]! }

  // The baseline. changedFiles() reports the state of the WHOLE working tree, not what THIS
  // gap's agent did — without subtracting it out, a human's uncommitted edit sitting there before
  // redbar even started gets revertFile'd as if the agent wrote it (unrecoverable: `git checkout
  // --` has no reflog, no stash), and gap 2 adopts gap 1's already-accepted test file as its own
  // output, or deletes it out from under it, just because it is still dirty in the tree. Taking
  // this immediately before runAgent and subtracting it after is the only thing that lets one
  // gap's verdict be about what one gap's agent actually touched. Do not simplify this away.
  const before = new Set(effects.changedFiles())

  let stdout: string
  try {
    stdout = effects.runAgent(buildPrompt(gap, language, conventions, source(gap.file)))
  } catch (err) {
    // one gap that hangs or dies must not end the run — the other twelve are still worth writing
    return { ...id, verdict: 'timeout', note: err instanceof Error ? err.message : String(err) }
  }

  // .sort(): changedFiles() makes no ordering guarantee, and this project's whole premise is a
  // deterministic answer — the same tree must produce the same output every run.
  const touched = effects.changedFiles().filter((f) => !before.has(f)).sort()
  const testFiles = touched.filter((f) => language.testFilePattern.test(f))
  const productFiles = touched.filter((f) => !language.testFilePattern.test(f))

  // GATE 1 — scope. An agent that edits the product to make its test pass closes the gap, raises
  // coverage, greens the suite, and has silently changed what the system does. This is the worst
  // outcome available and the only defence is mechanical.
  if (productFiles.length > 0) {
    for (const file of productFiles) effects.revertFile(file)
    for (const file of testFiles) effects.deleteFile(file)
    return { ...id, verdict: 'touched-source', note: `reverted: ${productFiles.join(', ')}` }
  }

  // GATE 1b — exactly one file. The prompt asks for exactly one test file; more than that means
  // some of what the agent wrote would run, assert, and raise coverage without ever being read or
  // judged by gate 2. All of it is deleted — this is a MEASURED verdict, redbar counted the files.
  if (testFiles.length > 1) {
    for (const file of testFiles) effects.deleteFile(file)
    return { ...id, verdict: 'too-many-files', note: `wrote ${testFiles.length}: ${testFiles.join(', ')}` }
  }

  const testFile = testFiles[0]
  if (!testFile) return { ...id, verdict: 'no-output' }

  // GATE 2 — assertions. Checked BEFORE the test is run, because a test that asserts nothing always
  // passes: running it first would just confirm the trick.
  const written = effects.readFile(testFile)
  if (written === null) {
    // could not read the file at all — not the same claim as "read it fine, it asserts nothing"
    effects.deleteFile(testFile)
    return { ...id, verdict: 'no-assertion', note: 'could not read the file the agent wrote' }
  }
  if (countAssertions(written, language) === 0) {
    effects.deleteFile(testFile)
    return { ...id, verdict: 'no-assertion', note: 'the test asserts nothing' }
  }

  // GATE 3 — execution. One retry: a flaky first run is common, two failures is a real one.
  if (!effects.runTest(testFile) && !effects.runTest(testFile)) {
    effects.deleteFile(testFile)
    // .slice(-500) keeps the LAST 500 chars — a reason stated at the top of a chatty agent log is lost
    return { ...id, verdict: 'needs-human', note: stdout.trim().slice(-500) }
  }

  return { ...id, verdict: 'closed', testFile }
}

/**
 * The prompt for ONE gap.
 *
 * One gap per call, never the list. A small prompt is a focused agent: the model sees one symbol,
 * one layer, one standard and one file to write, and it cannot drift into "while I am here". It
 * also means a failure is isolated to its gap instead of poisoning the batch.
 */
export function buildPrompt(
  gap: Gap,
  language: Language,
  conventions: Conventions,
  source: string | null,
): string {
  const standard = language.standards[gap.kind]
  const convention = conventions[gap.kind]

  return [
    `Write ONE ${gap.kind} test for \`${gap.symbol ?? gap.file}\` in ${language.name}.`,
    '',
    `## The gap (measured — not an opinion)`,
    '',
    `- file: ${gap.file}:${gap.lines[0]}`,
    `- symbol: ${gap.symbol ?? '(none)'}`,
    `- criticality: ${severity(gap)}`,
    `- ${gap.lines.length} line(s) that no test executes, across ${gap.branches} branch(es)`,
    `- coverage today: ${gap.fullyUncovered ? 'none at all' : 'partial — a test already points at it'}`,
    '',
    `## The standard — follow it, do not invent one`,
    '',
    convention ?? `Follow ${standard.name}: ${standard.url}`,
    '',
    `## The rules`,
    '',
    `1. Write exactly one test file. Create nothing else. Touch no file besides that one.`,
    `2. NEVER weaken an assertion to make the test pass. A test that asserts nothing is worse than`,
    `   no test — it reports coverage that does not exist. If it cannot pass honestly, say why and`,
    `   write nothing.`,
    `3. Do not touch the source file. Not to fix it, not to export something, not for anything.`,
    `4. Assert on behaviour, especially the uncovered branches listed above.`,
    '',
    `## The source`,
    '',
    '```',
    source ?? '(source unavailable)',
    '```',
  ].join('\n')
}
