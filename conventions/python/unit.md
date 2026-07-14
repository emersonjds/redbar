# Python — unit tests

> **Source of this standard:** the [pytest docs — How-to guides](https://docs.pytest.org/en/stable/how-to/index.html),
> specifically [assertions](https://docs.pytest.org/en/stable/how-to/assert.html),
> [fixtures](https://docs.pytest.org/en/stable/how-to/fixtures.html),
> [parametrize](https://docs.pytest.org/en/stable/how-to/parametrize.html), and
> [monkeypatch](https://docs.pytest.org/en/stable/how-to/monkeypatch.html). Nothing here is a house
> invention — if a rule below is not in those docs, it does not belong in this file.

## Where the test file lives

pytest's own recommended layout is `src/` for the package and `tests/` for the tests, mirroring it:

- `src/order/total.py` → `tests/test_total.py`

Discovery only picks up `test_*.py` (or `*_test.py`) files, `test`-prefixed functions, and
`Test`-prefixed classes with no `__init__`. If the project already lays tests out differently,
**follow the project.** A test outside the discovered pattern does not run, and a convention that
fights discovery is a broken convention.

## What one test looks like

```python
import pytest
from order.total import total


def test_total_sums_the_line_items():
    assert total([{"price": 10, "qty": 2}]) == 20


def test_total_returns_zero_for_an_empty_cart():
    assert total([]) == 0


def test_total_raises_on_negative_quantity():
    with pytest.raises(ValueError, match="negative"):
        total([{"price": 10, "qty": -1}])
```

Three tests, three behaviors, zero setup. That is the shape.

## What to assert

Assert **behavior at the boundaries** — the thing the function promises, where it is most likely to
break:

- the normal case
- the empty / zero / null case
- **every branch** — if the function has an `if`, there are two tests hiding in it
- the error path: `pytest.raises(SomeException)` as a context manager, with `match=` to pin *what*
  it raises (matched with `re.search` against `str(exception)`), not a bare
  `pytest.raises(Exception)`

One behavior per test. Plain `assert` is enough — pytest rewrites it at collection time to show
exactly which side failed (`assert 3 == 4`, `+  where 3 = total(...)`), so there is no
`self.assertEqual`, no assertion library, nothing to import for the assertion itself.

**Do not assert on internals.** No patching a private helper just to spy on it, no asserting call
counts on things that are not the contract. A test that breaks when someone renames a local variable
is a test that gets deleted within a month — and it should be.

## What to mock

**In a unit test: nothing.**

If the function needs a mock to run, that is the code telling you it has an I/O dependency it should
not have. Either the function should be refactored, or **this is not a unit test — it is an
integration test**, and it belongs in `integration.md`.

One exception, from the docs: `monkeypatch` — pytest's own fixture for swapping an attribute, an
environment variable, or a dict entry for the duration of one test, with automatic teardown
regardless of the test outcome. Even here the docs' own preference is to make the dependency an
explicit argument instead of patching it globally; reach for `monkeypatch` when that is not
practical, not as a first move. The docs also say plainly: do not monkeypatch builtins like `open` —
it can break pytest's own internals.

## Naming

- Fixture setup lives in `@pytest.fixture`, requested by a test simply by naming it as a parameter —
  never a `setUp`/`tearDown` method; that is exactly the ceremony fixtures replace.
- Test function: `test_` + what it proves — the docs' own examples name tests this way
  (`test_zero_division`, `test_eval`, `test_getssh`), not as narrations of what "should" happen.
- Multiple inputs, one behavior → one `@pytest.mark.parametrize("arg,expected", [...])`, not several
  copy-pasted tests. pytest builds the test ID from the parameter values (e.g. `test_eval[3+5-8]`),
  so keep them short and readable.
