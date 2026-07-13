# TypeScript / JavaScript — end-to-end tests

> **Source of this standard:** [Playwright — Best Practices](https://playwright.dev/docs/best-practices)
> and [Playwright — Locators](https://playwright.dev/docs/locators). Every rule below is in those
> pages. **Nothing here is a house invention.** If a rule is not in the Playwright docs, it does not
> belong in this file.
>
> This is why the standard is not up for debate: nobody argues with the Playwright docs in a code
> review. Everybody argues with the standard a colleague invented last week.

## Where the test file lives

`e2e/<feature>.spec.ts` — separate from unit tests, because they run under a different config and a
different command.

## What one test looks like

```ts
import { expect, test } from '@playwright/test'

test('a customer can check out a cart', async ({ page }) => {
  await page.goto('/cart')

  await page.getByRole('button', { name: 'Checkout' }).click()
  await page.getByLabel('Card number').fill('4242424242424242')
  await page.getByRole('button', { name: 'Pay' }).click()

  await expect(page.getByText('Order confirmed')).toBeVisible()
})
```

## What to assert

**Assert what the user sees.** Not what the server logged, not what the store holds, not that a
function was called. If the user cannot perceive it, it is not an end-to-end assertion.

Use **web-first assertions** — `await expect(locator).toBeVisible()`. They retry until the condition
holds or the timeout expires. This is the single most important rule on the Best Practices page:

```ts
// right — retries until it appears
await expect(page.getByText('Order confirmed')).toBeVisible()

// wrong — reads the DOM once, at whatever instant the line runs, and flakes forever
expect(await page.getByText('Order confirmed').isVisible()).toBe(true)
```

**Never `waitForTimeout`.** A hard sleep is a flaky test with a delay bolted on. Playwright's
auto-waiting already handles it; if it does not, you are asserting on the wrong thing.

Test **one user-visible flow per test**. Tests must be independent — Playwright runs them in
parallel, and a test that depends on another test's leftovers will fail the moment the order shifts.

## Locators: how to find things

From the docs, in this order of preference:

1. `getByRole('button', { name: 'Checkout' })` — how a user (and a screen reader) perceives it
2. `getByLabel('Card number')` — for form fields
3. `getByText('Order confirmed')` — for content
4. `getByTestId('...')` — **last resort**, when the element has no accessible identity

**Never select by CSS class or XPath.** `page.locator('.btn-primary-2')` breaks when someone renames
a class — and a class rename is not a regression. A test that reports it as one gets muted, and a
muted test is worse than no test.

If you cannot find an element by role or label, that is usually an accessibility bug in the app.
**Say so in the test as a comment. Do not fix the app** — you were asked to write a test.

## What to mock

**Nothing, by default.** It is called end-to-end because it goes end to end.

The one thing worth stubbing is a **third-party** dependency you do not control and cannot make
deterministic — a payment provider's sandbox, an external weather API. Use `page.route()` for that,
and only for that. Stubbing your own backend turns an e2e test into an expensive unit test.

## Naming

- The file: the feature. `e2e/checkout.spec.ts`.
- The test: **what the user does**, from the user's side, present tense.
  `test('a customer can check out a cart')` — not `test('CheckoutPage renders and submits')`.
- If the test name mentions a component name, a prop, or a hook, it is written from the code's point
  of view, not the user's. Rewrite it.
