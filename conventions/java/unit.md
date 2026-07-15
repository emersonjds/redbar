# Java — unit tests

> **Source of this standard:** the [JUnit 5 User Guide](https://junit.org/junit5/docs/current/user-guide/)
> and the [Mockito docs](https://site.mockito.org/) for collaborators. Nothing here is a house
> invention — if a rule below is not in those docs, it does not belong in this file.

## Where the test file lives

`src/test/java/<package>/<Class>Test.java`, mirroring the package of the class under test:

- `src/main/java/com/example/order/OrderTotal.java` →
  `src/test/java/com/example/order/OrderTotalTest.java`

This is not a house convention — it is Maven Surefire's default include pattern
(`**/*Test.java`, `**/Test*.java`, `**/*Tests.java`, `**/*TestCase.java`). A test outside that
pattern does not run unless someone widens the Surefire config, and a convention that fights the
build is a broken convention.

## What one test looks like

```java
package com.example.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import org.junit.jupiter.api.Test;

class OrderTotalTest {

    @Test
    void sumsTheLineItems() {
        assertEquals(20, OrderTotal.of(List.of(new LineItem(10, 2))));
    }

    @Test
    void returnsZeroForAnEmptyCart() {
        assertEquals(0, OrderTotal.of(List.of()));
    }

    @Test
    void throwsOnANegativeQuantity() {
        Exception exception = assertThrows(IllegalArgumentException.class,
            () -> OrderTotal.of(List.of(new LineItem(10, -1))));

        assertEquals("quantity must not be negative", exception.getMessage());
    }
}
```

Three tests, three behaviors, zero setup. That is the shape — straight from the User Guide's own
`AssertionsDemo` (`standardAssertions`, `groupedAssertions`, `exceptionTesting`): assert the value,
group related assertions with `assertAll`, and for the error path capture the thrown exception and
assert on its message, not just its type.

For a family of inputs that all exercise the same branch, the User Guide's own pattern is
`@ParameterizedTest`, not a loop inside one `@Test`:

```java
@ParameterizedTest
@ValueSource(ints = { -1, -4 })
void rejectsNegativeQuantities(int quantity) {
    assertThrows(IllegalArgumentException.class, () -> new LineItem(10, quantity));
}
```

## What to assert

Assert **behavior at the boundaries** — the thing the method promises, where it is most likely to
break:

- the normal case
- the empty / zero / null case
- **every branch** — if the method has an `if`, there are two tests hiding in it (`@ParameterizedTest`
  when the branch has more than two interesting inputs)
- the error path: `assertThrows` returns the exception — assert on its message too, not just its
  class

One behavior per `@Test`. Use `@DisplayName` when the method name cannot carry the nuance:

```java
@Test
@DisplayName("treats a null customer as a guest checkout")
void treatsNullCustomerAsGuest() { ... }
```

**Do not assert on internals.** No verifying a private helper got called, no asserting call counts
on things that are not the contract. A test that breaks when someone renames a local variable is a
test that gets deleted within a month — and it should be.

## What to mock

**In a unit test: the collaborators, via Mockito — never the class under test itself.**

```java
OrderRepository repository = mock(OrderRepository.class);
when(repository.findById(1L)).thenReturn(Optional.of(new Order("ada", 20)));

OrderService service = new OrderService(repository);

assertEquals(20, service.totalFor(1L));

verify(repository).findById(1L);
```

`mock()` creates the collaborator, `when(...).thenReturn(...)` stubs it, `verify(...)` confirms the
interaction — the three calls the Mockito docs build every example around.

Mockito's own guidance draws the line for you:

- **Do not mock types you don't own** — wrap the third-party type first, mock your wrapper.
- **Do not mock value objects** — construct the real one; if it needs a mock to exist, it is not a
  value object.
- **Do not mock everything** — a test that mocks every collaborator is asserting the mock behaves
  as programmed, not that the code works.

If the method under test needs a real database, a real file, or a real network call to run at all,
that is not a unit test — it is an integration test, and it belongs in `integration.md`.

## Naming

- The class: `<ClassUnderTest>Test` — the same convention Surefire's default include pattern
  expects, so the build actually runs it.
- The method: the behavior, present tense, no "should" — `sumsTheLineItems()`, not
  `shouldSumTheLineItems()`. Every example in the User Guide names methods after what they verify,
  not after the actor.
- `@DisplayName` is for the sentence a method name cannot spell — spaces, punctuation, the exact
  wording you want in a failure report. It supplements the method name; it does not replace the
  need for that name to already be clear.
