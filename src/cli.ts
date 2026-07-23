#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { agentById, detectAgent } from './agents.js'
import { renderBriefing, type Conventions } from './briefing.js'
import { CLIENTS, clientById, launch, npxLaunch } from './clients.js'
import { compareRuns, renderTrendHtml, renderTrendText } from './compare.js'
import { detect } from './detect.js'
import { inspect, type Inspection, type InspectOptions } from './engine.js'
import { executeGaps, type Effects } from './execute.js'
import { bandReason, explain, matchGaps, scoreArithmetic } from './explain.js'
import { runDirName, summarize } from './history.js'
import type { Language } from './languages.js'
import { serve, type ToolArgs, type ToolBox } from './mcp.js'
import { reconcile } from './outcome.js'
import { htmlToPdf } from './pdf.js'
import { detectProfile } from './profile.js'
import {
  renderHtml,
  renderJson,
  renderMarkdown,
  renderOutcomeHtml,
  renderOutcomeMarkdown,
  renderText,
} from './report.js'
import { readManifest, selectE2eTool, selectRunner } from './runner.js'
import { meetsSeverity, ranked, severity, type Severity } from './severity.js'
import type { Gap, TestKind } from './types.js'

const HELP = `redbar — test-coverage gaps in what changed, zero-LLM

Usage:
  redbar briefing [path] [--all] [--base <ref>] [--out <file>]   the testing brief, for your agent
  redbar execute [path] [--agent <id>] [--severity <band>] [--yes] [--all] [--base <ref>] [--max <n>]   hand the gaps to your agent
  redbar explain [symbol] [--all] [--path <dir>] [--base <ref>]  where a number came from
  redbar compare [<runA> <runB>]                                 diff two kept runs — the progress, for a boss
  redbar inspect [path] [--all] [--base <ref>] [--json] [--html <file>] [--md <file>] [--out <dir>] [--top <n>]
  redbar mcp [path]                                              MCP server on stdio
  redbar mcp-config [client] [--local]                          paste-ready MCP registration (npx; --local for a clone)
  redbar init [path]
  redbar ci [path] [--max-critical <n>] [--max-high <n>] [--base <ref>] [--md <file>]
  redbar --help
  redbar --version

  --all   scan the whole repository instead of the diff. The diff is the default: nobody takes a
          legacy repo to 80%, everybody can avoid making it worse. Use --all for the first look.

  --severity <band>   which gaps execute hands the agent: critical (default), high, medium, low, or
          all. It cuts by the triage band, not by count. --max still caps the number within it.
  --yes   skip the confirmation and proceed (for CI). Without it, execute prints the plan and asks.

  shortcuts:  i = inspect · b = briefing · x = execute · why = explain
`

const LAYERS: TestKind[] = ['unit', 'integration', 'e2e']

/**
 * The standard for each layer: the one redbar ships, then the project's own deltas appended.
 *
 * A project override is for the genuinely local choice no library documents (MSW or nock? which
 * fixture factory?). It is APPENDED, never a replacement — a project that overrides everything has
 * not adopted a standard, it has written a house style with extra steps.
 */
function readConventions(root: string, language: Language): Conventions {
  const conventions: Conventions = {}
  const e2eFile = selectE2eTool(root, language).conventionFile

  for (const layer of LAYERS) {
    const fileName = layer === 'e2e' ? e2eFile : `${layer}.md`
    const shipped = fileURLToPath(
      new URL(`../conventions/${language.id}/${fileName}`, import.meta.url),
    )
    const project = join(root, '.redbar', 'conventions', language.id, `${layer}.md`)
    const parts = [shipped, project].filter(existsSync).map((p) => readFileSync(p, 'utf8'))

    if (parts.length > 0) conventions[layer] = parts.join('\n\n---\n\n')
  }

  return conventions
}

function briefingFor(root: string, inspection: Inspection): string {
  const { language } = inspection
  const profile = detectProfile(readManifest(root, language))
  const e2eStandard = selectE2eTool(root, language).standard
  return renderBriefing(
    inspection,
    readConventions(root, language),
    basename(resolve(root)),
    profile,
    e2eStandard,
  )
}

type Flags = Record<string, string | boolean>

/** Hand-rolled arg parsing: flags in VALUE_FLAGS consume the next argv slot, everything else
 *  starting with "--" is a boolean flag, everything else is positional. */
function parseArgs(argv: string[], valueFlags: Set<string>): { positional: string[]; flags: Flags } {
  const positional: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg.startsWith('--')) {
      const name = arg.slice(2)
      flags[name] = valueFlags.has(name) ? (argv[++i] ?? '') : true
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}

