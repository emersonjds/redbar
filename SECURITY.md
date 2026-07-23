# Security Policy

## Attack surface

redbar has **zero runtime dependencies** — on purpose. A security review of redbar is a review of
redbar, not of a third-party tree. The code that runs on your machine is what's in `src/`, and
nothing more.

`redbar mcp` speaks JSON-RPC on stdin/stdout and opens no network port. Only `redbar execute` calls
a model, and it refuses to run on a dirty working tree.

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Use
[GitHub private security advisories](https://github.com/emersonjds/redbar/security/advisories/new)
or contact **[@emersonjds](https://github.com/emersonjds)** directly.

Say what you found, how to reproduce it, and the impact you see. We respond fast, and we credit
reporters who want it.

## Supported versions

redbar is pre-1.0. Fixes go to the latest published version.
