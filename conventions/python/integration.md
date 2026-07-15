# Python — integration tests

> **Source of this standard:** [Testcontainers for Python](https://testcontainers-python.readthedocs.io/)
> for the real dependency, [httpx](https://www.python-httpx.org/) for the HTTP boundary, and
> [respx](https://lundberg.github.io/respx/) for the one thing you stub. Nothing here is a house
> invention.

## What an integration test *is*

It is the test for the seam. The unit test proved the logic; this one proves the logic still works
**when it talks to the real thing** — a real database, a real HTTP application.

The line is simple and it is the whole reason this file exists separately:

> **A unit test mocks nothing because it touches nothing.
> An integration test mocks nothing because it touches the real thing.**

If you find yourself mocking the database in a file called "integration test", stop — you have
written a unit test with extra ceremony.

## Where the test file lives

`tests/integration/test_<subject>.py`. Separate from unit tests, because they are slower — spinning
up a container is not free — and usually run under a different `pytest` invocation in CI.

## What one test looks like

Against a real database:

```python
import pytest
import sqlalchemy
from testcontainers.postgres import PostgresContainer
from order.repository import OrderRepository


@pytest.fixture(scope="module")
def repo():
    with PostgresContainer("postgres:16") as postgres:
        engine = sqlalchemy.create_engine(postgres.get_connection_url())
        repo = OrderRepository(engine)
        repo.migrate()
        yield repo


def test_round_trips_an_order_through_the_database(repo):
    saved = repo.save({"customer": "ada", "total": 20})

    found = repo.find_by_id(saved["id"])

    assert found["customer"] == "ada"
    assert found["total"] == 20
```

Against a real HTTP surface — no live server, httpx talks straight into the ASGI/WSGI app:

```python
import httpx
from order.app import app


def test_rejects_an_order_with_no_items():
    transport = httpx.WSGITransport(app=app)  # ASGITransport + httpx.AsyncClient for async apps

    with httpx.Client(transport=transport, base_url="http://testserver") as client:
        res = client.post("/orders", json={"items": []})

    assert res.status_code == 422
    assert "at least one item" in res.json()["error"]
```

## What to assert

**Assert the round trip.** Write it, read it back, and prove the shape survived the boundary. That
is the bug this test exists to catch — the column that silently truncates, the field that comes back
a string instead of a number.

- the happy path across the seam
- what happens when the dependency **says no**: a constraint violation, a 422, a duplicate key
- what happens when the dependency **is not there**: connection refused, timeout. If the code has a
  retry or a fallback, this is the only place it can be tested at all.

Do not re-assert the business logic — the unit test already did that, and duplicating it here just
makes a slow test that fails twice for one bug.

## What to mock

**Not the thing under test.** That is the whole point.

- **Your database** → a real one, in a container, via `testcontainers`. Never a mock, never an
  in-memory substitute that behaves differently (SQLite is not Postgres, and the bug you are looking
  for is exactly in the difference).
- **Your own HTTP API** → real. httpx can drive an ASGI or WSGI app directly through
  `httpx.ASGITransport` / `httpx.WSGITransport` — no live server needed, but every route, every
  middleware, every serializer still runs for real.
- **A third party you do not control** (Stripe, a partner API) → **this** you stub, with `respx`
  (`@respx.mock`, or the `respx_mock` pytest fixture). You cannot make their sandbox deterministic
  and it is not what you are testing.

## Cleanup

Each test leaves the world as it found it. Scope the container fixture to the module (start once,
reuse, `yield` hands it to every test) and truncate between tests, or start a fresh container per
file if state must not leak. **A test that depends on another test's leftovers is not a test — it is
a coin flip**, and it will fail the day someone runs the suite in a different order.

## Naming

- The file: the seam. `tests/integration/test_order_repository.py`.
- The test: the crossing, present tense — `test_round_trips_an_order_through_the_database`,
  `test_rejects_an_order_with_no_items`.
- Say what crosses the boundary, not which method got called.