/**
 * The options every reporting command shares.
 *
 * `--all` deliberately does NOT reach `redbar ci`: a gate on the whole repository fails the first
 * pull request of every legacy project, gets switched off that afternoon, and takes the gate that
 * WOULD have worked down with it. The gate judges the diff. `--all` is for looking.
 */
function opts(flags: Flags): InspectOptions {
  const base = typeof flags.base === 'string' ? flags.base : undefined
  return {
    // a human at a terminal asked for an answer, not for a chore: if the report is missing, run
    // the project's own coverage command. `--no-run` restores the "print the command and stop"
    // behaviour, which is what a CI job with a separate coverage step wants.
    run: flags['no-run'] !== true,
    ...(flags.all ? { all: true } : {}),
    ...(base ? { base } : {}),
  }
}

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string
  }
  return pkg.version
}

/**
 * A fresh, dated run directory under `.redbar/runs/`, and the `latest` pointer to it. Runs are
 * KEPT, not overwritten — a week from now the developer runs redbar again and `compare` has a
 * before to diff against. The clock names the folder; nothing measured reads it.
 */
function newRunDir(root: string, now: Date): string {
  const runDir = join(root, '.redbar', 'runs', runDirName(now))
  mkdirSync(runDir, { recursive: true })
  return runDir
}

/** Point `.redbar/latest` at the newest run. A symlink where the OS allows it, a text file where it does not. */
function updateLatest(root: string, runDir: string): void {
  const redbar = join(root, '.redbar')
  const link = join(redbar, 'latest')
  const target = relative(redbar, runDir)
  rmSync(link, { force: true })
  try {
    symlinkSync(target, link)
  } catch {
    writeFileSync(link, target)
  }
}

export type GateLimits = { maxCritical: number; maxHigh: number }
export type GateResult = { failed: boolean; counts: Record<Severity, number> }

/** Pure CI-gate decision, kept out of process.exit so it can be tested without spawning a process. */
export function gateResult(
  gaps: Array<Pick<Gap, 'fullyUncovered' | 'branches'>>,
  limits: GateLimits,
): GateResult {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const g of gaps) counts[severity(g)]++
  const failed = counts.critical > limits.maxCritical || counts.high > limits.maxHigh
  return { failed, counts }
}

const BANDS: Severity[] = ['critical', 'high', 'medium', 'low']

/**
 * The band `execute` cuts on. Default is `critical` — the tool writes the least without an opt-in,
 * the same conservative default the `redbar.fix` skill already had. `all` is the explicit escape
 * hatch for "hand the agent everything". Anything else is a typo, and a typo must not silently
 * widen the scope an agent is about to edit.
 */
export function parseSeverityThreshold(flag: string | undefined): Severity | 'all' {
  if (flag === undefined) return 'critical'
  if (flag === 'all') return 'all'
  if ((BANDS as string[]).includes(flag)) return flag as Severity
  throw new Error(
    `redbar: --severity must be one of critical, high, medium, low, all — got "${flag}"`,
  )
}

/**
 * What to do at the authorization gate, decided from flags alone — never from the agent.
 *
 *   --yes            → proceed, no prompt (CI-friendly)
 *   interactive TTY  → ask the human y/N
 *   neither          → stop, touching nothing (a headless run with no --yes never edits the tree)
 *
 * Pure so the decision is tested here; the readline prompt itself lives in runExecute.
 */
export function authorizationOutcome(opts: {
  yes: boolean
  isTTY: boolean
}): 'proceed' | 'ask' | 'stop' {
  if (opts.yes) return 'proceed'
  return opts.isTTY ? 'ask' : 'stop'
}

/**
 * The authorization plan: what the agent is about to be handed, and WHY each one, before it edits
 * anything. The why is measured — `severity`, `scoreArithmetic`, `bandReason`, the same strings
 * `redbar explain` prints, byte-identical every run. No sentence here is model-authored; that is
 * the whole point of showing it before consent (spec risk #1).
 */
export function renderExecutePlan(gaps: Gap[]): string {
  const lines = [`redbar will hand ${gaps.length} gap(s) to the agent, worst first:`, '']
  for (const gap of gaps) {
    lines.push(
      `  ${severity(gap)} · score ${gap.score} · ${gap.symbol ?? '(no symbol)'} — ${gap.file}:${gap.lines[0]}`,
      `    score = ${scoreArithmetic(gap)}`,
      `    ${bandReason(gap).replace(/^ — /, '')}`,
      `    layer: ${gap.kind}`,
      '',
    )
  }
  lines.push(
    `Nothing above is model-authored — it is ${'`'}coverage${'`'} × ${'`'}git diff${'`'}. The agent`,
    `writes the tests; redbar grades them.`,
  )
  return lines.join('\n')
}

