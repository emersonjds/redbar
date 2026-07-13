# TypeScript / JavaScript — unit tests

> **Source of this standard:** the [Vitest docs](https://vitest.dev/guide/) and the
> [Jest docs](https://jestjs.io/docs/getting-started). Nothing here is a house invention — if a
> rule below is not in those docs, it does not belong in this file.
>
> Which runner? Use the one the project already has. The idioms below are shared by both; where
> they differ, it is noted.

## Where the test file lives

Beside the source file, `.test.ts` suffix:

- `src/order/total.ts` → `src/order/total.test.ts`

If the project already puts tests in `__tests__/` or `test/`, **follow the project.** A test in the
wrong folder does not run, and a convention that fights the config is a broken convention.

## What one test looks like

```ts
import { describe, expect, it } from 'vitest' // jest: these are globals, no import needed
import { total } from './total.js'

describe('total', () => {
  it('sums the line items', () => {
    expect(total([{ price: 10, qty: 2 }])).toBe(20)
  })

  it('returns zero for an empty cart', () => {
    expect(total([])).toBe(0)
  })

  it('throws on a negative quantity', () => {
    expect(() => total([{ price: 10, qty: -1 }])).toThrow(/negative/)
  })
})
```

Three tests, three behaviors, zero setup. That is the shape.

## What to assert

Assert **behavior at the boundaries** — the thing the function promises, where it is most likely to
break:

- the normal case
- the empty / zero / null case
- **every branch** — if the function has an `if`, there are two tests hiding in it
- the error path: assert it throws, and assert *what* it throws (`toThrow(/negative/)`, not bare
  `toThrow()`)

One behavior per `it`. If you need "and" to describe what a test does, it is two tests.

**Do not assert on internals.** No spying on private helpers, no asserting call counts on things
that are not the contract. A test that breaks when someone renames a local variable is a test that
gets deleted within a month — and it should be.

## What to mock

**In a unit test: nothing.**

If the function needs a mock to run, that is the code telling you it has an I/O dependency it
should not have. Either the function should be refactored, or **this is not a unit test — it is an
integration test**, and it belongs in `integration.md`.

Two exceptions, both from the docs:

- **Time**: `vi.useFakeTimers()` / `vi.setSystemTime()` (jest: `jest.useFakeTimers()`). A test that
  depends on the wall clock is a test that fails at midnight.
- **Randomness**: inject the seed or stub the source. Do not assert on a random value.

## Naming

- `describe` — the symbol under test, spelled exactly as it is exported: `describe('total')`.
- `it` — the behavior, present tense, **no "should"**: `it('sums the line items')`, not
  `it('should sum the line items')`. The Vitest and Jest docs both write them this way; "should"
  adds a word and says nothing.
- The failure message is the test name. Read it out loud as `total > sums the line items`. If that
  does not describe what broke, rename it.
