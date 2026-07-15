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
    const md = renderBriefing(inspection([gap()]), {}, 'my-repo', 'library', language.standards.e2e)

    expect(md).toContain(runner.reportPath)
    expect(md).toContain('git diff origin/main')
    expect(md).toContain('No language model')
  })

  it('states the rules the agent must follow when writing the tests', () => {
    const md = renderBriefing(inspection([gap()]), {}, 'my-repo', 'library', language.standards.e2e)

    expect(md).toContain('One test file per gap')
    expect(md).toMatch(/never weaken an assertion/i)
    expect(md).toMatch(/run/i)
  })

  it('gives one work item per gap, naming the symbol, the file, the line and the layer', () => {
    const md = renderBriefing(inspection([gap()]), {}, 'my-repo', 'library', language.standards.e2e)

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
      'library',
      language.standards.e2e,
    )
    expect(md.indexOf('nasty')).toBeLessThan(md.indexOf('mild'))
  })

  it('shows the arithmetic behind each item, so no number in the document is unexplained', () => {
    const md = renderBriefing(inspection([gap()]), {}, 'my-repo', 'library', language.standards.e2e)
    expect(md).toContain('2 × 2 × (1 + 28) = 116')
  })

  it('names the canonical standard for a layer even with no convention file for the language', () => {
    const md = renderBriefing(
      inspection([gap({ kind: 'e2e' })]),
      {},
      'my-repo',
      'library',
      language.standards.e2e,
    )

    // this is what makes a language work on the day it enters the registry
    expect(md).toContain(language.standards.e2e.name)
    expect(md).toContain(language.standards.e2e.url)
  })

  it('inlines the full convention text when the project ships one for that layer', () => {
    const md = renderBriefing(
      inspection([gap({ kind: 'e2e' })]),
      { e2e: '## Use role-based locators\n\nNever a CSS selector.' },
      'my-repo',
      'library',
      language.standards.e2e,
    )
    expect(md).toContain('Never a CSS selector.')
  })

  it('only carries the standards for layers that actually have a gap', () => {
    const md = renderBriefing(
      inspection([gap({ kind: 'unit' })]),
      { unit: 'UNIT STANDARD TEXT', e2e: 'E2E STANDARD TEXT' },
      'my-repo',
      'library',
      language.standards.e2e,
    )

    expect(md).toContain('UNIT STANDARD TEXT')
    expect(md).not.toContain('E2E STANDARD TEXT')
  })

  it('says so plainly when there is no work, and emits no work section', () => {
    const md = renderBriefing(inspection([]), {}, 'my-repo', 'library', language.standards.e2e)

    expect(md).toMatch(/no gaps/i)
    expect(md).not.toContain('## The work')
  })
})

describe('renderBriefing — the project-profile lens', () => {
  const e2eStd = language.standards.e2e // the default; individual tests override the profile

  const gaps = [
    gap({ symbol: 'Checkout', file: 'src/pages/checkout.tsx', kind: 'e2e' }),
    gap({ symbol: 'request', file: 'src/api.ts', kind: 'integration' }),
    gap({ symbol: 'formatMoney', file: 'src/money.ts', kind: 'unit' }),
  ]

  it('adds a Focus section that names the profile for a frontend', () => {
    const md = renderBriefing(inspection(gaps), {}, 'shop', 'frontend', e2eStd)

    expect(md).toContain('## Focus for this project')
    expect(md).toMatch(/frontend/i)
  })

  it('orders the Focus groups by the profile priority — e2e before unit for a frontend', () => {
    const md = renderBriefing(inspection(gaps), {}, 'shop', 'frontend', e2eStd)
    const focus = md.slice(md.indexOf('## Focus for this project'))

    // within the Focus section, the e2e heading comes before the unit heading
    expect(focus.indexOf('e2e')).toBeLessThan(focus.indexOf('unit'))
  })

  it('orders integration before e2e for a backend', () => {
    const md = renderBriefing(inspection(gaps), {}, 'svc', 'backend', e2eStd)
    const focus = md.slice(md.indexOf('## Focus for this project'))

    expect(focus.indexOf('integration')).toBeLessThan(focus.indexOf('e2e'))
  })

  it('omits the Focus section entirely for a library — no signal, nothing honest to say', () => {
    const md = renderBriefing(inspection(gaps), {}, 'lib', 'library', e2eStd)
    expect(md).not.toContain('## Focus for this project')
  })

  it('does not touch the score — the arithmetic in The work is unchanged by the profile', () => {
    const front = renderBriefing(inspection(gaps), {}, 'x', 'frontend', e2eStd)
    const lib = renderBriefing(inspection(gaps), {}, 'x', 'library', e2eStd)

    // the "## The work" section (the ranked, scored list) is byte-identical regardless of profile
    const work = (md: string) => md.slice(md.indexOf('## The work'), md.indexOf('## The standards'))
    expect(work(front)).toBe(work(lib))
  })

  it('the Focus section lists the SAME gaps, just regrouped — none added, none dropped', () => {
    const md = renderBriefing(inspection(gaps), {}, 'shop', 'frontend', e2eStd)
    const focus = md.slice(md.indexOf('## Focus for this project'), md.indexOf('## The work'))

    for (const symbol of ['Checkout', 'request', 'formatMoney']) {
      expect(focus).toContain(symbol)
    }
  })

  it('shows the e2e standard from the resolved tool, not always Playwright', () => {
    const cypress = { name: 'Cypress Best Practices', url: 'https://docs.cypress.io/x' }
    const md = renderBriefing(inspection([gap({ kind: 'e2e' })]), {}, 'shop', 'frontend', cypress)

    expect(md).toContain('Cypress Best Practices')
    expect(md).toContain('docs.cypress.io')
  })
})