function runInspect(argv: string[]): void {
  const { positional, flags } = parseArgs(argv, new Set(['base', 'html', 'md', 'out', 'top']))
  const root = positional[0] ?? '.'

  const inspection = inspect(root, opts(flags))

  if (flags.json) {
    console.log(renderJson(inspection))
  } else {
    const top = typeof flags.top === 'string' ? Number(flags.top) : undefined
    console.log(renderText(inspection, top))
  }

  if (typeof flags.html === 'string') {
    writeFileSync(
      flags.html,
      renderHtml(
        inspection,
        basename(resolve(root)),
        detectProfile(readManifest(root, inspection.language)),
      ),
    )
  }

  // no limits: `inspect` reports, it does not judge. A verdict here would imply a gate that
  // is not running.
  if (typeof flags.md === 'string') {
    writeFileSync(flags.md, renderMarkdown(inspection))
  }

  // resolved against the ANALYZED repo, never the cwd — `redbar inspect /outro/repo` rodado de
  // qualquer lugar tem que deixar o gaps.json lá, não aqui. Achado num repo real: o gaps.json de
  // um projeto caiu dentro da pasta do redbar.
  const outDir = resolve(root, typeof flags.out === 'string' ? flags.out : '.redbar')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'gaps.json'), renderJson(inspection))
}

/**
 * The document — in the three forms the three audiences actually accept.
 *
 *   TESTING.md   the agent reads this. Plain markdown, self-contained, no tool required.
 *   REDBAR.html  the developer opens this. Ranked table, print stylesheet.
 *   REDBAR.pdf   management gets this. Same numbers; nobody forwards a terminal screenshot.
 *
 * One inspection, three renderings. They cannot disagree, which is the only property that makes a
 * report worth sending to someone who cannot re-run it.
 */
function runBriefing(argv: string[]): void {
  const { positional, flags } = parseArgs(argv, new Set(['base', 'out', 'pdf']))
  const root = positional[0] ?? '.'

  const inspection = inspect(root, opts(flags))
  const doc = briefingFor(root, inspection)
  const repo = basename(resolve(root))

  console.log(doc)

  // A dated run, kept — not clobbered. `latest` points at it, and `compare` diffs it against the
  // run before. --out still lets the caller pin TESTING.md wherever they want (a CI artifact path).
  const now = new Date()
  const runDir = newRunDir(root, now)

  const mdPath = typeof flags.out === 'string' ? flags.out : join(runDir, 'TESTING.md')
  const htmlPath = join(runDir, 'REDBAR.html')
  const profile = detectProfile(readManifest(root, inspection.language))
  const html = renderHtml(inspection, repo, profile)

  writeFileSync(mdPath, doc)
  writeFileSync(htmlPath, html)
  writeFileSync(join(runDir, 'gaps.json'), renderJson(inspection))
  writeFileSync(
    join(runDir, 'summary.json'),
    `${JSON.stringify(summarize(inspection.base, inspection.gaps, now), null, 2)}\n`,
  )

  const pdfPath = typeof flags.pdf === 'string' ? flags.pdf : join(runDir, 'REDBAR.pdf')
  const printed = htmlToPdf(html, resolve(pdfPath))

  updateLatest(root, runDir)

  process.stderr.write(`\nredbar: ${mdPath} — the brief, for your agent\n`)
  process.stderr.write(`redbar: ${htmlPath} — the table, for you\n`)
  process.stderr.write(
    printed
      ? `redbar: ${pdfPath} — the same numbers, for whoever asks for a PDF\n`
      : `redbar: no Chrome/Chromium/Edge found, so no PDF. Open ${htmlPath} and press Cmd+P — the\n` +
          `redbar: print stylesheet is already in it, and the result is the same file.\n`,
  )
  process.stderr.write(`redbar: kept in ${runDir} — .redbar/latest points here, compare it with \`redbar compare\`\n`)
}

