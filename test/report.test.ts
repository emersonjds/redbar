import { describe, expect, it } from 'vitest'
import { byId } from '../src/languages.js'
import type { Inspection } from '../src/engine.js'
import { MARKER, renderHtml, renderJson, renderMarkdown, renderText } from '../src/report.js'
import { severity } from '../src/severity.js'
import type { Gap } from '../src/types.js'

const language = byId('ts')!
const runner = language.runners[0]!

const gap = (overrides: Partial<Gap>): Gap => ({
  file: 'src/foo.ts',
  symbol: 'foo',
  lines: [1, 2, 3],
  fullyUncovered: true,
  branches: 6,
  kind: 'unit',
  score: 100,
  ...overrides,
})

function inspection(gaps: Gap[]): Inspection {
  return { language, runner, base: 'origin/master', gaps }
}

describe('renderJson', () => {
  it('includes language id, runner name, base and the report path', () => {
    const parsed = JSON.parse(renderJson(inspection([])))
    expect(parsed).toMatchObject({
      language: 'ts',
      runner: runner.name,
      base: 'origin/master',
      generatedFrom: { reportPath: runner.reportPath },
      gaps: [],
    })
  })

  it('stamps every gap with its severity, matching severity()', () => {
    const gaps = [
      gap({ file: 'a.ts', branches: 6, fullyUncovered: true }),
      gap({ file: 'b.ts', branches: 0, fullyUncovered: false }),
    ]
    const parsed = JSON.parse(renderJson(inspection(gaps))) as {
      gaps: Array<Gap & { severity: string }>
    }

    for (const g of parsed.gaps) {
      const original = gaps.find((o) => o.file === g.file)!
      expect(g.severity).toBe(severity(original))
    }
  })
})

describe('renderText', () => {
  it('prints the header and one line per gap', () => {
    const text = renderText(inspection([gap({ symbol: 'divide', score: 42 })]))
    const lines = text.split('\n')

    expect(lines[0]).toBe(`language: ${language.name}`)
    expect(lines[1]).toBe(`runner:   ${runner.name}`)
    expect(lines[2]).toBe('base:     origin/master')
    expect(lines[3]).toBe('gaps:     1')
    expect(lines[4]).toBe('')
    expect(lines[5]).toContain('divide')
    expect(lines[5]).toContain('src/foo.ts:1')
    expect(lines[5]!.startsWith('!')).toBe(true)
  })

  it('marks a partly-covered gap without the "!" flag', () => {
    const text = renderText(inspection([gap({ fullyUncovered: false })]))
    expect(text.split('\n')[5]!.startsWith(' ')).toBe(true)
  })

  it('falls back to "(no symbol)" when the symbol could not be attributed', () => {
    const text = renderText(inspection([gap({ symbol: null })]))
    expect(text).toContain('(no symbol)')
  })

  it('respects the top limit', () => {
    const gaps = Array.from({ length: 5 }, (_, i) => gap({ file: `f${i}.ts` }))
    const text = renderText(inspection(gaps), 2)
    expect(text.split('\n')).toHaveLength(5 + 2) // 4 header lines + blank + 2 gap lines
  })
})

