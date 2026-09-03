import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAudit, runBriefing, runInspect } from '../src/cli.js'

// The PDF path shells out to a real browser (src/pdf.ts) — mocked so the suite never launches
// Chrome. Vitest resolves module mocks by path, so this intercepts the same module cli.ts imports.
vi.mock('../src/pdf.js', () => ({ htmlToPdf: vi.fn() }))
import { htmlToPdf } from '../src/pdf.js'

const htmlToPdfMock = vi.mocked(htmlToPdf)

// sub()'s body (line 6) is the one line DA:6,0 marks uncovered — a partial gap.
const MATH_SRC = `export function add(a: number, b: number): number {
  return a + b
}

export function sub(a: number, b: number): number {
  return a - b
}
`

const MATH_TEST = `import { describe, expect, it } from 'vitest'
import { add } from '../src/math.js'

describe('add', () => {
  it('adds numbers', () => {
    expect(add(1, 1)).toBe(2)
  })
})
`

// absent from lcov.info entirely — the biggest gap gap.ts recognises: a file no test imports.
const EXTRA_SRC = `export function mul(a: number, b: number): number {
  return a * b
}
`

const LCOV = `TN:
SF:src/math.ts
FN:1,add
FNDA:1,add
FN:5,sub
FNDA:0,sub
DA:1,1
DA:2,1
DA:3,1
DA:5,1
DA:6,0
DA:7,1
LF:6
LH:5
end_of_record
`

/**
 * A real fixture repository, never git — every function under test here reaches `inspect` with
 * `--all`, which never shells to git at all. `src/math.ts` carries one partial gap (sub, line 6)
 * and `src/extra.ts` carries one fully-uncovered gap (mul) — two gaps of different severities, so
 * the terminal mark, the html rows and the --top cut all have something real to divide.
 */
function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'redbar-cli-inspect-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true, devDependencies: { vitest: '^1.0.0' } }),
  )
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'math.ts'), MATH_SRC)
  writeFileSync(join(root, 'src', 'extra.ts'), EXTRA_SRC)
  mkdirSync(join(root, 'test'), { recursive: true })
  writeFileSync(join(root, 'test', 'math.test.ts'), MATH_TEST)
  mkdirSync(join(root, 'coverage'), { recursive: true })
  writeFileSync(join(root, 'coverage', 'lcov.info'), LCOV)
  return root
}

let root: string
let logSpy: ReturnType<typeof vi.spyOn>
let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  root = makeRepo()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  htmlToPdfMock.mockReset().mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runInspect', () => {
  it('prints the terminal report and writes every gap to .redbar/gaps.json', () => {
    runInspect([root, '--all'])

    expect(logSpy).toHaveBeenCalledTimes(1)
    const printed = logSpy.mock.calls[0]![0] as string
    expect(printed).toContain('gaps:     2')
    expect(printed).toContain('src/math.ts')
    expect(printed).toContain('src/extra.ts')

    const gapsPath = join(root, '.redbar', 'gaps.json')
    expect(existsSync(gapsPath)).toBe(true)
    const written = JSON.parse(readFileSync(gapsPath, 'utf8')) as { gaps: Array<{ file: string }> }
    expect(written.gaps.map((g) => g.file).sort()).toEqual(['src/extra.ts', 'src/math.ts'])
  })

  it('prints JSON instead of the terminal report when --json is passed', () => {
    runInspect([root, '--all', '--json'])

    const printed = logSpy.mock.calls[0]![0] as string
    const parsed = JSON.parse(printed) as { language: string; gaps: unknown[] }
    expect(parsed.language).toBe('ts')
    expect(parsed.gaps).toHaveLength(2)
  })

  it('limits the terminal listing to --top without changing the reported total', () => {
    runInspect([root, '--all', '--top', '1'])

    const printed = logSpy.mock.calls[0]![0] as string
    expect(printed).toContain('gaps:     2') // the count is unaffected by the cut
    const rows = printed.split('\n').filter((line) => /^\s*[! ]\s*\[/.test(line))
    expect(rows).toHaveLength(1)
  })

  it('writes the html report to --html, with both gaps in the table', () => {
    const htmlPath = join(root, 'report.html')

    runInspect([root, '--all', '--html', htmlPath])

    expect(existsSync(htmlPath)).toBe(true)
    const html = readFileSync(htmlPath, 'utf8')
    expect(html).toContain('src/math.ts')
    expect(html).toContain('src/extra.ts')
  })

  it('writes the markdown report to --md', () => {
    const mdPath = join(root, 'report.md')

    runInspect([root, '--all', '--md', mdPath])

    expect(existsSync(mdPath)).toBe(true)
    const md = readFileSync(mdPath, 'utf8')
    expect(md).toContain('<!-- redbar -->')
    expect(md).toContain('gap(s) in what this branch changed')
  })

  it('writes gaps.json under a custom --out directory instead of .redbar', () => {
    runInspect([root, '--all', '--out', 'custom-out'])

    expect(existsSync(join(root, 'custom-out', 'gaps.json'))).toBe(true)
    expect(existsSync(join(root, '.redbar', 'gaps.json'))).toBe(false)
  })
})

