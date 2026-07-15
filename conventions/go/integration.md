# Go — integration tests

> **Source of this standard:** [Testcontainers for Go](https://golang.testcontainers.org/) —
> specifically the [Postgres module](https://golang.testcontainers.org/modules/postgres/) — and the
> [`net/http/httptest` docs](https://pkg.go.dev/net/http/httptest) for the HTTP-boundary case.
> Nothing here is a house invention.

## What an integration test *is*

The unit test proved the logic; this one proves the logic still works **when it talks to the real
thing** — a real database, a real HTTP server.

> **A unit test mocks nothing because it touches nothing.
> An integration test mocks nothing because it touches the real thing.**

If you find yourself faking the database in a file that calls itself an integration test, stop — you
have written a unit test with extra ceremony.

## Where the test file lives

Same layout Go always uses for tests — `_test.go` beside the code it exercises, or in its own
package when it needs to import the module as a black box. This standard does not prescribe a
separate `integration/` directory; neither cited doc does either. What it does prescribe: give the
file a build tag or a name (`_integration_test.go`) your CI can select on, since these tests are
slower and need Docker running, and a project that cannot skip them separately from unit tests will
eventually stop running them.

## What one test looks like

Against a real Postgres, with the Testcontainers Postgres module:

```go
package orderrepo_test

import (
    "context"
    "path/filepath"
    "testing"

    "github.com/testcontainers/testcontainers-go"
    "github.com/testcontainers/testcontainers-go/modules/postgres"

    "example.com/myapp/orderrepo"
)

func TestRepository_RoundTripsAnOrder(t *testing.T) {
    ctx := context.Background()

    ctr, err := postgres.Run(ctx,
        "postgres:16-alpine",
        postgres.WithInitScripts(filepath.Join("testdata", "init-user-db.sh")),
        postgres.WithDatabase("orders"),
        postgres.WithUsername("test"),
        postgres.WithPassword("test"),
        postgres.BasicWaitStrategies(),
    )
    testcontainers.CleanupContainer(t, ctr)
    if err != nil {
        t.Fatalf("starting postgres container: %v", err)
    }

    connStr, err := ctr.ConnectionString(ctx, "sslmode=disable")
    if err != nil {
        t.Fatalf("reading connection string: %v", err)
    }

    repo := orderrepo.New(connStr)

    saved, err := repo.Save(ctx, orderrepo.Order{Customer: "ada", Total: 20})
    if err != nil {
        t.Fatalf("Save() returned unexpected error: %v", err)
    }

    got, err := repo.FindByID(ctx, saved.ID)
    if err != nil {
        t.Fatalf("FindByID(%v) returned unexpected error: %v", saved.ID, err)
    }
    if got.Customer != "ada" || got.Total != 20 {
        t.Errorf("FindByID(%v) = %+v, want Customer=ada Total=20", saved.ID, got)
    }
}
```

`postgres.Run` is the module's entry point — `func Run(ctx context.Context, img string, opts
...testcontainers.ContainerCustomizer) (*PostgresContainer, error)`. `testcontainers.CleanupContainer`
is the docs' test-integrated cleanup: it registers the container's termination on `t.Cleanup` so it
tears down whether the test passes, fails, or panics — call it right after `Run`, before checking
`err`, exactly as the module's own example does.

Against your own HTTP surface, with `httptest`:

```go
package api_test

import (
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"

    "example.com/myapp/api"
)

func TestOrders_RejectsAnOrderWithNoItems(t *testing.T) {
    ts := httptest.NewServer(api.NewHandler())
    defer ts.Close()

    res, err := http.Post(ts.URL+"/orders", "application/json", strings.NewReader(`{"items":[]}`))
    if err != nil {
        t.Fatalf("POST /orders: %v", err)
    }
    defer res.Body.Close()

    if res.StatusCode != http.StatusUnprocessableEntity {
        t.Errorf("status = %d, want %d", res.StatusCode, http.StatusUnprocessableEntity)
    }
}
```

`httptest.NewServer(handler)` docs: "A Server is an HTTP server listening on a system-chosen port on
the local loopback interface, for use in end-to-end HTTP tests." It runs your real `http.Handler` —
real routing, real middleware — reachable at `ts.URL`. "The caller should call `Close` when finished,
to shut it down."

## What to assert — and what NOT to assert

**Assert the round trip.** Write it, read it back, prove the shape survived the boundary — the column
that silently truncates, the timestamp that comes back in the wrong timezone.

- the happy path across the seam
- what happens when the dependency **says no** — a constraint violation, a 422, a duplicate key
- what happens when the dependency **is not there** — connection refused, timeout, if the code has a
  retry or a fallback this is the only place it can be exercised at all

Do not re-assert business logic the unit test already covers — that only produces a slow test that
fails twice for one bug.

## What to mock, and what to never mock

**Not the thing under test.** That is the whole point of reaching for a container or a real server
instead of a fake.

- **Your database** → a real one, started by the Testcontainers module (`postgres.Run`, or
  `testcontainers.GenericContainer` for anything without a dedicated module). Never a mock, never an
  in-memory substitute that behaves differently from what runs in production.
- **Your own HTTP API** → real, via `httptest.NewServer` wrapping your actual `http.Handler`.
- **A third party you do not control** — neither cited doc names a stub library for this case, so
  this file does not prescribe one; point the client at a `httptest.NewServer` you control instead,
  standing in for their API. What does not change: you cannot make their sandbox deterministic, and
  it is not what this test exists to verify.

## Cleanup

Each test leaves the world as it found it. `testcontainers.CleanupContainer(t, ctr)` ties the
container's teardown to the test's own `t.Cleanup`, so it stops even if the test fails partway
through — prefer it over a bare `defer ctr.Terminate(ctx)`, which a `t.Fatal` earlier in the test can
skip. `httptest.Server.Close()` "blocks until all outstanding requests on this server have
completed" — `defer ts.Close()` right after `NewServer` is enough. A test that depends on another
test's leftover rows is not a test — it is a coin flip that fails the day the suite runs in a
different order.

## Naming

- The function: `TestXxx`, same rule as unit tests — `TestRepository_RoundTripsAnOrder`,
  `TestOrders_RejectsAnOrderWithNoItems`. The `_` groups the subject and the behavior; Go does not
  forbid it in a test name the way it would in an exported identifier.
- Say what crosses the boundary, not which method got called.
