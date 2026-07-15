# Rust — unit tests

> **Source of this standard:** [The Rust Book, ch. 11.1 — Writing Tests](https://doc.rust-lang.org/book/ch11-01-writing-tests.html).
> Nothing here is a house invention — if a rule below is not on that page, it does not belong in
> this file.

## Where the test file lives

In the same file as the code, at the bottom, inside a `#[cfg(test)] mod tests` block:

```rust
// src/order.rs
pub fn total(items: &[LineItem]) -> u32 {
    // ...
}

#[cfg(test)]
mod tests {
    use super::*;

    // tests go here
}
```

No separate file, no separate directory — that is the defining Rust idiom, and it is different from
most languages on purpose. `#[cfg(test)]` tells the compiler to build this module only when running
`cargo test`; it costs nothing in `cargo build`. `use super::*` pulls in everything from the enclosing
module, private items included.

## What one test looks like

```rust
pub struct LineItem {
    pub price: u32,
    pub qty: i32,
}

pub fn total(items: &[LineItem]) -> u32 {
    items
        .iter()
        .map(|item| {
            assert!(item.qty >= 0, "negative quantity: {}", item.qty);
            item.price * item.qty as u32
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sums_the_line_items() {
        let items = vec![LineItem { price: 10, qty: 2 }];
        assert_eq!(total(&items), 20);
    }

    #[test]
    fn returns_zero_for_an_empty_cart() {
        assert_eq!(total(&[]), 0);
    }

    #[test]
    #[should_panic(expected = "negative quantity")]
    fn panics_on_a_negative_quantity() {
        total(&[LineItem { price: 10, qty: -1 }]);
    }
}
```

Three tests, three behaviors, zero setup. That is the shape.

## What to assert — and what NOT to assert

Assert **behavior at the boundaries**:

- the normal case
- the empty / zero case
- **every branch** — an `if` in the function under test is two tests waiting to be written
- the panic path, with `#[should_panic(expected = "negative quantity")]` — the `expected` string
  matches a substring of the panic message, not the whole thing. A bare `#[should_panic]` with no
  `expected` passes on *any* panic, including the wrong one; the docs' own example prefers
  `expected`.

For a function that returns `Result` instead of panicking, a test can return `Result<(), E>` and use
`?`:

```rust
#[test]
fn parses_a_valid_order() -> Result<(), String> {
    let order = parse_order("ada,20")?;
    assert_eq!(order.customer, "ada");
    Ok(())
}
```

This lets `?` propagate a parse failure as a test failure instead of an `unwrap()` panic. Per the
docs, a test written this way **cannot** also carry `#[should_panic]` — the two mechanisms are
mutually exclusive; to test the error path, assert on the `Err` value directly instead.

`assert_eq!` and `assert_ne!` print both sides (`left` / `right`) on failure — prefer them over bare
`assert!(a == b)`, which only tells you the comparison was false, not what the values were. All three
macros take an optional format string for a custom failure message: `assert_eq!(total(&items), 20,
"got {actual}")`.

**Do not assert on internals** that are not the function's contract — a test that breaks when someone
renames a local variable inside `total` is not testing `total`, it is testing the refactor.

## What to mock, and what to never mock

**In a unit test: nothing.**

The Rust Book does not describe a mocking framework, a fake clock, or a fake RNG anywhere in this
chapter — there is no exception carved out here the way Vitest's docs carve one for fake timers. So
we do not invent one either. If the function under test needs a mock to run, that is the function
telling you it has an I/O dependency it should not have at this layer: either it gets refactored to
take that dependency as a plain argument, or **this is not a unit test — it is an integration test**,
and it belongs in `integration.md`.

## Naming

- The module: `mod tests`, exactly as the book writes it every time — there is no reason to invent a
  different name.
- The function: the behavior, present tense, snake_case, no `test_` prefix. The `#[test]` attribute
  already marks it as a test; the book's own examples are named `it_works`, `greater_than_100`,
  `larger_can_hold_smaller` — not `test_it_works`.
- The failure output is `module::tests::sums_the_line_items ... FAILED`. Read it out loud. If it does
  not say what broke, rename it.
