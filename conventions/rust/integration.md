# Rust — integration tests

> **Source of this standard:** [The Rust Book, ch. 11.3 — Test Organization](https://doc.rust-lang.org/book/ch11-03-test-organization.html),
> [Testcontainers-rs](https://docs.rs/testcontainers/) for a real database, and [reqwest](https://docs.rs/reqwest/)
> against a real server, driven with [tokio](https://docs.rs/tokio/). Nothing here is a house
> invention.

## What an integration test *is*

The Rust Book draws the line by **where the file lives**, and nowhere else:

> **A unit test lives in a `#[cfg(test)] mod` inside `src/` — it mocks nothing because it touches
> nothing outside the module.
> An integration test lives in the top-level `tests/` directory — it mocks nothing because it
> touches the real thing.**

If you find yourself reaching for a fake database inside a file under `tests/`, stop — you have
written a unit test with extra ceremony and put it in the wrong directory.

## Where the test file lives

`tests/<subject>.rs`, next to `src/`, not inside it:

```
my_crate
├── Cargo.toml
├── src
│   └── lib.rs
└── tests
    └── order_repository.rs
```

Each file directly under `tests/` is compiled as its **own separate crate** — no `#[cfg(test)]`
needed there, `cargo test` builds every one of them. That also means each file only sees the crate's
**public API**: `use my_crate::OrderRepository;`, nothing private.

Shared setup code goes in `tests/common/mod.rs`, not `tests/common.rs` — a file directly under
`tests/` is treated as a test crate and shows up in the test run; a file one directory deeper is not.
Naming it `mod.rs` is what keeps it out of the test list while still being `mod common;`-importable
from a real test file.

A project with only `src/main.rs` and no `src/lib.rs` cannot have integration tests at all: a binary
crate exposes nothing for `tests/` to import. Move the logic into `src/lib.rs` and call it from
`main.rs` first.

## What one test looks like

Against a real database, with Testcontainers-rs:

```rust
// tests/order_repository.rs
use my_crate::db::{Order, OrderRepository};
use testcontainers::{
    core::{IntoContainerPort, WaitFor},
    runners::AsyncRunner,
    GenericImage,
};

#[tokio::test]
async fn round_trips_an_order_through_the_database() {
    let container = GenericImage::new("postgres", "16-alpine")
        .with_exposed_port(5432.tcp())
        .with_wait_for(WaitFor::message_on_stdout(
            "database system is ready to accept connections",
        ))
        .with_env_var("POSTGRES_PASSWORD", "test")
        .start()
        .await
        .expect("postgres container failed to start");

    let port = container.get_host_port_ipv4(5432).await.expect("no mapped port");
    let repo = OrderRepository::connect(&format!(
        "postgres://postgres:test@127.0.0.1:{port}/postgres"
    ))
    .await;
    repo.migrate().await;

    let saved = repo.save(Order { customer: "ada".into(), total: 20 }).await;
    let found = repo.find_by_id(saved.id).await.expect("order not found");

    assert_eq!(found.customer, "ada");
    assert_eq!(found.total, 20);
}
```

Against a real HTTP surface, with reqwest:

```rust
// tests/orders_api.rs
use my_crate::app;
use reqwest::StatusCode;

#[tokio::test]
async fn rejects_an_order_with_no_items() {
    let addr = app::spawn().await; // starts the real server on a random port

    let res = reqwest::Client::new()
        .post(format!("http://{addr}/orders"))
        .json(&serde_json::json!({ "items": [] }))
        .send()
        .await
        .expect("request failed");

    assert_eq!(res.status(), StatusCode::UNPROCESSABLE_ENTITY);
}
```

## What to assert — and what NOT to assert

**Assert the round trip.** Write it, read it back, prove the shape survived the boundary — the column
that silently truncates, the enum that comes back as the wrong variant.

- the happy path across the seam
- what happens when the dependency **says no** — a constraint violation, a 4xx, a duplicate key
- what happens when the dependency **is not there** — connection refused, timeout, if the code has a
  retry or a fallback this is the only place it can be exercised at all

Do not re-assert business logic the unit test already covers — that just makes a slow test that fails
twice for one bug.

## What to mock, and what to never mock

**Not the thing under test.** That is the whole point of putting the file in `tests/` instead of
`src/`.

- **Your database** → a real one, in a container, via Testcontainers-rs. Never a mock, never an
  in-memory substitute that behaves differently from what runs in production.
- **Your own HTTP API** → real, via `reqwest` against a real, running instance of the server.
- **A third party you do not control** → stub it at the network boundary. Neither of the two docs
  cited above names a mocking crate for this case, so this file does not prescribe one — use whatever
  the project already has. What does not change: you cannot make their sandbox deterministic, and it
  is not what this test exists to verify.

## Cleanup

Each test leaves the world as it found it. A `ContainerAsync` from Testcontainers-rs stops when its
handle is dropped — do not hold it past the scope that needs it, and do not assume a container
outlives its handle. Truncate between tests, or start a fresh container per file. A test that depends
on another test's leftovers is not a test — it is a coin flip that will fail the day the suite runs in
a different order.

## Naming

- The file: the seam. `tests/order_repository.rs`.
- The test: the crossing, present tense, snake_case — `round_trips_an_order_through_the_database`,
  `rejects_an_order_with_no_items`.
- Say what crosses the boundary, not which method got called.
