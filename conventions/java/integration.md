# Java — integration tests

> **Source of this standard:** [Testcontainers for Java](https://java.testcontainers.org/) and the
> [Spring Boot Testing reference](https://docs.spring.io/spring-boot/reference/testing/), including
> its Testcontainers integration (`@Container`, `@ServiceConnection`, `@DynamicPropertySource`).
> Nothing here is a house invention.

## What an integration test *is*

It is the test for the seam. The unit test proved the logic; this one proves the logic still works
**when it talks to the real thing** — a real database, a real HTTP surface.

The line is simple and it is the whole reason this file exists separately:

> **A unit test mocks nothing because it touches nothing.
> An integration test mocks nothing because it touches the real thing.**

Testcontainers exists precisely so you never have to fake the database: "use a containerized
instance of a MySQL, PostgreSQL or Oracle database to test your data access layer code for complete
compatibility, but without requiring complex setup on developers' machines." If you find yourself
mocking the repository in a class called `OrderRepositoryIT`, stop — you have written a unit test
with extra ceremony.

## Where the test file lives

`src/test/java/<package>/<Class>IT.java`. Maven Failsafe — the plugin that runs integration
tests, bound to the `verify` phase, separate from Surefire — picks up classes by its own default
patterns: `**/IT*.java`, `**/*IT.java`, `**/*ITCase.java`. Name it outside those patterns and it
silently never runs. (`<Class>IntegrationTest.java` is the common alternative when a project
configures Failsafe to look for it instead — follow what the project's `pom.xml` already says.)

## What one test looks like

Against a real Postgres, via Spring Boot's own Testcontainers integration:

```java
package com.example.order;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
@SpringBootTest
class OrderRepositoryIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private OrderRepository repository;

    @Test
    void roundTripsAnOrderThroughTheDatabase() {
        Order saved = repository.save(new Order("ada", 20));

        Order found = repository.findById(saved.getId());

        assertThat(found).extracting(Order::getCustomer, Order::getTotal)
            .containsExactly("ada", 20);
    }
}
```

`@ServiceConnection` is Spring Boot's own doc-recommended shortcut: it auto-creates the
`ConnectionDetails` bean and points `spring.datasource.*` at the container, no manual property
wiring. Where a project isn't wired for `@ServiceConnection`, the docs' fallback is
`@DynamicPropertySource`:

```java
@DynamicPropertySource
static void datasourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", postgres::getJdbcUrl);
    registry.add("spring.datasource.username", postgres::getUsername);
    registry.add("spring.datasource.password", postgres::getPassword);
}
```

## What to assert

**Assert the round trip.** Write it, read it back, and prove the shape survived the boundary — the
column that silently truncates, the timestamp that comes back shifted, the enum that comes back as
the wrong ordinal.

- the happy path across the seam
- what happens when the dependency **says no**: a constraint violation, a duplicate key, a 4xx
- what happens when the dependency **is not there**: connection refused, timeout

Do not re-assert the business logic — the unit test already did that, and duplicating it here just
makes a slow test that fails twice for one bug.

## What to mock

**Not the thing under test.** That is the whole point.

- **Your database** → a real one, in a `@Container`. Never an in-memory substitute that behaves
  differently — Testcontainers' own pitch is "complete compatibility," and an in-memory database is
  exactly where that compatibility breaks.
- **Your own HTTP API** → real, through the Spring context (`@SpringBootTest`, `MockMvc` or a live
  `RestTestClient` against `WebEnvironment.RANDOM_PORT`).
- **A third party you do not control** (a payment provider, a partner API) → this you stub, with
  WireMock:

```java
stubFor(get(urlEqualTo("/pricing/v1/rate"))
    .willReturn(aResponse().withStatus(200).withBody("{\"rate\": 1.08}")));
```

You cannot make their sandbox deterministic, and it is not what you are testing.

## Cleanup

Each test leaves the world as it found it. `@Container` as a static field is shared across the test
class's methods by default — truncate between tests, or scope the container per class. A test that
depends on another test's leftovers is not a test, it is a coin flip, and it will fail the day
someone runs the suite in a different order.

## Naming

- The file: the seam. `OrderRepositoryIT.java`, matched by Failsafe's default pattern so it actually
  runs under `mvn verify`.
- The method: the crossing, present tense — `roundTripsAnOrderThroughTheDatabase()`,
  `rejectsADuplicateOrderId()`.
- Say what crosses the boundary, not which method got called.
