# PHP — integration tests

> **Source of this standard:** the [PHPUnit documentation](https://docs.phpunit.de/) — fixtures,
> assertions, test doubles — and the
> [Guzzle documentation](https://docs.guzzlephp.org/en/stable/testing.html) for the HTTP-boundary
> case. Nothing here is a house invention.

## What an integration test *is*

It is the test for the seam. The unit test proved the logic; this one proves the logic still works
**when it talks to the real thing** — a real database, a real HTTP server.

The line is simple and it is the whole reason this file exists separately:

> **A unit test mocks nothing because it touches nothing.
> An integration test mocks nothing because it touches the real thing.**

If you find yourself calling `createMock()` on the database in a file called "integration test",
stop — you have written a unit test with extra ceremony.

## Where the test file lives

`tests/Integration/<Subject>Test.php` — separate from `tests/Unit/`, because these are slower and
usually run under a different PHPUnit test suite / CI job.

## What one test looks like

Against a real database — a container, or a dedicated test database — using PHPUnit's class-level
fixtures for the expensive part, the connection:

```php
<?php declare(strict_types=1);

namespace App\Tests\Integration;

use App\Order\OrderRepository;
use PDO;
use PHPUnit\Framework\TestCase;

final class OrderRepositoryTest extends TestCase
{
    private static PDO $dbh;
    private OrderRepository $repository;

    public static function setUpBeforeClass(): void
    {
        self::$dbh = new PDO((string) getenv('TEST_DATABASE_DSN'));
    }

    public static function tearDownAfterClass(): void
    {
        self::$dbh = null;
    }

    protected function setUp(): void
    {
        $this->repository = new OrderRepository(self::$dbh);
    }

    public function testRoundTripsAnOrderThroughTheDatabase(): void
    {
        $id = $this->repository->save(['customer' => 'ada', 'total' => 20]);

        $found = $this->repository->findById($id);

        $this->assertSame('ada', $found['customer']);
        $this->assertSame(20, $found['total']);
    }
}
```

Against a third party you do not control, stub only the HTTP boundary with Guzzle's `MockHandler`:

```php
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;

public function testRejectsAnOrderWhenThePaymentProviderDeclines(): void
{
    $mock = new MockHandler([
        new Response(402, [], '{"error":"card_declined"}'),
    ]);
    $client = new Client(['handler' => HandlerStack::create($mock)]);

    $result = (new PaymentGateway($client))->charge(['amount' => 20]);

    $this->assertFalse($result->succeeded);
}
```

## What to assert

**Assert the round trip.** Write it, read it back, and prove the shape survived the boundary. That
is the bug this test exists to catch — the column that silently truncates, the amount that comes
back as a string.

- the happy path across the seam
- what happens when the dependency **says no**: a constraint violation, a 402/4xx from the Guzzle
  mock, a duplicate key
- what happens when the dependency **is not there**: connection refused, timeout. If the code has a
  retry or a fallback, this is the only place it can be tested at all.

Do not re-assert the business logic — the unit test already did that, and duplicating it here just
makes a slow test that fails twice for one bug.

## What to mock

**Not the thing under test.** That is the whole point.

- **Your database** → a real one, in a container or a dedicated test database (the `PDO` connection
  above). Never a mock, never an in-memory substitute that behaves differently.
- **Your own HTTP API** → real, hit it directly — a Guzzle client against the running app, or the
  framework's own test client.
- **A third party you do not control** (a payment provider, a partner API) → **this** you stub, with
  Guzzle's `MockHandler`, exactly as the docs show: queue responses with `new MockHandler([...])`,
  wrap in `HandlerStack::create($mock)`, hand that to the `Client`. You cannot make their sandbox
  deterministic and it is not what you are testing.

## Cleanup

Each test leaves the world as it found it. Truncate between tests, or wrap each test in a
transaction and roll it back in `tearDown()`. PHPUnit's fixtures docs warn that "sharing fixtures
between tests reduces the value of the tests" — a shared `self::$dbh` connection is fine (opening it
is the expensive part), shared *data* is not. **A test that depends on another test's leftovers is
not a test — it is a coin flip**, and it will fail the day someone runs the suite in a different
order.

## Naming

- The file: the seam. `tests/Integration/OrderRepositoryTest.php`.
- The test: the crossing, present tense — `testRoundTripsAnOrderThroughTheDatabase`,
  `testRejectsAnOrderWhenThePaymentProviderDeclines`.
- Say what crosses the boundary, not which method got called.
