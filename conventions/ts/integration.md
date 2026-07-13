# TypeScript / JavaScript — integration tests

> **Source of this standard:** the [Testcontainers for Node docs](https://node.testcontainers.org/),
> the [supertest docs](https://github.com/ladjs/supertest), and the
> [MSW docs](https://mswjs.io/docs/) for the HTTP-boundary case. Nothing here is a house invention.

## What an integration test *is*

It is the test for the seam. The unit test proved the logic; this one proves the logic still works
**when it talks to the real thing** — a real database, a real HTTP server, a real queue.

The line is simple and it is the whole reason this file exists separately:

> **A unit test mocks nothing because it touches nothing.
> An integration test mocks nothing because it touches the real thing.**

If you find yourself mocking the database in a file called "integration test", stop — you have
written a unit test with extra ceremony.

## Where the test file lives

`test/integration/<subject>.test.ts`. Separate from unit tests, because they are slower and usually
run under a different command in CI.

## What one test looks like

Against a real database:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { OrderRepository } from '../../src/db/OrderRepository.js'

let container: StartedPostgreSqlContainer
let repo: OrderRepository

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  repo = new OrderRepository(container.getConnectionUri())
  await repo.migrate()
}, 60_000) // pulling an image is slow — say so, do not fight the default timeout

afterAll(async () => {
  await container.stop()
})

it('round-trips an order through the database', async () => {
  const saved = await repo.save({ customer: 'ada', total: 20 })

  const found = await repo.findById(saved.id)

  expect(found).toMatchObject({ customer: 'ada', total: 20 })
})
```

Against a real HTTP surface:

```ts
import request from 'supertest'
import { expect, it } from 'vitest'
import { app } from '../../src/app.js'

it('rejects an order with no items', async () => {
  const res = await request(app).post('/orders').send({ items: [] })

  expect(res.status).toBe(422)
  expect(res.body.error).toMatch(/at least one item/)
})
```

## What to assert

**Assert the round trip.** Write it, read it back, and prove the shape survived the boundary. That
is the bug this test exists to catch — the column that silently truncates, the date that comes back
as a string, the number that comes back as a string.

- the happy path across the seam
- what happens when the dependency **says no**: a constraint violation, a 4xx, a duplicate key
- what happens when the dependency **is not there**: connection refused, timeout. If the code has a
  retry or a fallback, this is the only place it can be tested at all.

Do not re-assert the business logic — the unit test already did that, and duplicating it here just
makes a slow test that fails twice for one bug.

## What to mock

**Not the thing under test.** That is the whole point.

- **Your database** → a real one, in a container. Never a mock, never an in-memory substitute that
  behaves differently (an in-memory SQLite is not Postgres, and the bug you are looking for is
  exactly in the difference).
- **Your own HTTP API** → real, via supertest against the real app instance.
- **A third party you do not control** (Stripe, a partner API) → **this** you stub, with MSW. You
  cannot make their sandbox deterministic and it is not what you are testing.

## Cleanup

Each test leaves the world as it found it. Truncate between tests, or use a fresh container per
file. **A test that depends on another test's leftovers is not a test — it is a coin flip**, and it
will fail the day someone runs the suite in a different order.

## Naming

- The file: the seam. `test/integration/OrderRepository.test.ts`.
- The test: the crossing, present tense — `it('round-trips an order through the database')`,
  `it('rejects an order with no items')`.
- Say what crosses the boundary, not which method got called.
