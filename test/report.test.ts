import { describe, expect, it } from 'vitest'
import { byId } from '../src/languages.js'
import type { Inspection } from '../src/engine.js'
import { renderHtml, renderJson, renderText } from '../src/report.js'
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

describe('renderHtml', () => {
  it('is self-contained HTML that names the repo, the gap symbol and severity counts', () => {
    const html = renderHtml(inspection([gap({ symbol: 'divide' })]), 'my-repo')

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
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
