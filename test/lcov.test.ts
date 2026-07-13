import { describe, expect, it } from 'vitest'
import { parseLcov } from '../src/coverage/lcov.js'

const ROOT = '/home/user/proj'

// first record has an absolute SF: (what cargo-llvm-cov emits), second is already relative
const SAMPLE = `TN:
SF:/home/user/proj/src/math.ts
FN:1,add
FNDA:1,add
DA:1,1
DA:2,1
DA:5,0
DA:6,0
LF:4
LH:2
end_of_record
TN:
SF:src/util.ts
DA:3,2
LF:1
LH:1
end_of_record
`

describe('parseLcov', () => {
  it('splits covered from uncovered lines', () => {
    expect(parseLcov(SAMPLE, ROOT).get('src/math.ts')).toEqual({
      file: 'src/math.ts',
      covered: [1, 2],
      uncovered: [5, 6],
    })
  })

  it('normalizes an absolute SF path to repo-relative', () => {
    expect(parseLcov(SAMPLE, ROOT).has('src/math.ts')).toBe(true)
    expect(parseLcov(SAMPLE, ROOT).has('home/user/proj/src/math.ts')).toBe(false)
  })

  it('leaves an already-relative path untouched even when root is given', () => {
    expect(parseLcov(SAMPLE, ROOT).get('src/util.ts')?.covered).toEqual([3])
  })

  it('returns an empty map for empty input', () => {
    expect(parseLcov('').size).toBe(0)
  })
})
