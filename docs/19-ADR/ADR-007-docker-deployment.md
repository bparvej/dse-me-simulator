# ADR-007 — Docker Deployment Strategy

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** QFL Engineering

---

## Context

The simulator must be deployable on a Linux VPS and potentially on other platforms later.

---

## Decision

Use Docker and Docker Compose for containerisation.

Use volume mounts for persistent storage (FIX archive, MySQL data).

---

## Rationale

- Docker provides deployment independence across environments.
- Docker Compose simplifies multi-service management (app + MySQL).
- Volume mounts separate durable data from the container lifecycle.
- Standard and well-understood in the team's deployment context.

---

## Consequences

- The `storage/fix-archive` directory MUST be mounted as a Docker volume pointing to durable host storage.
- Do NOT use Docker's built-in ephemeral writable layer for archive files.
- MySQL data directory MUST be a named volume or host mount.
- Graceful shutdown (SIGTERM handling) is essential to avoid data loss on container stop.

---

## Deployment Independence

The application must not have any hard dependencies on Docker:
- The application can be run directly with `npm start` on any Node.js v22 host.
- Docker is a packaging and deployment tool, not a required runtime dependency.
