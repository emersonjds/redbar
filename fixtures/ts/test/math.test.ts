import { expect, it } from 'vitest'
import { add } from '../src/math.js'

it('adds', () => {
  expect(add(1, 2)).toBe(3)
})
