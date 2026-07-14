# Python — end-to-end tests

> **Source of this standard:** [Playwright — Best Practices](https://playwright.dev/docs/best-practices)
> (the Python docs point here — there is no separate `/python/docs/best-practices` page, the
> guidance is one standard for every language), plus the Python-specific
> [Locators](https://playwright.dev/python/docs/locators) and
> [Writing Tests](https://playwright.dev/python/docs/writing-tests) pages for the sync API idiom.
> Every rule below is in those pages. **Nothing here is a house invention.** If a rule is not in the
> Playwright docs, it does not belong in this file.
>
> This is why the standard is not up for debate: nobody argues with the Playwright docs in a code
> review. Everybody argues with the standard a colleague invented last week.

## Where the test file lives

`e2e/test_<feature>.py` — the `pytest-playwright` plugin discovers it exactly like any other pytest
test (`test_` prefix), separate from unit tests because it runs under a different command and needs
browsers installed.

## What one test looks like

```python
from playwright.sync_api import Page, expect


def test_a_customer_can_check_out_a_cart(page: Page):
    page.goto("/cart")

    page.get_by_role("button", name="Checkout").click()
    page.get_by_label("Card number").fill("4242424242424242")
    page.get_by_role("button", name="Pay").click()

    expect(page.get_by_text("Order confirmed")).to_be_visible()
```

`page` is the fixture the `pytest-playwright` plugin provides — an isolated browser context per
test, nothing declared or wired by hand.

## What to assert

**Assert what the user sees.** Not what the server logged, not what the database holds, not that a
function was called. If the user cannot perceive it, it is not an end-to-end assertion.

Use **web-first assertions** — `expect(locator).to_be_visible()`. They retry until the condition
holds or the timeout expires. This is the single most important rule on the Best Practices page:

```python
# right — retries until it appears
expect(page.get_by_text("Order confirmed")).to_be_visible()

# wrong — reads the DOM once, at whatever instant the line runs, and flakes forever
assert page.get_by_text("Order confirmed").is_visible()
```

**Never `page.wait_for_timeout()`.** A hard sleep is a flaky test with a delay bolted on.
Playwright's auto-waiting already handles it; if it does not, you are asserting on the wrong thing.

Test **one user-visible flow per test**. Tests must be independent — each gets its own isolated
context, and a test that depends on another test's leftovers will fail the moment the run order
shifts.

## Locators: how to find things

From the docs, in order of preference:

1. `page.get_by_role("button", name="Checkout")` — how a user, and a screen reader, perceives it
2. `page.get_by_text("Order confirmed")` — for content
3. `page.get_by_label("Card number")` — for form fields
4. `page.get_by_test_id("...")` — **last resort**, when the element has no accessible identity

**Never select by CSS class or XPath.** `page.locator(".btn-primary-2")` breaks when someone renames
a class — and a class rename is not a regression. A test that reports it as one gets muted, and a
muted test is worse than no test.

If you cannot find an element by role, text, or label, that is usually an accessibility bug in the
app. **Say so in the test as a comment. Do not fix the app** — you were asked to write a test.

## What to mock

**Nothing, by default.** It is called end-to-end because it goes end to end.

The one thing worth stubbing is a **third-party** dependency you do not control and cannot make
deterministic — a payment provider's sandbox, an external weather API. Use `page.route()` for that,
and only for that. Stubbing your own backend turns an e2e test into an expensive unit test.

## Naming

- The file: the feature. `e2e/test_checkout.py`.
- The test: **what the user does**, from the user's side, present tense.
  `test_a_customer_can_check_out_a_cart` — not `test_checkout_page_renders_and_submits`.
- If the test name mentions a component name, a prop, or a hook, it is written from the code's point
  of view, not the user's. Rewrite it.