/**
 * `execute` refuses to run on a dirty working tree. Pure, so it can be tested without a repo.
 *
 * The scope gate in execute.ts subtracts a baseline of already-changed files before judging what
 * the agent touched — otherwise a human's uncommitted edit would be reverted as if the agent had
 * written it. That baseline is also the hole: a product file that is ALREADY dirty when the run
 * starts is inside the baseline, so an agent that then edits that same file is invisible to the
 * gate. redbar cannot tell its own writes from the developer's, and `git checkout --` has no
 * reflog and no stash to recover from. Refuse, like `git rebase` does, and for the same reason.
 * No --force: the flag would exist to be passed by the person about to lose their work.
 */
export function dirtyTreeError(porcelain: string): string | null {
  const dirty = porcelain
    .split('\n')
    .map((line) => {
      const path = line.slice(3).trim()
      // a porcelain rename reads "old -> new"; the new path is the one that exists on disk
      const arrow = path.indexOf(' -> ')
      return arrow >= 0 ? path.slice(arrow + 4) : path
    })
    .filter(Boolean)

  if (dirty.length === 0) return null

  return [
    `redbar: the working tree is not clean. execute will not run.`,
    '',
    ...dirty.map((file) => `  ${file}`),
    '',
    `execute writes test files, and reverts whatever the agent should not have touched. It cannot`,
    `tell its own writes from yours: a file that was already modified when the run started is`,
    `indistinguishable from one the agent edited, and reverting it would destroy your work — there`,
    `is no reflog and no stash behind \`git checkout --\`.`,
    '',
    `Commit or stash first, then run redbar execute again.`,
  ].join('\n')
}

/** One y/N question on the terminal. The consent decision is a human's, never the agent's. */
function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(/^y(es)?$/i.test(answer.trim()))
    })
  })
}

/**
 * Hand each gap to the agent, gate what it wrote, then MEASURE what changed.
 *
 * The one command in redbar that calls a language model. Everything it does with the answer is
 * mechanical: git says which files were touched, a regex says whether the test asserts anything,
 * the runner says whether it passes, and a fresh coverage report says whether the gap is closed.
 * The agent writes; redbar grades.
 */
