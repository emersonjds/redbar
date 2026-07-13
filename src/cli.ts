#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { detect } from './detect.js'
import { inspect } from './engine.js'
import type { Language } from './languages.js'
import { renderHtml, renderJson, renderText } from './report.js'
import { selectRunner } from './runner.js'
import { severity, type Severity } from './severity.js'
import type { Gap } from './types.js'

const HELP = `redbar — test-coverage gaps in what changed, zero-LLM

Usage:
  redbar inspect [path] [--base <ref>] [--json] [--html <file>] [--out <dir>] [--top <n>]
  redbar init [path]
  redbar ci [path] [--max-critical <n>] [--max-high <n>] [--base <ref>]
  redbar --help
  redbar --version
`

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

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string
  }
  return pkg.version
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

// Duplicated from runner.ts's private readManifest: it is 5 lines and that file is off-limits
// to edit for this task, so a private export is not an option here.
function readManifest(root: string, language: Language): string {
  return language.markers
    .map((m) => join(root, m))
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n')
}

function runInspect(argv: string[]): void {
  const { positional, flags } = parseArgs(argv, new Set(['base', 'html', 'out', 'top']))
  const root = positional[0] ?? '.'
  const base = typeof flags.base === 'string' ? flags.base : undefined

  const inspection = inspect(root, base ? { base } : {})

  if (flags.json) {
    console.log(renderJson(inspection))
  } else {
    const top = typeof flags.top === 'string' ? Number(flags.top) : undefined
    console.log(renderText(inspection, top))
  }

  if (typeof flags.html === 'string') {
    writeFileSync(flags.html, renderHtml(inspection, basename(resolve(root))))
  }

  const outDir = typeof flags.out === 'string' ? flags.out : '.redbar'
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'gaps.json'), renderJson(inspection))
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
  const { positional, flags } = parseArgs(argv, new Set(['base', 'max-critical', 'max-high']))
  const root = positional[0] ?? '.'
  const base = typeof flags.base === 'string' ? flags.base : undefined
  const maxCritical = typeof flags['max-critical'] === 'string' ? Number(flags['max-critical']) : 0
  const maxHigh = typeof flags['max-high'] === 'string' ? Number(flags['max-high']) : Infinity

  const inspection = inspect(root, base ? { base } : {})
  const { failed, counts } = gateResult(inspection.gaps, { maxCritical, maxHigh })

  console.log(`redbar ci — ${inspection.gaps.length} gaps`)
  console.log(`  critical: ${counts.critical}  (max ${maxCritical})`)
  console.log(`  high:     ${counts.high}  (max ${maxHigh === Infinity ? '∞' : maxHigh})`)
  console.log(`  medium:   ${counts.medium}`)
  console.log(`  low:      ${counts.low}`)
  console.log(failed ? 'FAIL' : 'PASS')

  return failed ? 1 : 0
}

function main(): void {
  const argv = process.argv.slice(2)
  const command = argv[0]

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
