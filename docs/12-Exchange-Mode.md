# Document 12 — Exchange Mode

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Overview

Exchange Mode (Mode B) simulates a full exchange environment with real order books, matching, and multi-counterparty execution.

IMPORTANT: Exchange Mode is a simulation tool. It does not claim to exactly replicate DSE's internal systems. All DSE-specific parameters are marked UNVERIFIED where specification is unavailable.

Exchange Mode is implemented in Phase 3.

---

## 2. Components

- Order Validation Engine
- Security Master
- In-Memory Order Book (one per security)
- Matching Engine
- Execution Report Generator
- Trading Session Manager
- Market Data Simulator (basic)

---

## 3. Order Flow

```
Incoming New Order Single
  -> Order Validator
      -> Validate required fields
      -> Validate symbol exists in security master
      -> Validate order type, quantity, price
      -> If invalid: send Order Reject
  -> Assign Exchange OrderID
  -> Persist order to MySQL
  -> Send New Order Acknowledgement
  -> Matching Engine
      -> Attempt to match against opposite order book
      -> Generate Execution Reports for all matched parties
      -> Add remaining quantity to order book if not fully filled
```

---

## 4. Trading Session Management

UNVERIFIED: DSE's actual trading session schedule and identifiers.

Configurable trading sessions:
- PRE_OPEN: orders accepted, no matching.
- OPEN: orders accepted and matched.
- CLOSED: orders rejected.
- HALTED: orders rejected.

---

## 5. Market Data Simulation

Basic market data for Phase 3:
- Last trade price per security.
- Best bid / best ask.
- Available via dashboard.

Full market data feed (MsgType=W, X) is out of scope for Phase 3 unless required.

---

## 6. Multi-Counterparty Support

Multiple OMS clients (FIX sessions) can have resting orders on the same order book.

When a match occurs:
- Both the aggressive (incoming) and passive (resting) parties receive Execution Reports.
- Each Execution Report is sent to the appropriate FIX session.
- If the resting order's session is disconnected: the Execution Report is queued and sent on reconnection (Phase 4 requirement).

---

## 7. Known Limitations

- Order book is in-memory. A crash without graceful shutdown may lose state.
- DSE-specific validation rules are configurable but UNVERIFIED.
- Market data feed is minimal in Phase 3.
- Circuit breaker rules are configurable but UNVERIFIED for DSE.
