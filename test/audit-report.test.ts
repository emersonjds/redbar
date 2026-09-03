import { describe, expect, it } from 'vitest'
import type { Audit, Check } from '../src/audit.js'
import type { Inspection } from '../src/engine.js'
import { byId } from '../src/languages.js'
import {
  AUDIT_MARKER,
  MARKER,
  renderAuditHtml,
  renderAuditMarkdown,
  renderAuditText,
} from '../src/report.js'

const ts = byId('ts')!
const vitest = ts.runners[0]!

function inspection(stale?: boolean): Inspection {
  return {
    language: ts,
    runner: vitest,
    base: '(whole repository)',
    gaps: [],
    coverage: new Map(),
    stale,
  }
}

const check = (category: Check['category'], passed: boolean, detail: string): Check => ({
  category,
  passed,
  detail,
})

/** the shape `audit()` returns for a real project — four scores, both blocks populated */
function scored(over: Partial<Audit> = {}): Audit {
  return {
    scores: { setup: 100, coverage: 48, rigor: 71, pyramid: 55 },
    overall: 62,
    checks: [
      check('setup', true, `82 test file(s) match ${ts.testPattern}`),
      check('setup', true, 'vitest is named in the manifest'),
      check('coverage', false, '31 of 82 product files (38%) have no coverage at all'),
      check('coverage', false, '1,204 of 2,310 executable lines are untested'),
      check('rigor', false, '4 of 82 test files assert nothing'),
      check('pyramid', false, 'integration weighs ×3 — 810 of 1,000 lines (81%) untested'),
    ],
    profile: 'backend',
    unmeasurable: false,
    ...over,
  }
}

/** the shape `audit()` returns with no test file: one score, and the other three ABSENT */
function unmeasurable(): Audit {
  return {
    scores: { setup: 0 },
    overall: 0,
    checks: [
      check('setup', false, `no file matches ${ts.testPattern}`),
      check('setup', true, 'vitest is named in the manifest'),
      check('setup', false, 'coverage/lcov.info parsed 0 files — nothing was measured'),
    ],
    profile: 'backend',
    unmeasurable: true,
  }
}