async function runExecute(argv: string[]): Promise<void> {
  const { positional, flags } = parseArgs(argv, new Set(['agent', 'base', 'max', 'severity']))
  const root = positional[0] ?? '.'

  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

  // before anything else: nothing below this line is safe on a tree redbar did not start clean.
  const dirty = dirtyTreeError(git(['-c', 'core.quotePath=false', 'status', '--porcelain']))
  if (dirty) throw new Error(dirty)

  const onPath = (bin: string): boolean => {
    try {
      execFileSync('command', ['-v', bin], { cwd: root, stdio: 'ignore', shell: true })
      return true
    } catch {
      return false
    }
  }

  const requested = typeof flags.agent === 'string' ? flags.agent : null
  const agent = requested ? agentById(requested) : detectAgent(onPath)

  if (!agent) {
    throw new Error(
      requested
        ? `redbar: unknown agent "${requested}".`
        : `redbar: no coding agent found on PATH. Looked for: claude, codex, copilot, gemini, cursor-agent.\n` +
          `Install one, or name it with --agent <id>.`,
    )
  }

  const before = inspect(root, opts(flags))
  if (before.gaps.length === 0) {
    console.log('redbar: no gaps. Nothing for the agent to do.')
    return
  }

  // The band is the triage axis, so it is the filter. Default is `critical`; --severity widens.
  // Everything below the chosen band never reaches the agent — that is what settles "don't fix
  // everything" and keeps low/medium (and the mocks that rank there) out of the worklist.
  const threshold = parseSeverityThreshold(typeof flags.severity === 'string' ? flags.severity : undefined)
  const inBand =
    threshold === 'all' ? ranked(before.gaps) : ranked(before.gaps).filter((g) => meetsSeverity(g, threshold))

  if (inBand.length === 0) {
    console.log(
      `redbar: no gaps at or above "${threshold}". ${before.gaps.length} gap(s) exist below it — ` +
        `widen with --severity high (or --severity all), or run redbar inspect to see them.`,
    )
    return
  }

  // --max survives as an orthogonal cap: it refines WITHIN the band ("the top 3 criticals"), it
  // never widens it.
  let max = inBand.length
  if (typeof flags.max === 'string') {
    max = Number(flags.max)
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(`redbar: --max must be a positive integer, got "${flags.max}"`)
    }
  }
  const gaps = inBand.slice(0, max)

  // Authorization: show the plan and its measured why, then get consent BEFORE the agent edits the
  // tree. print-the-plan-and-stop is the law the tool already lives by (mcp-config, init).
  process.stderr.write(`redbar: agent ${agent.id}\n\n`)
  process.stderr.write(`${renderExecutePlan(gaps)}\n\n`)

  const decision = authorizationOutcome({
    yes: flags.yes === true,
    isTTY: Boolean(process.stdout.isTTY),
  })
  if (decision === 'stop') {
    process.stderr.write(
      `redbar: not a terminal and no --yes — stopping without touching anything. ` +
        `Re-run with --yes to let the agent proceed.\n`,
    )
    return
  }
  if (
    decision === 'ask' &&
    !(await confirm(`Proceed — hand these ${gaps.length} gap(s) to ${agent.id}? [y/N] `))
  ) {
    process.stderr.write('redbar: aborted. Nothing was touched.\n')
    return
  }

  const read = (file: string): string | null => {
    const p = join(root, file)
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  }

  const effects: Effects = {
    // 10 minutes: a real agent writing a real e2e test against a real convention is not fast, and
    // killing it at 60s produces a needs-human that means nothing but "we were impatient"
    runAgent: (prompt) =>
      execFileSync(agent.bin, agent.args(prompt), {
        cwd: root,
        encoding: 'utf8',
        timeout: 600_000,
        maxBuffer: 64 * 1024 * 1024,
      }),

    // git, not the agent's word. An agent that says "I wrote calc.test.ts" and wrote nothing is
    // indistinguishable, from its own output, from one that did.
    changedFiles: () =>
      git(['-c', 'core.quotePath=false', 'status', '--porcelain'])
        .split('\n')
        .map((line) => {
          const path = line.slice(3).trim()
          // a porcelain rename reads "old -> new"; the new path is the one that exists on disk
          const arrow = path.indexOf(' -> ')
          return arrow >= 0 ? path.slice(arrow + 4) : path
        })
        .filter(Boolean),

    readFile: read,

    deleteFile: (file) => rmSync(join(root, file), { force: true }),

    // an untracked file has nothing to check out — removing it IS the revert
    revertFile: (file) => {
      try {
        git(['checkout', '--', file])
      } catch {
        rmSync(join(root, file), { force: true })
      }
    },

    // ONE test file, not the suite. Running everything would let an unrelated pre-existing failure
    // condemn a test the agent got right, and would take minutes per gap instead of seconds.
    runTest: (testFile) => {
      try {
        execFileSync('sh', ['-c', `${testRunCommand(before.runner.name)} ${testFile}`], {
          cwd: root,
          stdio: 'ignore',
          timeout: 300_000,
        })
        return true
      } catch {
        return false
      }
    },

    onVerdict: (a, i, total) =>
      process.stderr.write(
        `  [${String(i + 1).padStart(2)}/${total}] ${a.verdict.padEnd(15)} ${a.symbol ?? a.file}\n`,
      ),
  }

  const attempts = executeGaps(gaps, before.language, readConventions(root, before.language), effects, read)

  // THE SECOND MEASUREMENT. Everything above was the agent working; this is redbar checking.
  //
  // The report is deleted first, and that is not housekeeping. ensureCoverage only runs the
  // coverage command when the report is ABSENT — with the old one still on disk, `run: true`
  // reads it straight back, every line reads as uncovered exactly as before, and every gap the
  // agent genuinely closed is reported `open`. Deleting it is what makes this a measurement.
  process.stderr.write(`\nredbar: re-measuring — ${before.runner.coverageCommand}\n`)
  rmSync(join(root, before.runner.reportPath), { force: true })
  const after = inspect(root, { ...opts(flags), run: true })

  const outcomes = reconcile(gaps, after.gaps, attempts)
  const repo = basename(resolve(root))

  const md = renderOutcomeMarkdown(after, outcomes, agent.id)
  const html = renderOutcomeHtml(after, outcomes, agent.id, repo)

  // Its own kept run: the OUTCOME, plus the POST-FIX gap snapshot. That snapshot is what makes the
  // work visible over time — `compare` reads it and reports which gaps the agent actually closed.
  const now = new Date()
  const runDir = newRunDir(root, now)
  writeFileSync(join(runDir, 'OUTCOME.md'), md)
  writeFileSync(join(runDir, 'OUTCOME.html'), html)
  writeFileSync(join(runDir, 'gaps.json'), renderJson(after))
  writeFileSync(
    join(runDir, 'summary.json'),
    `${JSON.stringify(summarize(after.base, after.gaps, now), null, 2)}\n`,
  )
  const printed = htmlToPdf(html, resolve(join(runDir, 'OUTCOME.pdf')))
  updateLatest(root, runDir)

  console.log(md)
  process.stderr.write(`\nredbar: ${join(runDir, 'OUTCOME.md')} — what happened, for the repo\n`)
  process.stderr.write(`redbar: ${join(runDir, 'OUTCOME.html')} — the same, for you\n`)
  if (printed) process.stderr.write(`redbar: ${join(runDir, 'OUTCOME.pdf')} — the same, for whoever asks\n`)
}

