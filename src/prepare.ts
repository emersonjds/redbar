import { execSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { hasTests, isProductFile, walk } from './files.js'
import type { Language, Runner } from './languages.js'

export type Prepared = {
  /** did we have to run the suite to get a report? */
  ran: boolean
  /** the report was already there, but older than the code it claims to describe */
  stale: boolean
}

/**
 * Get the project to a state where a coverage report exists, doing the work rather than lecturing
 * the developer about it.
 *
 * The three states a real repository shows up in, and the only honest response to each:
 *
 *   report is there      → use it. Warn if it is older than the code (a stale report is a lie,
 *                          and it lies in the dangerous direction: code added after the last run
 *                          appears in no report at all, so it reads as "nothing to test").
 *   no report, has tests → RUN the suite. The command is the project's own, from the registry.
 *                          Making the developer copy-paste a command we already know is not
 *                          caution, it is a chore.
 *   no report, no tests  → STOP. There is nothing to run. An empty report would come back as
 *                          "no gaps", which is the worst possible answer: it is wrong, and it
 *                          sounds like good news.
 */
export function ensureCoverage(
  root: string,
  language: Language,
  runner: Runner,
  reportPath: string,
  run: boolean,
): Prepared {
  const report = join(root, reportPath)

  if (existsSync(report)) {
    return { ran: false, stale: isStale(root, report, language) }
  }

  if (!hasTests(root, language)) {
    throw new Error(
      `redbar: this project has no test files (nothing matches ${language.testFilePattern}).\n` +
        `There is no coverage to measure yet. Run \`redbar init\` to see which test libraries are ` +
        `missing — it prints the install command and installs nothing.`,
    )
  }

  if (!run) {
    // the command must come from the RUNNER, not the language: telling a jest project to run
    // vitest prints a command that can never produce the report we are waiting for
    throw new Error(
      `redbar: coverage report not found at ${reportPath}. Run: ${runner.coverageCommand}`,
    )
  }

  // stderr, not stdout: stdout is the report, and a caller piping `redbar inspect --json` into jq
  // must not get this line mixed into the JSON
  process.stderr.write(
    `redbar: no coverage report at ${reportPath}.\n` +
      `redbar: running the project's own coverage command — this can take a while.\n` +
      `redbar: $ ${runner.coverageCommand}\n`,
  )

  try {
    // shell: true is implicit in execSync, and it is required — several registry commands are
    // pipelines (`go test … && gocover-cobertura < … > …`). The command is ours, from the
    // registry; it is never built from user input.
    execSync(runner.coverageCommand, { cwd: root, stdio: 'inherit' })
  } catch {
    // A failing suite still writes a report for the tests that DID run, and that report is worth
    // reading. A suite that fails and writes nothing is caught by the existsSync below.
    process.stderr.write(`redbar: the coverage command exited non-zero — reading what it wrote.\n`)
  }

  if (!existsSync(report)) {
    throw new Error(
      `redbar: ran \`${runner.coverageCommand}\` but ${reportPath} still does not exist.\n` +
        `The command may not be the one this project uses. Generate the report your way, then ` +
        `run redbar again.`,
    )
  }

  return { ran: true, stale: false }
}

/**
 * Is the report older than the code it describes?
 *
 * This is not pedantry. A report generated before the last commit does not merely under-report —
 * the new code is ABSENT from it, and an absent file is indistinguishable from a file with no
 * lines. The gap the developer most needs to see is the one a stale report hides best.
 */
function isStale(root: string, report: string, language: Language): boolean {
  const reportTime = statSync(report).mtimeMs

  for (const file of walk(root)) {
    if (!isProductFile(file, language)) continue
    if (statSync(join(root, file)).mtimeMs > reportTime) return true
  }
  return false
}