describe('renderAuditText', () => {
  it('leads with the overall score, the stack and the profile', () => {
    const text = renderAuditText(scored(), inspection())

    expect(text).toContain(ts.name)
    expect(text).toContain('vitest')
    expect(text).toContain('a backend project')
    expect(text).toMatch(/62\s+overall/)
  })

  it('draws every measured category as a bar of a fixed width', () => {
    const text = renderAuditText(scored(), inspection())

    // 100 fills the whole bar; the constant is the width
    expect(text).toContain(`Setup      100  ${'█'.repeat(20)}`)
    // 48 of 100 over 20 cells = 9.6 cells: 9 whole blocks and the eighth that is left, floored.
    // Rounding to 10 would draw more than was measured; without the eighths a 48 and a 52 draw
    // the same bar.
    expect(text).toContain(`Coverage    48  ${'█'.repeat(9)}▌`)
    expect(text).toContain(`Rigor       71  ${'█'.repeat(14)}▏`)
    expect(text).toContain(`Pyramid     55  ${'█'.repeat(11)}`)
  })

  it('never mixes FAILED with PASSED, and shows every failed line above the passed block', () => {
    const text = renderAuditText(scored(), inspection())
    const failed = text.indexOf('FAILED')
    const passed = text.indexOf('PASSED')

    expect(failed).toBeGreaterThan(-1)
    expect(passed).toBeGreaterThan(failed)
    expect(text.indexOf('1,204 of 2,310')).toBeLessThan(passed)
    expect(text.indexOf('82 test file(s) match')).toBeGreaterThan(passed)
  })

  it('renders each failed detail verbatim — the arithmetic survives into the output', () => {
    const text = renderAuditText(scored(), inspection())

    for (const c of scored().checks.filter((x) => !x.passed)) expect(text).toContain(c.detail)
  })

  it('keeps the check order audit.ts produced, and does not re-sort by category', () => {
    const audit = scored({
      checks: [
        check('pyramid', false, 'pyramid line first'),
        check('coverage', false, 'coverage line second'),
        check('rigor', false, 'rigor line third'),
      ],
    })
    const text = renderAuditText(audit, inspection())

    expect(text.indexOf('pyramid line first')).toBeLessThan(text.indexOf('coverage line second'))
    expect(text.indexOf('coverage line second')).toBeLessThan(text.indexOf('rigor line third'))
  })

  it('explains the pyramid weights once, under the bars, and names the profile once', () => {
    const text = renderAuditText(scored(), inspection())

    // a backend project weighs integration first — the order kindPriority produced
    expect(text).toContain('Pyramid weighs the layers heaviest first: integration, unit, e2e.')
    // the header names the profile; no Pyramid row repeats it
    expect(text.match(/a backend project/g)).toHaveLength(1)
  })

  it('leaves the weight rule out when no pyramid row was measured', () => {
    expect(renderAuditText(unmeasurable(), inspection())).not.toContain('heaviest first')
  })

  it('ends in the handoff command', () => {
    expect(renderAuditText(scored(), inspection()).trimEnd()).toMatch(/redbar inspect --all.*$/)
  })

  it('carries the provenance of the numbers', () => {
    expect(renderAuditText(scored(), inspection())).toMatch(/No language model produced/i)
  })

  it('says a stale report makes the score a LOWER BOUND, and which direction the error runs', () => {
    const text = renderAuditText(scored({ stale: true }), inspection(true))

    expect(text).toContain('LOWER BOUND')
    expect(text).toMatch(/absent reads as untested/i)
    expect(text).toContain(vitest.coverageCommand)
  })

  describe('unmeasurable', () => {
    // 50 × 0.20 = 10 printed as `overall`, directly above a sentence saying the other three are
    // not in it. A reader with a calculator cannot get from 50 to 10 without assuming exactly what
    // the sentence forbids — so no overall is printed at all.
    it('prints no overall score when three of the four categories were never computed', () => {
      const text = renderAuditText(unmeasurable(), inspection())

      expect(text).not.toMatch(/^\s+\d+\s+overall$/m)
      expect(text).toContain('overall not computed')
      expect(text).not.toContain('are not in the score')
    })

    // Setup 50 with nothing under it cannot be re-derived. The two checks worth 25 each were
    // computed and thrown away before the PASSED block was ever reached.
    it('shows the passed checks Setup was computed from', () => {
      const text = renderAuditText(unmeasurable(), inspection())

      expect(text).toContain('PASSED')
      expect(text).toContain('vitest is named in the manifest')
    })

    it('shows Setup and points at redbar init', () => {
      const text = renderAuditText(unmeasurable(), inspection())

      expect(text).toMatch(/Setup\s+0/)
      expect(text).toMatch(/no tests/i)
      expect(text).toContain('redbar init')
    })

    it('never prints a score for a category that was never computed', () => {
      const text = renderAuditText(unmeasurable(), inspection())

      // the score column holds Setup and nothing else — the prose below it may name the three
      // categories, but only to say they were not computed
      expect(text).toMatch(/^ {2}Setup +0$/m)
      expect(text).not.toMatch(/^ {2}Coverage/m)
      expect(text).not.toMatch(/^ {2}Rigor/m)
      expect(text).not.toMatch(/^ {2}Pyramid/m)
      expect(text).not.toContain('redbar inspect --all')
    })
  })

  // The whole document, byte for byte. Determinism is the architectural invariant — a report that
  // shuffles cannot be diffed in a PR and makes the CI gate flap — and every column, every bar and
  // every blank line here is part of the contract a reader re-derives the numbers from.
  it('renders the whole report byte for byte', () => {
    expect(renderAuditText(scored(), inspection())).toBe(
      [
        'redbar audit · TypeScript · vitest · a backend project',
        '',
        '   62   overall',
        '',
        `  Setup      100  ${'█'.repeat(20)}`,
        `  Coverage    48  ${'█'.repeat(9)}▌`,
        `  Rigor       71  ${'█'.repeat(14)}▏`,
        `  Pyramid     55  ${'█'.repeat(11)}`,
        '',
        '  Pyramid weighs the layers heaviest first: integration, unit, e2e.',
        '',
        'FAILED',
        '  Coverage   31 of 82 product files (38%) have no coverage at all',
        '  Coverage   1,204 of 2,310 executable lines are untested',
        '  Rigor      4 of 82 test files assert nothing',
        '  Pyramid    integration weighs ×3 — 810 of 1,000 lines (81%) untested',
        '',
        'PASSED',
        `  Setup      82 test file(s) match ${ts.testPattern}`,
        '  Setup      vitest is named in the manifest',
        '',
        'From coverage/lcov.info, the git-tracked file tree and the manifest. No language model produced these numbers.',
        '',
        '  → redbar inspect --all    for the symbols, ranked by criticality',
      ].join('\n'),
    )
  })
})