/**
 * How to run ONE test file, per runner. Registry-shaped; move it into languages.ts if it grows.
 *
 * ponytail: the JVM entries take a class name where the others take a path, so maven and gradle
 * only work when the test file's basename IS the class. Fix when a JVM repo actually runs execute.
 */
function testRunCommand(runner: string): string {
  const commands: Record<string, string> = {
    vitest: 'npx vitest run',
    jest: 'npx jest',
    pytest: 'python -m pytest',
    phpunit: 'vendor/bin/phpunit',
    'cargo-llvm-cov': 'cargo test',
    maven: 'mvn -q test -Dtest=',
    gradle: './gradlew test --tests',
    'go-test': 'go test',
  }
  return commands[runner] ?? 'npm test --'
}

/** The audit. `redbar explain Checkout` — where every number in that row came from. */
function runExplain(argv: string[]): void {
  const { positional, flags } = parseArgs(argv, new Set(['path', 'base']))
  const root = typeof flags.path === 'string' ? flags.path : '.'
  const query = positional[0] ?? ''

  const inspection = inspect(root, opts(flags))
  const matched = matchGaps(inspection.gaps, query)

  if (matched.length === 0) {
    // an empty result is an answer, not a failure — and inventing a near miss would be the one
    // thing this command exists to prevent
    console.log(
      query
        ? `redbar: no gap matches "${query}". Run \`redbar inspect\` to see the ${inspection.gaps.length} that exist.`
        : 'redbar: no gaps. Nothing to explain.',
    )
    return
  }

  console.log(matched.map((gap) => explain(inspection, gap)).join('\n\n───\n\n'))
}

/** Match a run folder by exact name or by date prefix (`2026-07-22` → that day's latest run). Pure. */
export function resolveRun(runs: string[], arg: string): string {
  if (runs.includes(arg)) return arg
  const matches = runs.filter((name) => name.startsWith(arg))
  if (matches.length === 0) {
    throw new Error(`redbar: no run matches "${arg}". Runs: ${runs.join(', ') || '(none)'}`)
  }
  return matches[matches.length - 1]! // the latest run on that day
}

/**
 * `redbar compare` — the progress report. A pure set diff of two kept runs: what got covered, what
 * is new, the per-band delta. No model, no clock — it reads two gaps.json and subtracts, which is
 * the property that lets a developer put the trend in front of a boss.
 */
function runCompare(argv: string[]): void {
  const { positional } = parseArgs(argv, new Set())
  const root = '.'
  const runsDir = join(root, '.redbar', 'runs')

  if (!existsSync(runsDir)) {
    throw new Error('redbar: no runs yet. Run `redbar briefing` first — compare diffs two kept runs.')
  }
  const runs = readdirSync(runsDir)
    .filter((name) => statSync(join(runsDir, name)).isDirectory())
    .sort()

  let from: string
  let to: string
  if (positional.length >= 2) {
    from = resolveRun(runs, positional[0]!)
    to = resolveRun(runs, positional[1]!)
  } else {
    if (runs.length < 2) {
      throw new Error('redbar: need two runs to compare — run redbar briefing again after some work.')
    }
    from = runs[runs.length - 2]!
    to = runs[runs.length - 1]!
  }

  const gapsOf = (run: string): Gap[] => {
    const file = join(runsDir, run, 'gaps.json')
    if (!existsSync(file)) throw new Error(`redbar: ${run} has no gaps.json — nothing to compare.`)
    return (JSON.parse(readFileSync(file, 'utf8')) as { gaps: Gap[] }).gaps
  }

  const diff = compareRuns(gapsOf(from), gapsOf(to))
  console.log(renderTrendText(diff, from, to))

  const html = renderTrendHtml(diff, from, to)
  writeFileSync(join(runsDir, '..', 'TREND.html'), html)
  const printed = htmlToPdf(html, resolve(join(runsDir, '..', 'TREND.pdf')))
  if (printed) {
    process.stderr.write(`\nredbar: ${join(root, '.redbar', 'TREND.pdf')} — the trend, for whoever asks\n`)
  }
}

