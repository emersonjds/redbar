# TypeScript / JavaScript — end-to-end tests (Cypress)

> **Source of this standard:** [Cypress — Best Practices](https://docs.cypress.io/app/core-concepts/best-practices)
> and [Cypress — Retry-ability](https://docs.cypress.io/app/core-concepts/retry-ability). Every rule
> below is on those pages. **Nothing here is a house invention.** If a rule is not in the Cypress
> docs, it does not belong in this file.

## Where the test file lives

`cypress/e2e/<feature>.cy.ts` — the default `specPattern` Cypress looks in.

## What one test looks like

```ts
describe('checkout', () => {
  it('a customer can check out a cart', () => {
    cy.visit('/cart')

    cy.contains('button', 'Checkout').click()
    cy.get('[data-cy="card-number"]').type('4242424242424242')
    cy.contains('button', 'Pay').click()

    cy.contains('Order confirmed').should('be.visible')
  })
})
```

## What to assert

Assert what the user perceives, with `.should()`. Cypress commands that query the DOM (`cy.get`,
`cy.contains`, `cy.find`...) **retry the entire chain until the assertion passes or times out** —
that is the whole point of retry-ability, and a plain `.click()` or a one-shot read defeats it:

```ts
cy.contains('Order confirmed').should('be.visible')   // retries
```

**Never `cy.wait(<number>)`.** The docs call an arbitrary wait an anti-pattern: wait on the thing,
not the clock — alias the real request with `cy.intercept(...).as('postOrder')` and
`cy.wait('@postOrder')`, never `cy.wait(3000)`.

**Don't split one flow into tiny single-assertion tests.** The docs single this out as an
anti-pattern ("acting like you're writing unit tests") — resetting Cypress's state between tests is
slower than adding another assertion, so chain the assertions that belong to one flow onto the same
`it`. Keep tests independent regardless: the docs require that a test "always be able to run
independently from one another and still pass," including alone, via `.only`.

## Locators: how to find things

The Best Practices page ranks selectors explicitly, worst to best:

1. `cy.get('button')`, `cy.get('.btn-large')`, `cy.get('#main')` — **never/sparingly**: coupled to
   styling, structure, or JS event listeners, and the docs single out a class-based selector as
   "highly subject to change."
2. `cy.contains('Submit')` — **depends**: better than a CSS selector, but still coupled to text
   content that may change.
3. `cy.get('[data-cy="submit"]')` — **best**: a dedicated `data-cy` (or `data-test`) attribute,
   "isolated from all changes."

Prefer `data-cy` for anything the test must reliably find again; reach for `cy.contains()` when the
visible text itself is the thing worth asserting on.

## What to mock

The docs' concrete stubbing advice is about sites you don't control: don't visit or drive a
third-party page from your tests (their anti-pattern: "trying to visit or interact with sites or
servers you do not control") — stub it instead, e.g. an OAuth/social-login provider via `cy.stub()`,
or request a session token directly instead of automating its UI. Everything you do control, the
examples exercise for real: waiting on your own backend uses `cy.intercept(...).as('name')` +
`cy.wait('@name')` to wait for the real response, not to fabricate one.

## Naming

- The file: the feature. `cypress/e2e/checkout.cy.ts`.
- `describe` — the feature; `it` — **what the user does**, present tense, from the user's side:
  `it('a customer can check out a cart')`, not `it('CheckoutPage submits the form')`.
- If the name mentions a component, a prop, or a selector, it is written from the code's point of
  view. Rewrite it from the user's.
