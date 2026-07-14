# PHP — unit tests

> **Source of this standard:** the [PHPUnit documentation](https://docs.phpunit.de/) — writing
> tests, assertions, and test doubles. Nothing here is a house invention — if a rule below is not in
> those docs, it does not belong in this file.
>
> Method names: PHPUnit recognizes a test two ways — the `test` prefix, or the `#[Test]` attribute.
> Both are in the docs; this file uses the prefix, since it needs no import.

## Where the test file lives

Mirrors `src/`, one test class per source class, `<Subject>Test.php`:

- `src/Order/Total.php` → `tests/Order/TotalTest.php`, class `TotalTest`

PHPUnit's test runner discovers files by the `*Test.php` pattern, and a source class `Foo` pairs
with a test class `FooTest`. If the project already splits `tests/unit/` and `tests/integration/`
into separate trees, **follow the project** — PHPUnit's own example project (a raytracer) organizes
tests exactly that way.

## What one test looks like

```php
<?php declare(strict_types=1);

namespace App\Tests\Order;

use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

use function App\Order\total;

final class TotalTest extends TestCase
{
    public function testSumsTheLineItems(): void
    {
        $this->assertSame(20, total([['price' => 10, 'qty' => 2]]));
    }

    public function testReturnsZeroForAnEmptyCart(): void
    {
        $this->assertSame(0, total([]));
    }

    public function testThrowsOnANegativeQuantity(): void
    {
        $this->expectException(InvalidArgumentException::class);

        total([['price' => 10, 'qty' => -1]]);
    }
}
```

Three tests, three behaviors, zero setup. That is the shape.

## What to assert

Assert **behavior at the boundaries** — the thing the method promises, where it is most likely to
break:

- the normal case
- the empty / zero / null case
- **every branch** — if the code has an `if`, there are two tests hiding in it
- the error path: `expectException(InvalidArgumentException::class)`, and — the docs also give you
  `expectExceptionMessage(...)` and `expectExceptionMessageMatches(...)` — use one of those alongside
  it. Asserting only the exception class and not its message is asserting half the contract.

Prefer `assertSame()` over `assertEquals()`. The docs are explicit about the difference: `assertSame()`
checks identity with `===` (type **and** value), `assertEquals()` checks equality with `==`. `0 ==
'foo'` is `true` in PHP; `0 === 'foo'` is not. Default to `assertSame()` and drop to `assertEquals()`
only when you deliberately want the loose comparison.

**Do not assert on internals.** No reaching into private properties, no asserting call counts on
things that are not the contract. A test that breaks when someone renames a private property is a
test that gets deleted within a month — and it should be.

## What to mock

**In a unit test: nothing that isn't an injected collaborator.**

The docs define test doubles for exactly one situation: a real dependency "aren't available, they
will not return the results needed for the test, or because executing them would have undesirable
side effects." That's `createStub()` when you just need a return value, and `createMock()` when the
call itself — verified with `expects()` — is the behavior under test:

```php
$repository = $this->createMock(OrderRepository::class);
$repository->expects($this->once())->method('save')->with($this->identicalTo($order));
```

If the code needs a mock only because it reaches straight into a database, the filesystem, or the
network — not through an injected collaborator — that is the code telling you it has an I/O
dependency it should not have at this layer. Either refactor to inject it, or **this is not a unit
test — it is an integration test**, and it belongs in `integration.md`.

## Naming

- The class: `<Subject>Test`, matching the source class it tests — a class `Total` gets `TotalTest`.
- The method: `test` + the behavior, or a plain descriptive name under `#[Test]`. The docs' own
  example is `testGreetsWithName` for a method that greets by name — name it after what it proves,
  not how it does it.
- Data providers get named datasets — `'adding zeros' => [0, 0, 0]` — so a failure reads as
  `testAdd with data set "adding zeros"`, not `with data set #0`.