/** The MCP server. The engine, exposed to whatever agent the developer already uses. */
function runMcp(argv: string[]): void {
  const { positional } = parseArgs(argv, new Set())
  const defaultRoot = positional[0] ?? '.'

  const rootOf = (args: ToolArgs) => (typeof args.path === 'string' ? args.path : defaultRoot)

  const inspectFor = (args: ToolArgs): Inspection => {
    const root = rootOf(args)
    const base = typeof args.base === 'string' ? args.base : undefined
    const inspection = inspect(root, { ...(args.all === true ? { all: true } : {}), ...(base ? { base } : {}) })

    // The developer who just connected redbar is standing on the base branch, where the diff is
    // empty. Answering "0 gaps" to someone with 400 untested functions is a true statement and a
    // useless one — they asked what to test, not what they changed. Fall back to the whole repo,
    // and the base field in the output says which question was answered.
    if (inspection.gaps.length === 0 && args.all !== false) {
      return inspect(root, { all: true })
    }
    return inspection
  }

  const tools: ToolBox = {
    // as tools também PERSISTEM no projeto analisado. Quem instalou o MCP no projeto espera os
    // artefatos no projeto — um texto que só existe no chat do agente morre com a conversa.
    redbar_inspect: (args) => {
      const root = rootOf(args)
      const inspection = inspectFor(args)
      mkdirSync(join(root, '.redbar'), { recursive: true })
      writeFileSync(join(root, '.redbar', 'gaps.json'), renderJson(inspection))
      return renderText(inspection)
    },
    redbar_briefing: (args) => {
      const root = rootOf(args)
      const doc = briefingFor(root, inspectFor(args))
      mkdirSync(join(root, '.redbar'), { recursive: true })
      writeFileSync(join(root, '.redbar', 'TESTING.md'), doc)

      // o ARQUIVO leva tudo; o fio, não. Um repo real devolveu 520k chars — briefing de 969 gaps
      // com as conventions inteiras — o que afoga o contexto de qualquer agente. Corte explícito,
      // nunca silencioso: a nota diz o que ficou de fora e onde está o inteiro.
      const MAX = 60_000
      if (doc.length <= MAX) return doc
      return (
        doc.slice(0, MAX) +
        `\n\n---\n\n[cortado pelo MCP: ${doc.length - MAX} caracteres omitidos. ` +
        `O documento completo está em .redbar/TESTING.md — leia de lá.]`
      )
    },
    redbar_explain: (args) => {
      const inspection = inspectFor(args)
      const query = typeof args.symbol === 'string' ? args.symbol : ''
      const matched = matchGaps(inspection.gaps, query)

      if (matched.length === 0) return `redbar: no gap matches "${query}".`
      return matched.map((gap) => explain(inspection, gap)).join('\n\n───\n\n')
    },
  }

  serve(tools)
}

/**
 * The fix for issue #13. Prints the paste-ready MCP registration for a client — or every client.
 * redbar writes nothing: it prints the command, the owner runs it (rule 6), and running it IS the
 * authorization.
 *
 * Default launch is `npx -y redbar mcp` — portable, no clone, no path, the install a real user
 * gets once redbar is on npm. `--local` emits the absolute-path launch (absolute node + absolute
 * cli.js) for a contributor running from a clone before publish; the absolute cli.js is resolved
 * through the npm-link symlink, the same realpathSync the isMain guard needs and for the same
 * reason (`npm link` leaves process.argv[1] as the symlink; the host needs the real file).
 */
function runMcpConfig(argv: string[]): void {
  const { positional, flags } = parseArgs(argv, new Set())
  const local = flags.local === true
  const l = local
    ? launch(realpathSync(process.argv[1] ?? fileURLToPath(import.meta.url)), process.execPath)
    : npxLaunch

  const requested = positional[0]
  const selected = requested ? [clientById(requested)].filter(Boolean) : CLIENTS
  if (requested && selected.length === 0) {
    throw new Error(
      `redbar: unknown client "${requested}". Known: ${CLIENTS.map((c) => c.id).join(', ')}`,
    )
  }

  for (const client of selected as typeof CLIENTS) {
    console.log(`# ${client.label}`)
    console.log(client.render(l))
    console.log('')
  }

  // the guided hand-off: what the owner and the agent do next. This is what turns "configure
  // redbar" into an end-to-end flow — register, then measure, then write the tests it found.
  process.stderr.write(
    [
      'redbar: next, in order —',
      '  1. the owner (or the agent) runs the line above — that connects the MCP',
      '  2. ask the agent to use redbar: it calls redbar_briefing, which scans the code and',
      '     writes .redbar/TESTING.md — the ranked list of what to test, per layer',
      '  3. the agent writes those tests top to bottom, following each layer\'s standard',
      local
        ? '\nredbar: (--local) absolute-path launch, for a clone before publish. Drop --local once\n' +
          'redbar: redbar is on npm — then the line is `npx -y redbar mcp`, portable and path-free.'
        : '',
      '',
    ].join('\n'),
  )
}

