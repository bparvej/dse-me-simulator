# ADR-006 — Price-Time Priority as Matching Algorithm

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** QFL Engineering

---

## Context

The Exchange Mode matching engine needs a matching algorithm.

DSE's exact internal matching algorithm is unknown.

---

## Decision

Implement price-time priority as the initial matching algorithm.

Make the algorithm selection configurable.

---

## Rationale

- Price-time priority is the most common matching algorithm in equity markets worldwide.
- It is a reasonable default for simulation purposes.
- DSE likely uses a price-time (or equivalent pro-rata hybrid) algorithm. UNVERIFIED.
- Configurable algorithm selection allows future substitution if DSE specifics are confirmed.

---

## Rules

**Buy priority:**
1. Higher price has priority.
2. At equal price, earlier arrival time has priority.

**Sell priority:**
1. Lower price has priority.
2. At equal price, earlier arrival time has priority.

**Match condition:** best bid price >= best ask price.

**Execution price:** the resting (passive) order's price.

---

## Consequences

- This algorithm may not exactly replicate DSE's matching behaviour.
- Document clearly that the matching engine is a simulation, not a DSE replica.
- Exchange-specific rules (tick size, lot size, price bands) are configurable and marked UNVERIFIED.

---

## Alternative Considered

**Pro-rata allocation:** used by some derivative exchanges. Rejected as default — less common for equity markets and adds complexity.

**FIFO (pure time priority):** a simplification. Price-time priority is more realistic and subsumes FIFO at equal prices.
