# ADR-001 — Selection of Node.js as Runtime

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** QFL Engineering

---

## Context

DSE-ME Simulator is a TCP FIX acceptor that must handle concurrent connections efficiently.

The technology stack was specified in the project requirements.

---

## Decision

Use Node.js LTS (v22) as the runtime.

---

## Rationale

- Mandated by the project specification.
- Node.js is purpose-built for high-throughput I/O-bound operations. A FIX acceptor handling multiple TCP connections simultaneously benefits from the event-loop model.
- Native `net` module provides a solid TCP server foundation without additional dependencies.
- The team has existing JavaScript expertise.
- Large npm ecosystem for required libraries.

---

## Alternatives Considered

- **Java (QuickFIX/J):** Production-grade FIX engine. Rejected — not part of the team's primary stack, and heavyweight for an internal tool.
- **Go:** Excellent concurrency, good for TCP servers. Rejected — team expertise and project specification point to Node.js.
- **Python:** Large ecosystem. Rejected — GIL limitations for concurrent TCP handling, project specification requires Node.js.

---

## Consequences

- CPU-bound operations (large order book matching) may block the event loop. Monitor and migrate to Worker Threads if needed in Phase 3.
- Memory management requires care for long-running TCP sessions.

---

## Known Risks

- Large order books in Phase 3 may require event loop management.