describe('runAudit', () => {
  it('prints the terminal scorecard with the measured categories', () => {
    runAudit([root])

    expect(logSpy).toHaveBeenCalledTimes(1)
    const printed = logSpy.mock.calls[0]![0] as string
    expect(printed).toContain('redbar audit')
    expect(printed).toContain('Setup')
    expect(printed).toContain('Coverage')
  })

  it('runs with --no-run without shelling out to a coverage command that would overwrite the report', () => {
    runAudit([root, '--no-run'])

    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy.mock.calls[0]![0] as string).toContain('redbar audit')
  })

  it('writes the html scorecard to --html', () => {
    const htmlPath = join(root, 'audit.html')

    runAudit([root, '--html', htmlPath])

    expect(existsSync(htmlPath)).toBe(true)
    expect(readFileSync(htmlPath, 'utf8')).toContain('redbar audit')
  })

  it('writes the markdown scorecard to --md', () => {
    const mdPath = join(root, 'audit.md')

    runAudit([root, '--md', mdPath])

    expect(existsSync(mdPath)).toBe(true)
    expect(readFileSync(mdPath, 'utf8')).toContain('<!-- redbar-audit -->')
  })

  it('prints the pdf via the browser when one is found, and stays silent on stderr', () => {
    const pdfPath = join(root, 'audit.pdf')

    runAudit([root, '--pdf', pdfPath])

    expect(htmlToPdfMock).toHaveBeenCalledTimes(1)
    const [html, out] = htmlToPdfMock.mock.calls[0]!
    expect(html).toContain('redbar audit')
    expect(out).toBe(resolve(pdfPath))
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('warns on stderr, naming the file, when no browser is found', () => {
    htmlToPdfMock.mockReturnValue(false)
    const pdfPath = join(root, 'audit.pdf')

    runAudit([root, '--pdf', pdfPath])

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('no browser found'))
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining(pdfPath))
  })
})

describe('runBriefing', () => {
  it('prints the brief and keeps TESTING.md, REDBAR.html, gaps.json and summary.json in a dated run', () => {
    runBriefing([root, '--all'])

    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy.mock.calls[0]![0] as string).toContain('Testing brief —')

    const runsDir = join(root, '.redbar', 'runs')
    const runs = readdirSync(runsDir)
    expect(runs).toHaveLength(1)

    const runDir = join(runsDir, runs[0]!)
    expect(existsSync(join(runDir, 'TESTING.md'))).toBe(true)
    expect(existsSync(join(runDir, 'REDBAR.html'))).toBe(true)
    expect(existsSync(join(runDir, 'gaps.json'))).toBe(true)
    expect(existsSync(join(runDir, 'summary.json'))).toBe(true)
    expect(existsSync(join(root, '.redbar', 'latest'))).toBe(true)
  })

  it('pins the markdown at --out instead of the run directory', () => {
    const outPath = join(root, 'MY_TESTING.md')

    runBriefing([root, '--all', '--out', outPath])

    expect(existsSync(outPath)).toBe(true)
    expect(readFileSync(outPath, 'utf8')).toContain('Testing brief —')
  })

  it('writes the pdf at --pdf when given, instead of the run directory default', () => {
    const pdfPath = join(root, 'CUSTOM.pdf')

    runBriefing([root, '--all', '--pdf', pdfPath])

    expect(htmlToPdfMock).toHaveBeenCalledWith(expect.any(String), resolve(pdfPath))
  })

  it('reports the pdf path on stderr when the browser prints it', () => {
    runBriefing([root, '--all'])

    const messages = errSpy.mock.calls.map((c: unknown[]) => c[0])
    expect(
      messages.some(
        (m: unknown) => typeof m === 'string' && m.includes('the same numbers, for whoever asks for a PDF'),
      ),
    ).toBe(true)
  })

  it('falls back to the Cmd+P instructions on stderr when no browser is found', () => {
    htmlToPdfMock.mockReturnValue(false)

    runBriefing([root, '--all'])

    const messages = errSpy.mock.calls.map((c: unknown[]) => c[0])
    expect(
      messages.some((m: unknown) => typeof m === 'string' && m.includes('no Chrome/Chromium/Edge found')),
    ).toBe(true)
  })
})