function runInit(argv: string[]): void {
  const { positional } = parseArgs(argv, new Set())
  const root = positional[0] ?? '.'

  const language = detect(root)
  const runner = selectRunner(root, language)
  const manifest = readManifest(root, language)

  // unit libs come from the RUNNER, not the language: a jest project told to install vitest
  // would follow the advice and break its own setup. integration and e2e are language-wide.
  const allLibs = [
    ...runner.unitLibs,
    ...language.testLibs.integration,
    ...language.testLibs.e2e,
  ]
  const missing = [...new Set(allLibs)].filter((lib) => !manifest.includes(lib))

  console.log(`language: ${language.name}`)
  console.log(`runner:   ${runner.name}`)
  console.log(`coverage: ${runner.coverageCommand}`)

  if (missing.length === 0) {
    console.log('missing:  none')
  } else {
    console.log(`missing:  ${missing.join(', ')}`)
    console.log(language.installCommand(missing))
  }
}

function runCi(argv: string[]): number {
  const { positional, flags } = parseArgs(
    argv,
    new Set(['base', 'max-critical', 'max-high', 'md']),
  )
  const root = positional[0] ?? '.'
  const base = typeof flags.base === 'string' ? flags.base : undefined
  const maxCritical = typeof flags['max-critical'] === 'string' ? Number(flags['max-critical']) : 0
  const maxHigh = typeof flags['max-high'] === 'string' ? Number(flags['max-high']) : Infinity

  const inspection = inspect(root, base ? { base } : {})
  const limits = { maxCritical, maxHigh }
  const { failed, counts } = gateResult(inspection.gaps, limits)

  // written before the exit code is returned: a failing gate is exactly when the reviewer most
  // needs to read why, so the comment must exist even on the run that turns the PR red
  if (typeof flags.md === 'string') {
    writeFileSync(flags.md, renderMarkdown(inspection, limits))
  }

  console.log(`redbar ci — ${inspection.gaps.length} gaps`)
  console.log(`  critical: ${counts.critical}  (max ${maxCritical})`)
  console.log(`  high:     ${counts.high}  (max ${maxHigh === Infinity ? '∞' : maxHigh})`)
  console.log(`  medium:   ${counts.medium}`)
  console.log(`  low:      ${counts.low}`)
  console.log(failed ? 'FAIL' : 'PASS')

  return failed ? 1 : 0
}

// npm tem `npm i`, cargo tem `cargo b`: comando de todo dia merece uma letra. `why` no lugar de
// uma letra pro explain porque `redbar why buscarPorTermos` se lê sozinho.
const ALIASES: Record<string, string> = { i: 'inspect', b: 'briefing', x: 'execute', why: 'explain' }

export function canonical(command: string): string {
  return ALIASES[command] ?? command
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const command = argv[0] && canonical(argv[0])

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP)
    return
  }
  if (command === '--version' || command === '-v') {
    console.log(readVersion())
    return
  }

  try {
    switch (command) {
      case 'briefing':
        runBriefing(argv.slice(1))
        break
      case 'execute':
        await runExecute(argv.slice(1))
        break
      case 'explain':
        runExplain(argv.slice(1))
        break
      case 'compare':
        runCompare(argv.slice(1))
        break
      case 'mcp':
        runMcp(argv.slice(1))
        break
      case 'mcp-config':
        runMcpConfig(argv.slice(1))
        break
      case 'inspect':
        runInspect(argv.slice(1))
        break
      case 'init':
        runInit(argv.slice(1))
        break
      case 'ci':
        process.exitCode = runCi(argv.slice(1))
        break
      default:
        console.error(`redbar: unknown command "${command}"\n`)
        console.log(HELP)
        process.exitCode = 1
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}

// only run when executed directly (`redbar`, `node dist/cli.js`) — not when imported by tests.
// realpathSync matters: `npm link` installs the binary as a symlink, and Node resolves it to
// the real file for import.meta.url but leaves process.argv[1] as the symlinked path — comparing
// the raw paths never matches and the CLI silently does nothing.
const isMain =
  process.argv[1] != null && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
if (isMain) main()
