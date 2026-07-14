# Rust — end-to-end tests

> **Source of this standard:** [Playwright — Best Practices](https://playwright.dev/docs/best-practices).
> Rust has **no official Playwright binding** — there is no `getByRole` in Rust, and this file will
> not pretend there is. What follows is Playwright's principles, cited, adapted honestly to the two
> ways a Rust project actually runs an end-to-end test: driving a running server over HTTP with
> `reqwest`, or running real Playwright as a separate Node process.

## Where the test file lives

Two honest options, pick the one that matches what the app actually exposes:

**A. HTTP-only surface (an API, no browser UI):** a top-level file directly under `tests/`, per the
Rust Book's test organization — `tests/e2e_checkout.rs`. It has to be a top-level file: the Book notes
that files *inside a subdirectory* of `tests/` (a nested `tests/e2e/`) are not compiled as their own
test crate and never run — that mechanism is what lets `tests/common/mod.rs` exist without being
treated as a test. So a Rust e2e file cannot live in `tests/e2e/`; it lives in `tests/`, named for
clarity: `e2e_<flow>.rs`.

**B. A real browser UI:** real Playwright, in its own directory outside Cargo entirely —
`e2e/<feature>.spec.ts`, run with `npx playwright test`, exactly as the Playwright docs describe it.
This is not a Rust test and `cargo test` will not run it; that is the honest answer, not a gap to
paper over.

## What one test looks like

Option A — reqwest against the real, running server:

```rust
// tests/e2e_checkout.rs
use my_crate::app;

#[tokio::test]
async fn a_customer_can_check_out_a_cart() {
    let addr = app::spawn().await; // the real server, real port, real handlers
    let client = reqwest::Client::new();

    let res = client
        .post(format!("http://{addr}/checkout"))
        .json(&serde_json::json!({ "card_number": "4242424242424242" }))
        .send()
        .await
        .expect("request failed");

    assert_eq!(res.status(), reqwest::StatusCode::OK);
    let body: serde_json::Value = res.json().await.expect("bad json");
    assert_eq!(body["status"], "Order confirmed");
}
```

Option B — real Playwright, same as any other Playwright project:

```ts
// e2e/checkout.spec.ts
import { expect, test } from '@playwright/test'

test('a customer can check out a cart', async ({ page }) => {
  await page.goto('/cart')
  await page.getByRole('button', { name: 'Checkout' }).click()
  await page.getByLabel('Card number').fill('4242424242424242')
  await page.getByRole('button', { name: 'Pay' }).click()

  await expect(page.getByText('Order confirmed')).toBeVisible()
})
```

## What to assert — and what NOT to assert

Playwright's rule is **assert what the user perceives, not what the server logged**. There is no DOM
in option A, so "what the user perceives" is whatever the client-facing surface actually returns: the
response body the frontend renders from, the status code, the redirect — not a row you queried
straight out of the database, and not that an internal function ran. That belongs to the integration
test.

**Never a hard sleep.** Playwright's docs are emphatic that a fixed wait is a flaky test with a delay
bolted on, and that principle does not stop being true just because the driver is `reqwest` instead of
a browser. There is no Rust equivalent of Playwright's auto-retrying `toBeVisible()`, so say so and
adapt: poll with a bounded retry instead of guessing a sleep duration —

```rust
// right — bounded retry, adapted from Playwright's auto-waiting principle, not a documented Rust API
async fn wait_for_status(url: &str, expect: reqwest::StatusCode) {
    for _ in 0..20 {
        if reqwest::get(url).await.map(|r| r.status()) == Ok(expect) {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    panic!("timed out waiting for {expect} from {url}");
}

// wrong — one arbitrary sleep, no retry, flakes the moment CI is slower than a laptop
tokio::time::sleep(std::time::Duration::from_secs(1)).await;
```

If you're on option B, this section is just Playwright's docs unmodified: use web-first assertions
(`await expect(locator).toBeVisible()`), never `waitForTimeout`.

## If you're on option B: locators, in the docs' order

1. `getByRole('button', { name: 'Checkout' })` — how a user and a screen reader perceive it
2. `getByLabel('Card number')` — for form fields
3. `getByText('Order confirmed')` — for content
4. `getByTestId('...')` — last resort, when the element has no accessible identity

**Never CSS class or XPath.** A class rename is not a regression, and a test that reports it as one
gets muted. Option A has no locators at all — there is no DOM to query, only the response you asked
for.

## What to mock, and what to never mock

**Nothing, by default** — in either option, it is called end-to-end because it goes end to end,
through the real running app.

The one thing worth stubbing is a **third party you do not control** and cannot make deterministic — a
payment provider's sandbox. Option B has `page.route()` for this, straight from the docs. Option A has
no browser network layer to intercept; point the server's configuration at a fake endpoint for the
test run instead. Stubbing your own backend, in either option, turns an e2e test into an expensive
unit test.

## Naming

- The file: the feature — `tests/e2e_checkout.rs` (option A) or `e2e/checkout.spec.ts` (option B).
- The test: what the user does, from the user's side, present tense — `a_customer_can_check_out_a_cart`
  in Rust's snake_case, `'a customer can check out a cart'` in Playwright's sentence case. Same words,
  different case convention.
- If the name mentions a handler, a struct, or a route function, it is written from the code's point
  of view, not the user's. Rewrite it.
