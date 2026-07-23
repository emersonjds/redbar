import { describe, expect, it } from 'vitest'
import { meetsSeverity, severity } from '../src/severity.js'

describe('severity', () => {
  it('untested branching logic is critical — every branch is a path nothing has ever run', () => {
    expect(severity({ fullyUncovered: true, branches: 28 })).toBe('critical')
    expect(severity({ fullyUncovered: true, branches: 5 })).toBe('critical')
  })

  it('untested code with a decision in it is high', () => {
    expect(severity({ fullyUncovered: true, branches: 4 })).toBe('high')
    expect(severity({ fullyUncovered: true, branches: 1 })).toBe('high')
  })

  it('untested straight-line code is medium — bad, but bounded', () => {
    expect(severity({ fullyUncovered: true, branches: 0 })).toBe('medium')
  })

  it('partly covered but branch-dense is medium — a test exists, it just misses paths', () => {
    expect(severity({ fullyUncovered: false, branches: 9 })).toBe('medium')
  })

  it('partly covered and simple is low', () => {
    expect(severity({ fullyUncovered: false, branches: 4 })).toBe('low')
    expect(severity({ fullyUncovered: false, branches: 0 })).toBe('low')
  })

  // the band is the triage axis, so it is also the filter execute cuts on. at-or-above, worst-first.
  it('meetsSeverity keeps a gap at or above the threshold band', () => {
    const critical = { fullyUncovered: true, branches: 6 } // critical
    const high = { fullyUncovered: true, branches: 2 } // high
    const low = { fullyUncovered: false, branches: 0 } // low

    expect(meetsSeverity(critical, 'high')).toBe(true) // above the threshold
    expect(meetsSeverity(high, 'high')).toBe(true) // at the threshold
    expect(meetsSeverity(low, 'critical')).toBe(false) // below it
    expect(meetsSeverity(low, 'low')).toBe(true) // everything meets low
  })

  // the band exists to be triaged: a covered symbol must never outrank an untested one at the
  // same branch count
  it('never rates a covered symbol above an uncovered one with the same branching', () => {
    const rank = { critical: 3, high: 2, medium: 1, low: 0 }
    for (const branches of [0, 1, 4, 5, 20]) {
      const uncovered = rank[severity({ fullyUncovered: true, branches })]
      const covered = rank[severity({ fullyUncovered: false, branches })]
      expect(uncovered, `branches=${branches}`).toBeGreaterThan(covered)
    }
  })
})
