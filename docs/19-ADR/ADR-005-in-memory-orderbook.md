# ADR-005 — In-Memory Order Book Design

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** QFL Engineering

---

## Context

The Exchange Mode matching engine requires a data structure to hold resting buy and sell orders per security.

Matching performance is critical: each incoming order may need to scan multiple resting orders.

---

## Decision

Use in-memory sorted data structures for the order book.

Persist all order state changes to MySQL for durability and recovery.

---

## Rationale

- In-memory operations are several orders of magnitude faster than database queries for matching.
- The order book state can be reconstructed from MySQL on application restart by loading all OPEN orders.
- This pattern (in-memory hot path + database cold path) is standard in exchange technology.

---

## Data Structure

Per security, maintain:
- Buy queue: sorted descending by price, then ascending by timestamp. JavaScript array with binary insertion.
- Sell queue: sorted ascending by price, then ascending by timestamp. JavaScript array with binary insertion.

For Phase 3 scale (internal testing), array-based structures are adequate.

If the order book grows beyond several thousand resting orders per security, evaluate a more efficient structure (e.g., a balanced BST or skip list).

---

## Consequences

- **Durability risk:** A crash during normal operation (without graceful shutdown) will lose any order state not yet written to MySQL.
- **Recovery requirement:** On startup, the application must load all OPEN orders from MySQL into the in-memory order book.
- **Graceful shutdown:** On SIGTERM, flush all pending order state to MySQL before stopping.
- **Phase 3 scope:** Implement recovery logic in Phase 3.

---

## Alternative Considered

**Database-backed order book (query MySQL for each match):**
- Simpler recovery (database is always current).
- Too slow for real-time matching.
- **Rejected.**
