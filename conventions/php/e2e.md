# PHP — end-to-end tests

> **Source of this standard:** [Playwright — Best Practices](https://playwright.dev/docs/best-practices)
> and [Playwright — Locators](https://playwright.dev/docs/locators). PHP has no official Playwright
> binding, so this file adapts Playwright's principles rather than inventing a PHP API that does not
> exist. Every rule below is traceable to those pages.

## Two honest options — pick one, do not blur them

1. **Browser e2e, via Playwright's real (Node) runner**, in a top-level `e2e/` directory outside the
   PHP test suite. This is the only way to assert what a user actually sees rendered — Playwright is
   a Node/TS/Python/Java/.NET tool, and there is no PHPUnit plugin that drives a real browser to the
   standard the Playwright docs describe.
2. **HTTP-surface e2e, in PHP, with Guzzle**, against a running instance of the app — no browser, no
   DOM, but a real process boundary and real HTTP over the network. This is not what the Playwright
   docs describe; it is the closest same-language approximation when a second toolchain is not an
   option. Keep it in `tests/E2E/` so nobody mistakes it for a browser test.

Do not write a PHP test that claims to assert what "the user sees" — a PHP process has no user; only
a browser does.

## Where the test file lives

- Option 1: `e2e/<feature>.spec.ts`, run by `@playwright/test` — same as any Playwright project, see
  `conventions/ts/e2e.md`.
- Option 2: `tests/E2E/<Feature>Test.php`, run by PHPUnit against a live base URL.

## What one test looks like

Option 1 — real Playwright:

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

Option 2 — the same flow, through the HTTP surface only:

```php
<?php declare(strict_types=1);

namespace App\Tests\E2E;

use GuzzleHttp\Client;
use PHPUnit\Framework\TestCase;

final class CheckoutTest extends TestCase
{
    public function testACustomerCanCheckOutACart(): void
    {
        $client = new Client(['base_uri' => (string) getenv('APP_BASE_URL')]);

        $response = $client->post('/orders', [
            'json' => ['items' => [['sku' => 'ABC', 'qty' => 1]], 'card' => '4242424242424242'],
        ]);

        $this->assertSame(201, $response->getStatusCode());
        $this->assertStringContainsString('confirmed', (string) $response->getBody());
    }
}
```

Notice what option 2 cannot do: it cannot assert the confirmation is *visible*, only that the server
said so. That gap is the whole reason option 1 exists.

## What to assert

**Assert what the user perceives — or, honestly, the closest proxy PHP has.**

- Option 1: web-first assertions, exactly as the docs prescribe — `await
  expect(locator).toBeVisible()`, which retries until the condition holds or the timeout expires.
  Never `expect(await locator.isVisible()).toBe(true)` — that reads the DOM once, at whatever
  instant the line runs, and flakes forever.
- Option 2: the closest same-language proxy is the response the server sends the browser — status
  code and body — not an internal call count or a database row. It is a weaker assertion than option
  1 by construction; that is the honest tradeoff of skipping the browser.

**Never a hard sleep** (`waitForTimeout` in Playwright, or `sleep()` in PHP "to let it settle"). The
docs call this out directly: Playwright's auto-waiting already handles timing; a sleep is a flaky
test with a delay bolted on.

Test one user-visible flow per test. Tests must be independent — Playwright runs them in parallel,
and a PHP e2e suite hitting a live server should make the same assumption.

## Locators (option 1 only): how to find things

From the Playwright docs, in this order of preference:

1. `getByRole('button', { name: 'Checkout' })` — how a user, and a screen reader, perceives it
2. `getByLabel('Card number')` — for form fields
3. `getByText('Order confirmed')` — for content
4. `getByTestId('...')` — last resort, when the element has no accessible identity

**Never select by CSS class or XPath.** A class rename is not a regression, and a test that reports
it as one gets muted — a muted test is worse than no test. Option 2 has no DOM and no locators, so
this section does not apply to it.

## What to mock

**Nothing, by default, in either option.** It is end-to-end because it goes end to end.

The one thing worth stubbing is a third-party dependency you do not control and cannot make
deterministic — a payment provider's sandbox. In option 1, `page.route()`. In option 2, that third
party sits behind your own app's HTTP client, so stub it the same way the integration file does —
Guzzle's `MockHandler` — never the app itself.

## Naming

- Option 1 file: the feature, `e2e/checkout.spec.ts`; test name from the user's side,
  `test('a customer can check out a cart')`.
- Option 2 file: `tests/E2E/CheckoutTest.php`; method `testACustomerCanCheckOutACart` — still the
  user's action, present tense, not `testPostOrdersReturns201`.
- If the name mentions a route, a status code, or an internal method, it is written from the code's
  point of view, not the user's. Rewrite it.