describe('renderAuditMarkdown', () => {
  it('uses its own anchor, so it never overwrites the inspect comment', () => {
    const md = renderAuditMarkdown(scored(), inspection())

    expect(md.startsWith(AUDIT_MARKER)).toBe(true)
    expect(AUDIT_MARKER).not.toBe(MARKER)
    expect(md).not.toContain(MARKER)
  })

  it('carries the overall score, every measured category and its arithmetic', () => {
    const md = renderAuditMarkdown(scored(), inspection())

    expect(md).toContain('62')
    expect(md).toContain('| Coverage | 48 |')
    expect(md).toContain('31 of 82 product files (38%) have no coverage at all')
    expect(md).toMatch(/No language model produced/i)
  })

  it('states the score is a lower bound when the coverage report is older than the source', () => {
    const md = renderAuditMarkdown(scored({ stale: true }), inspection())

    expect(md).toContain('This score is a lower bound.')
    expect(md).toContain(inspection().runner.coverageCommand)
  })

  it('claims no lower bound when the report is current', () => {
    expect(renderAuditMarkdown(scored(), inspection())).not.toContain('lower bound')
  })

  it('separates failed from passed and ends in the handoff command', () => {
    const md = renderAuditMarkdown(scored(), inspection())

    expect(md.indexOf('1,204 of 2,310')).toBeLessThan(md.indexOf('vitest is named in the manifest'))
    expect(md.trimEnd()).toMatch(/redbar inspect --all[^\n]*$/)
  })

  it('stops at Setup when the repository has no tests', () => {
    const md = renderAuditMarkdown(unmeasurable(), inspection())

    expect(md).toContain('redbar init')
    expect(md).not.toContain('| Coverage |')
    expect(md).not.toContain('| Rigor |')
    expect(md).not.toContain('| Pyramid |')
    // the headline is a score out of 100 — there is none when three categories were not computed
    expect(md).toContain('**overall not computed**')
    expect(md).not.toContain('/ 100')
    expect(md).toContain('vitest is named in the manifest')
  })

  // the table, byte for byte: fixed column order, right-aligned score, the same bar the terminal
  // draws. A PR comment that reshuffles between pushes cannot be read as a diff.
  it('renders the category table byte for byte', () => {
    const md = renderAuditMarkdown(scored(), inspection())

    expect(md).toContain(
      [
        '| category | score | |',
        '| --- | --: | --- |',
        `| Setup | 100 | \`${'█'.repeat(20)}\` |`,
        `| Coverage | 48 | \`${'█'.repeat(9)}▌\` |`,
        `| Rigor | 71 | \`${'█'.repeat(14)}▏\` |`,
        `| Pyramid | 55 | \`${'█'.repeat(11)}\` |`,
      ].join('\n'),
    )
  })
})

describe('renderAuditHtml', () => {
  it('is a self-contained scorecard carrying the same numbers', () => {
    const html = renderAuditHtml(scored(), inspection(), 'my-repo')

    expect(html).toContain('my-repo')
    expect(html).toContain('<style>')
    expect(html).toContain('62')
    expect(html).toContain('31 of 82 product files (38%) have no coverage at all')
    expect(html).toContain('redbar inspect --all')
    expect(html).toMatch(/No language model produced/i)
  })

  it('escapes html-significant characters coming from a check detail', () => {
    const html = renderAuditHtml(
      scored({ checks: [check('rigor', false, '2 files disable a test: <script>')] }),
      inspection(),
      'repo',
    )

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('omits the categories that were never computed', () => {
    const html = renderAuditHtml(unmeasurable(), inspection(), 'repo')

    expect(html).toContain('<div class="cat">Setup</div>')
    expect(html).not.toContain('<div class="cat">Coverage</div>')
    expect(html).not.toContain('<div class="cat">Pyramid</div>')
    expect(html).toContain('redbar init')
    expect(html).toContain('<div class="overall"><span>overall not computed</span></div>')
    expect(html).toContain('vitest is named in the manifest')
  })

  // the score and the bar width are the same measurement drawn twice — a fill that does not match
  // the number beside it is the one lie the scorecard cannot afford
  it('draws each bar at exactly the score it prints', () => {
    const html = renderAuditHtml(scored(), inspection(), 'repo')

    expect(html).toContain('<div class="n">48</div>')
    expect(html).toContain('<div class="track"><div class="fill" style="width:48%"></div></div>')
    expect(html).toContain('<div class="n">100</div>')
    expect(html).toContain('<div class="track"><div class="fill" style="width:100%"></div></div>')
  })
})
