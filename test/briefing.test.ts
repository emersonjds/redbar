import { describe, expect, it } from 'vitest'
import { renderBriefing } from '../src/briefing.js'
import type { Inspection } from '../src/engine.js'
import { byId } from '../src/languages.js'
import type { Gap } from '../src/types.js'

const language = byId('ts')!
const runner = language.runners[0]!

const gap = (overrides: Partial<Gap> = {}): Gap => ({
  file: 'src/checkout.ts',
  symbol: 'Checkout',
  lines: [124, 125],
  fullyUncovered: true,
  branches: 28,
  kind: 'e2e',
  score: 116,
  ...overrides,
})

const inspection = (gaps: Gap[]): Inspection => ({
  language,
  runner,
  base: 'origin/main',
  gaps,
})

describe('renderBriefing', () => {
  it('carries the provenance of the list, so the agent reading it knows the list is measured', () => {
    const md = renderBriefing(inspection([gap()]), {}, 'my-repo')

    expect(md).toContain(runner.reportPath)
    expect(md).toContain('git diff origin/main')
    expect(md).toContain('No language model')
  })

  it('states the rules the agent must follow when writing the tests', () => {
    const md = renderBriefing(inspection([gap()]), {}, 'my-repo')

    expect(md).toContain('One test file per gap')
    expect(md).toMatch(/never weaken an assertion/i)
    expect(md).toMatch(/run/i)
  })

  it('gives one work item per gap, naming the symbol, the file, the line and the layer', () => {
    const md = renderBriefing(inspection([gap()]), {}, 'my-repo')

    expect(md).toContain('Checkout')
    expect(md).toContain('src/checkout.ts:124')
    expect(md).toContain('e2e')
  })

  it('orders the work by band — the agent works top to bottom, so the top must be the worst', () => {
    const md = renderBriefing(
      inspection([
        gap({ symbol: 'mild', fullyUncovered: false, branches: 6, score: 9999 }), // medium
        gap({ symbol: 'nasty', fullyUncovered: true, branches: 6, score: 1 }), // critical
      ]),
      {},
      'repo',
    )
    expect(md.indexOf('nasty')).toBeLessThan(md.indexOf('mild'))
  })

  it('shows the arithmetic behind each item, so no number in the document is unexplained', () => {
    const md = renderBriefing(inspection([gap()]), {}, 'my-repo')
    expect(md).toContain('2 × 2 × (1 + 28) = 116')
  })

  it('names the canonical standard for a layer even with no convention file for the language', () => {
    const md = renderBriefing(inspection([gap({ kind: 'e2e' })]), {}, 'my-repo')

    // this is what makes a language work on the day it enters the registry
    expect(md).toContain(language.standards.e2e.name)
    expect(md).toContain(language.standards.e2e.url)
  })

  it('inlines the full convention text when the project ships one for that layer', () => {
    const md = renderBriefing(
      inspection([gap({ kind: 'e2e' })]),
      { e2e: '## Use role-based locators\n\nNever a CSS selector.' },
      'my-repo',
    )
    expect(md).toContain('Never a CSS selector.')
  })

  it('only carries the standards for layers that actually have a gap', () => {
    const md = renderBriefing(
      inspection([gap({ kind: 'unit' })]),
      { unit: 'UNIT STANDARD TEXT', e2e: 'E2E STANDARD TEXT' },
      'my-repo',
    )

    expect(md).toContain('UNIT STANDARD TEXT')
    expect(md).not.toContain('E2E STANDARD TEXT')
  })

  it('says so plainly when there is no work, and emits no work section', () => {
    const md = renderBriefing(inspection([]), {}, 'my-repo')

    expect(md).toMatch(/no gaps/i)
    expect(md).not.toContain('## The work')
  })
})
