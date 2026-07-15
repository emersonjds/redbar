# Go — end-to-end tests

> **Source of this standard:** [Playwright — Best Practices](https://playwright.dev/docs/best-practices).
> Go has **no official Playwright binding** — there is no `getByRole` in Go, and this file will not
> pretend there is. What follows is Playwright's principles, cited, adapted honestly to the two ways
> a Go project actually runs an end-to-end test: driving a running server over HTTP with `net/http`,
> gated by a [build constraint](https://pkg.go.dev/cmd/go#hdr-Build_constraints) so it does not run
> with `go test ./...`; or running real Playwright as a separate Node process.

## Where the test file lives

Two honest options, pick the one that matches what the app actually exposes:

**A. HTTP-only surface (an API, no browser UI):** an ordinary `_test.go` file — Go's `testing` docs
draw no separate category for "e2e," only "test" — placed in its own `e2e/` package and tagged with a
build constraint so `go test ./...` skips it by default:

```go
//go:build e2e

package e2e
```

Per the `cmd/go` docs, "a build constraint... must appear before the package clause," and without
`-tags` "files with build constraints are excluded unless their constraints are satisfied by default
tags." That is what keeps a slow, network-dependent test out of the everyday `go test` run: it only
executes as `go test -tags e2e ./e2e/...`, against an already-running instance of the app.

**B. A real browser UI:** real Playwright, in its own directory outside the Go module entirely —
`e2e/<feature>.spec.ts`, run with `npx playwright test`, exactly as the Playwright docs describe it.
This is not a Go test and `go test` will not run it; that is the honest answer, not a gap to paper
over.

## What one test looks like

Option A — `net/http` against the real, running server:

```go
//go:build e2e

package e2e

import (
    "net/http"
    "strings"
    "testing"
)

func TestCheckout_ACustomerCanCheckOutACart(t *testing.T) {
    baseURL := "http://localhost:8080" // the real, already-running app, not one this test spawns

    res, err := http.Post(baseURL+"/checkout", "application/json",
        strings.NewReader(`{"card_number":"4242424242424242"}`))
    if err != nil {
        t.Fatalf("POST /checkout: %v", err)
    }
    defer res.Body.Close()

    if res.StatusCode != http.StatusOK {
        t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusOK)
    }
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

Playwright's rule is **test user-visible behavior**: "Automated tests should verify that the
application code works for the end users, and avoid relying on implementation details." There is no
DOM in option A, so the user-facing surface is whatever the client-facing response actually
returns — the JSON body the frontend renders from, the status code, the redirect — not a row queried
straight out of the database, and not that an internal function ran. That belongs to the integration
test.

**No hard sleeps.** Playwright's docs describe **web-first assertions** — `await
expect(locator).toBeVisible()` — as the practice that lets Playwright "wait until the expected
condition is met" instead of checking once. Go's `net/http` has no such retrying assertion, and this
file will not invent one; adapt the principle with a bounded poll instead of guessing a sleep
duration:

```go
// right — bounded retry, adapted from Playwright's web-first-assertion principle, not a documented Go API
func waitForStatus(t *testing.T, url string, want int) {
    t.Helper()
    deadline := time.Now().Add(2 * time.Second)
    for time.Now().Before(deadline) {
        if res, err := http.Get(url); err == nil {
            res.Body.Close()
            if res.StatusCode == want {
                return
            }
        }
        time.Sleep(100 * time.Millisecond)
    }
    t.Fatalf("timed out waiting for %d from %s", want, url)
}

// wrong — one arbitrary sleep, no retry, flakes the moment CI is slower than a laptop
time.Sleep(1 * time.Second)
```

If you're on option B, this section is just Playwright's docs unmodified: web-first assertions, never
`waitForTimeout`.

## What to mock, and what to never mock

**Nothing, by default** — in either option, it is called end-to-end because it goes end to end,
through the real running app. Playwright's own guidance: "Only test what you control. Don't try to
test links to external sites or third party servers that you do not control."

- **A third party you do not control** (a payment provider's sandbox) is the one thing worth
  stubbing. Option B has `page.route()` for this, straight from the docs. Option A has no browser
  network layer to intercept; point the running app's own configuration at a fake endpoint for the
  test run instead.
- **Your own backend** — never stub it, in either option. Doing so turns an e2e test into an
  expensive unit test.

Option A's test isolation matches Playwright's rule the same way it applies to any e2e test — "Each
test should be completely isolated from another test and should run independently with its own...
data" — so a checkout test creates the cart it checks out, rather than depending on data another test
left behind.

## Naming

- The file: the feature. `e2e/checkout_test.go` (option A) or `e2e/checkout.spec.ts` (option B).
- The test: what the user does, from the user's side — `TestCheckout_ACustomerCanCheckOutACart` in
  Go's `TestXxx` form (Go has no sentence-case test name, only the exported-identifier rule from the
  `testing` docs), `'a customer can check out a cart'` in Playwright's sentence case. Same words,
  different case convention.
- If the name mentions a handler, a struct, or a route function, it is written from the code's point
  of view, not the user's. Rewrite it.
