# Java — end-to-end tests

> **Source of this standard:** [Playwright Java — Locators](https://playwright.dev/java/docs/locators)
> and [Playwright — Best Practices](https://playwright.dev/java/docs/best-practices) (web-first
> assertions, auto-waiting, test isolation — the same principles the Java docs' own
> `test-assertions`, `actionability`, and `browser-contexts` pages spell out with the Java API).
> **Nothing here is a house invention.** If a rule is not in the Playwright docs, it does not belong
> in this file.

## Where the test file lives

`src/test/java/e2e/<Feature>Test.java` — separate from unit and integration tests, because it
needs a running application and a browser, and it runs under a different command than
`mvn test`.

## What one test looks like

Using Playwright's JUnit 5 integration (`@UsePlaywright`), which injects an isolated `Page` per
test method:

```java
package e2e;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

import com.microsoft.playwright.Page;
import com.microsoft.playwright.junit.UsePlaywright;
import com.microsoft.playwright.options.AriaRole;
import org.junit.jupiter.api.Test;

@UsePlaywright
class CheckoutTest {

    @Test
    void aCustomerCanCheckOutACart(Page page) {
        page.navigate("/cart");

        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Checkout")).click();
        page.getByLabel("Card number").fill("4242424242424242");
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Pay")).click();

        assertThat(page.getByText("Order confirmed")).isVisible();
    }
}
```

`page` is a fixture the docs describe as "isolated ... for this test run" — every test gets its
own, so tests never leak state into each other.

## What to assert

**Assert what the user sees.** Not what the server logged, not what the repository holds, not that
a method was called. If the user cannot perceive it, it is not an end-to-end assertion.

Use **web-first assertions** — `assertThat(locator).isVisible()`, `assertThat(page).hasTitle(...)`.
These are the "auto-retrying assertions that remove flakiness by waiting until the condition is
met" — the same auto-waiting mechanism Playwright uses before every action:

```java
// right — retries until it appears
assertThat(page.getByText("Order confirmed")).isVisible();

// wrong — reads the DOM once, at whatever instant the line runs, and flakes forever
assert page.getByText("Order confirmed").isVisible();
```

**Never a manual sleep.** Playwright's actionability checks already wait for an element to exist,
be visible, be stable, and be enabled before acting on it, and the assertions wait the same way. If
that is not enough, you are asserting on the wrong thing, not missing a `Thread.sleep`.

Test **one user-visible flow per test**. Tests must be independent — Playwright's own isolation
model gives every test its own `BrowserContext` so "one test's failure won't affect others" and
suites can run in parallel.

## Locators: how to find things

From the Locators doc, in this order of preference:

1. `page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Checkout"))` — how a user
   (and a screen reader) perceives it
2. `page.getByLabel("Card number")` — for form fields
3. `page.getByText("Order confirmed")` — for content
4. `page.getByTestId("...")` — **last resort**, when the element has no accessible identity

**Never select by CSS class or XPath.** `page.locator(".btn-primary-2")` breaks when someone renames
a class — and a class rename is not a regression. A test that reports it as one gets muted, and a
muted test is worse than no test.

If you cannot find an element by role or label, that is usually an accessibility bug in the app.
**Say so in the test as a comment. Do not fix the app** — you were asked to write a test.

## What to mock

**Nothing, by default.** It is called end-to-end because it goes end to end.

The one thing worth stubbing is a **third-party** dependency you do not control and cannot make
deterministic — a payment provider's sandbox, an external rate API. Route it, and only it.
Stubbing your own backend turns an e2e test into an expensive unit test.

## Naming

- The file: the feature. `CheckoutTest.java`.
- The method: **what the user does**, from the user's side, present tense —
  `aCustomerCanCheckOutACart()`, not `checkoutPageRendersAndSubmits()`.
- If the test name mentions a component name, a field, or an internal method, it is written from
  the code's point of view, not the user's. Rewrite it.
