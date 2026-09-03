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
      check('pyramid', false, 'integration weighs ×3 (a backend project) — 810 of 1,000 lines (81%) untested'),
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
    expect(text).toMatch(/Coverage {4}48 {2}█+/)
    expect(text).toMatch(/Rigor {7}71 {2}█+/)
    expect(text).toMatch(/Pyramid {5}55 {2}█+/)
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

  it('is deterministic — the same audit renders byte-identical output', () => {
    expect(renderAuditText(scored(), inspection())).toBe(renderAuditText(scored(), inspection()))
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
  })

  it('is deterministic', () => {
    expect(renderAuditMarkdown(scored(), inspection())).toBe(
      renderAuditMarkdown(scored(), inspection()),
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
  })

  it('is deterministic', () => {
    expect(renderAuditHtml(scored(), inspection(), 'repo')).toBe(
      renderAuditHtml(scored(), inspection(), 'repo'),
    )
  })
})
