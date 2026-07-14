import { describe, expect, it } from 'vitest'
import type { Inspection } from '../src/engine.js'
import { byId } from '../src/languages.js'
import type { Outcome } from '../src/outcome.js'
import { renderOutcomeHtml, renderOutcomeMarkdown } from '../src/report.js'
import type { Gap } from '../src/types.js'

const language = byId('ts')!
const runner = language.runners[0]!
const inspection: Inspection = { language, runner, base: 'origin/main', gaps: [] }

const gap = (symbol: string, over: Partial<Gap> = {}): Gap => ({
  file: 'src/calc.ts',
  symbol,
  lines: [10, 11],
  fullyUncovered: true,
  branches: 6,
  kind: 'unit',
  score: 100,
  ...over,
})

const outcomes: Outcome[] = [
  { gap: gap('divide'), verdict: 'closed', testFile: 'src/calc.test.ts' },
  { gap: gap('theatre'), verdict: 'no-assertion' },
  { gap: gap('meddler'), verdict: 'touched-source', note: 'reverted: src/calc.ts' },
  { gap: gap('hard'), verdict: 'needs-human', note: 'needs a live database' },
  { gap: gap('untried'), verdict: 'open' },
]

describe('renderOutcomeMarkdown', () => {
  it('leads with the counts, so the reader knows the answer before the detail', () => {
    const md = renderOutcomeMarkdown(inspection, outcomes, 'claude')

    expect(md).toMatch(/1 closed/i)
    expect(md).toMatch(/claude/)
  })

  it('separates what was measured from what the agent said', () => {
    const md = renderOutcomeMarkdown(inspection, outcomes, 'claude')
    const measured = md.indexOf('Measured')
    const claimed = md.indexOf('What the agent says')

    expect(measured).toBeGreaterThan(-1)
    expect(claimed).toBeGreaterThan(measured)
    // the closed row is a measurement and must sit above the line
    expect(md.indexOf('divide')).toBeLessThan(claimed)
    // needs-human is the agent talking and must sit below it
    expect(md.indexOf('live database')).toBeGreaterThan(claimed)
  })

  it('says WHY each gap ended where it did', () => {
    const md = renderOutcomeMarkdown(inspection, outcomes, 'claude')

    expect(md).toMatch(/asserted nothing/i) // no-assertion
    expect(md).toMatch(/reverted/i) // touched-source
    expect(md).toContain('src/calc.test.ts') // closed → the file that now covers it
  })

  it('states plainly that closed is a measurement and not the agent word', () => {
    expect(renderOutcomeMarkdown(inspection, outcomes, 'claude')).toMatch(/No language model/i)
  })

  it('orders by criticality, worst first', () => {
    const md = renderOutcomeMarkdown(
      inspection,
      [
        { gap: gap('mild', { fullyUncovered: false, branches: 0 }), verdict: 'open' },
        { gap: gap('nasty', { file: 'src/x.ts' }), verdict: 'open' },
      ],
      'claude',
    )
    expect(md.indexOf('nasty')).toBeLessThan(md.indexOf('mild'))
  })
})

describe('renderOutcomeHtml', () => {
  it('is self-contained html carrying the same counts', () => {
    const html = renderOutcomeHtml(inspection, outcomes, 'claude', 'my-repo')

    expect(html).toContain('my-repo')
    expect(html).toContain('<table>')
    expect(html).toContain('divide')
  })

  it('escapes html-significant characters in a symbol name', () => {
    const html = renderOutcomeHtml(
      inspection,
      [{ gap: gap('<script>'), verdict: 'open' }],
      'claude',
      'repo',
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
