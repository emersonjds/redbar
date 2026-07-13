---
name: redbar.init
description: Set a project up so redbar can inspect it. Detects the language and the test runner it actually uses, then proposes the test libraries that are missing (unit, integration, e2e) and prints the exact install command. It NEVER installs anything and never edits a manifest — the human approves and runs the command. Use when redbar reports no coverage report, when a project has no test setup, or when asked how to start testing a repo.
argument-hint: Optional repo path (defaults to the current project)
user-invocable: true
---

## User Input

```text
$ARGUMENTS
```

Optional. A repo path.

## The one rule

**Never install a dependency. Never edit `package.json`, `pom.xml`, `Cargo.toml`, `composer.json`, or any other manifest.**

Not "ask first, then install". Not "install if it seems safe". **Print the command and stop.** Editing someone's manifest unasked is a rejected PR at best and a supply-chain incident at worst. The human presses enter, or does not.

This holds even if the human seems to want you to move fast. Print the command.

## Outline

1. **Run init** from the project root:

   ```bash
   npx redbar init $ARGUMENTS
   ```

   Fall back to `npx tsx src/cli.ts init $ARGUMENTS` if `redbar` is not on PATH.

2. **Report what it proposes**, exactly:
   - which language and runner it detected (and how — which manifest file gave it away)
   - which test libraries are missing, grouped by layer (unit / integration / e2e)
   - **the exact install command**, verbatim, in a copyable block
   - the coverage command to run afterwards

3. **Stop there.** Do not run the install. Do not run the coverage command either — it can be slow, and it is the human's call.

4. If the human explicitly says "go ahead, install it", you may run the install command **exactly as printed** — no extra packages, no version bumps, no "while I'm here" additions.

## What to say about the libraries

The libraries redbar proposes are the standard ones for that ecosystem, not exotic picks. If the human asks why a given library:

- The unit libs are the runner the project already uses, plus its coverage reporter — redbar needs the coverage report to exist at all.
- The integration libs are the ones the library's own docs point at (Testcontainers for Spring, httpx for Python, supertest for Node).
- The e2e lib is Playwright, in every ecosystem that has a binding.

If the project already has a different but equivalent library, say so and leave it alone. The goal is a coverage report redbar can read, not a specific dependency list.
