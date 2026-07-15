# Go — unit tests

> **Source of this standard:** the [`testing` package docs](https://pkg.go.dev/testing), the
> [Go wiki — Table Driven Tests](https://go.dev/wiki/TableDrivenTests), and the
> [`errors` package docs](https://pkg.go.dev/errors) for the `errors.Is` idiom. Nothing here is a
> house invention — if a rule below is not on those pages, it does not belong in this file.

## Where the test file lives

Beside the source file, `_test.go` suffix, **same package**:

- `order/total.go` → `order/total_test.go`, `package order`

The docs also allow a separate `package order_test` in the same directory — "black box" testing that
only sees what the package exports. Use it when the test should prove the public API works without
reaching into unexported internals; use the same-package form otherwise. Either way it is excluded
from `go build` and included only by `go test`, per the docs: "The file will be excluded from
regular package builds but will be included when the 'go test' command is run."

## What one test looks like

```go
package order

import "testing"

func TestTotal(t *testing.T) {
    tests := []struct {
        name    string
        items   []LineItem
        want    int
        wantErr bool
    }{
        {name: "sums the line items", items: []LineItem{{Price: 10, Qty: 2}}, want: 20},
        {name: "empty cart is zero", items: nil, want: 0},
        {name: "negative quantity errors", items: []LineItem{{Price: 10, Qty: -1}}, wantErr: true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Total(tt.items)

            if tt.wantErr {
                if err == nil {
                    t.Fatalf("Total(%v) = nil error, want error", tt.items)
                }
                return
            }
            if err != nil {
                t.Fatalf("Total(%v) returned unexpected error: %v", tt.items, err)
            }
            if got != tt.want {
                t.Errorf("Total(%v) = %d, want %d", tt.items, got, tt.want)
            }
        })
    }
}
```

This is the table-driven shape from the wiki: "a slice of structs containing test case data,"
one loop, one `t.Run` per case. `testing`'s own `TestXxx` signature is `func TestXxx(t *testing.T)`,
and `Run(name string, f func(t *T)) bool` "runs f as a subtest of t called name" — that is what makes
`go test -run Total/negative_quantity_errors` selectable and each case's failure independently
reported.

**Go has no assertion library in the standard library.** The `testing` package's own canonical
example is a plain `if` and `t.Errorf`:

```go
func TestAbs(t *testing.T) {
    got := abs(-1)
    if got != 1 {
        t.Errorf("abs(-1) = %d; want 1", got)
    }
}
```

Do not reach for a third-party assertion package to make this look like another language's tests —
`if` + `t.Errorf("got %v, want %v", got, want)` is not a shortcut here, it is the documented idiom.

## What to assert — and what NOT to assert

Assert **behavior at the boundaries**:

- the normal case
- the empty / zero case
- **every branch** — an `if` in the function under test is two cases waiting to be added to the table
- the error path: `err != nil`, and *which* error. For a sentinel or wrapped error, use
  `errors.Is(err, target)` — the `errors` docs describe it as reporting "whether any error in `err`'s
  tree matches `target`" by walking `Unwrap()`, which is why it is preferred over `err == target`: a
  wrapped error still matches.

```go
if !errors.Is(err, ErrNegativeQuantity) {
    t.Fatalf("Total(%v) error = %v, want %v", items, err, ErrNegativeQuantity)
}
```

Use **`t.Fatal`/`t.Fatalf`** when the test cannot usefully continue — a setup failure, a nil you are
about to dereference. Use **`t.Error`/`t.Errorf`** for the assertion itself, so one table entry
reports its own mismatch without aborting the remaining cases: per the docs, `Fatal` "is equivalent
to Log followed by FailNow" (stops the goroutine now), `Error` "is equivalent to Log followed by
Fail" (records the failure and keeps going).

Extract shared setup into a helper and call `t.Helper()` at its top — the docs: "Helper marks the
calling function as a test helper function. When printing file and line information, that function
will be skipped," so a failure inside the helper still points at the call site, not the helper's own
line.

**Do not assert on internals.** A test that breaks when someone renames an unexported local variable
is not testing `Total`, it is testing the refactor.

## What to mock, and what to never mock

**In a unit test: nothing.**

The `testing` package documents no mocking framework, no fake clock, no fake RNG. If the function
under test needs one to run, that is the function telling you it has an I/O dependency it should not
have at this layer: either refactor it to take that dependency as a plain argument (an
`io.Writer`, an interface, a passed-in `time.Time`), or **this is not a unit test — it is an
integration test**, and it belongs in `integration.md`.

## Naming

- The function: `TestXxx`, where `Xxx` "does not start with a lowercase letter" — `TestTotal` for the
  function `Total`. This is not a style preference; `go test` only discovers functions matching this
  signature.
- The subtest: the behavior, as a `name` field in the table — the wiki's own examples use plain
  descriptive strings (`"empty string"`, `"one character"`) and pass them straight to `t.Run`. Go
  does not have a "should" convention to avoid; there simply is no prose sentence, just the name.
- `go test -v` prints `--- FAIL: TestTotal/negative_quantity_errors`. Read it as `Total > negative
  quantity errors`. If that does not describe what broke, rename the table entry.