describe('renderMarkdown', () => {
  it('opens with the marker, so the action updates its comment instead of stacking one per push', () => {
    expect(renderMarkdown(inspection([])).startsWith(MARKER)).toBe(true)
  })

  it('names the symbol, the file with its line, the kind and the band', () => {
    const md = renderMarkdown(inspection([gap({ symbol: 'divide', file: 'src/math.ts' })]))

    expect(md).toContain('divide')
    expect(md).toContain('src/math.ts:1')
    expect(md).toContain('unit')
    expect(md).toContain('critical') // fullyUncovered + 6 branches
  })

  it('says so plainly when the branch left nothing untested, and renders no table', () => {
    const md = renderMarkdown(inspection([]))

    expect(md).toContain('No gaps')
    expect(md).not.toContain('| criticality')
  })

  it('states the verdict against the gate limits it was given', () => {
    const critical = inspection([gap({ fullyUncovered: true, branches: 6 })])

    expect(renderMarkdown(critical, { maxCritical: 0, maxHigh: Infinity })).toContain('**FAIL**')
    expect(renderMarkdown(critical, { maxCritical: 1, maxHigh: Infinity })).toContain('**PASS**')
  })

  it('omits the verdict entirely when no limits are given — inspect is not a gate', () => {
    const md = renderMarkdown(inspection([gap({})]))
    expect(md).not.toContain('FAIL')
    expect(md).not.toContain('PASS')
  })

  it('ranks by band first, so a critical row never sits below a medium one', () => {
    const md = renderMarkdown(
      inspection([
        gap({ symbol: 'mild', fullyUncovered: false, branches: 6, score: 9999 }), // medium
        gap({ symbol: 'nasty', fullyUncovered: true, branches: 6, score: 1 }), // critical
      ]),
    )
    expect(md.indexOf('nasty')).toBeLessThan(md.indexOf('mild'))
  })

  it('never truncates silently — it says how many rows it left out', () => {
    const gaps = Array.from({ length: 12 }, (_, i) => gap({ symbol: `s${i}` }))
    const md = renderMarkdown(gaps.length ? inspection(gaps) : inspection([]), undefined, 10)

    expect(md).toContain('s9')
    expect(md).not.toContain('s10')
    expect(md).toContain('top 10 of 12')
  })

  it('escapes pipes so a symbol name cannot break the table', () => {
    const md = renderMarkdown(inspection([gap({ symbol: 'a || b' })]))
    expect(md).toContain('a \\|\\| b')
  })

  it('carries the provenance of the number, because that is the whole claim', () => {
    const md = renderMarkdown(inspection([gap({})]))

    expect(md).toContain(runner.reportPath)
    expect(md).toContain('origin/master')
    expect(md).toContain('No language model')
  })
})

describe('renderHtml', () => {
  it('is self-contained HTML that names the repo, the gap symbol and severity counts', () => {
    const html = renderHtml(inspection([gap({ symbol: 'divide' })]), 'my-repo', 'library')

    expect(html).toContain('my-repo')
    expect(html).toContain('divide')
    expect(html).toContain('<table>')
    // one critical gap (fullyUncovered, 6 branches) — the stat tile must reflect it
    expect(html).toMatch(/sev-critical">\s*<div class="n">1<\/div>/)
  })

  it('escapes HTML-significant characters in file paths and symbols', () => {
    const html = renderHtml(
      inspection([gap({ symbol: '<script>', file: 'a&b.ts' })]),
      'repo',
      'library',
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('carries the measured why per gap in an expandable block — the same facts as explain', async () => {
    const { bandReason, scoreArithmetic } = await import('../src/explain.js')
    const g = gap({ symbol: 'divide', fullyUncovered: true, branches: 6 })
    const html = renderHtml(inspection([g]), 'repo', 'library')

    expect(html).toContain('<details class="why">')
    expect(html).toContain(scoreArithmetic(g)) // the arithmetic, verbatim
    expect(html).toContain(bandReason(g).trim()) // the measured reason, verbatim
  })
})

describe('renderHtml — the profile lens', () => {
  const gaps = [
    gap({ symbol: 'Checkout', kind: 'e2e' }),
    gap({ symbol: 'fmt', kind: 'unit' }),
  ]

  it('names the profile in a Focus block for a frontend', () => {
    const html = renderHtml(inspection(gaps), 'shop', 'frontend')
    expect(html).toMatch(/Focus for this project/i)
    expect(html).toMatch(/frontend/i)
  })

  it('omits the Focus block for a library', () => {
    const html = renderHtml(inspection(gaps), 'lib', 'library')
    expect(html).not.toMatch(/Focus for this project/i)
  })

  it('still renders the ranked table regardless of profile', () => {
    const html = renderHtml(inspection(gaps), 'shop', 'backend')
    expect(html).toContain('<table>')
    expect(html).toContain('Checkout')
  })
})
