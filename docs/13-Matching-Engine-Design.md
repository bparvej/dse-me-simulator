# Document 13 — Matching Engine Design

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Overview

The Matching Engine is a Phase 3 component of DSE-ME Simulator.

It operates exclusively in Exchange Mode (Mode B).

It matches incoming orders against resting orders in the order book using price-time priority.

IMPORTANT: This matching engine is a simulation tool for testing purposes. It does not claim to exactly replicate DSE's internal matching engine or validation rules. All exchange-specific parameters are configurable and marked UNVERIFIED where DSE specification is unavailable.

---

## 2. Algorithm: Price-Time Priority

Price-time priority is the initial matching algorithm.

Rules:
- For buy orders: higher bid prices have priority. At equal prices, earlier orders have priority.
- For sell orders: lower ask prices have priority. At equal prices, earlier orders have priority.
- A match occurs when the best bid price >= the best ask price.
- The execution price is determined by the resting order's price (passive side).

---

## 3. Order Book Structure

```
Per security, maintain two sorted queues:

BUY queue (sorted descending by price, then ascending by time):
  [Price=225.50, Time=09:01:00, Qty=100, OrderID=001]
  [Price=225.00, Time=09:00:00, Qty=200, OrderID=002]
  [Price=224.50, Time=09:01:30, Qty=50,  OrderID=003]

SELL queue (sorted ascending by price, then ascending by time):
  [Price=225.50, Time=09:00:30, Qty=50,  OrderID=004]
  [Price=226.00, Time=09:00:00, Qty=100, OrderID=005]
  [Price=226.50, Time=09:01:00, Qty=200, OrderID=006]
```

---

## 4. Match Flow

```
Incoming Order arrives
  -> Order Validator validates order
  -> If invalid: send Order Reject, return
  -> Assign Exchange OrderID
  -> Send New Order Acknowledgement (ExecType=0, OrdStatus=0)
  -> Enter matching loop:
       while (leavesQty > 0 && opposite side has resting orders):
         bestOpposite = peek opposite queue top
         if match condition not met: break
         executeQty = min(leavesQty, bestOpposite.leavesQty)
         execPrice = bestOpposite.price
         -> Generate Execution Report for incoming order (ExecType=F)
         -> Generate Execution Report for resting order (ExecType=F)
         -> Update CumQty and LeavesQty for both orders
         -> If resting order fully filled: remove from order book
         -> If resting order partially filled: update quantity in order book
  -> If leavesQty > 0: add remaining quantity to order book as resting order
```

---

## 5. Execution Report Generation for Matched Orders

When a match occurs, generate two Execution Reports:

1. **For the incoming (aggressive) order:**
   - ExecType=F (Trade)
   - OrdStatus=1 (Partially Filled) or 2 (Filled)
   - LastQty=executeQty
   - LastPx=execPrice
   - CumQty updated
   - LeavesQty updated
   - Send to incoming order's FIX session.

2. **For the resting (passive) order:**
   - ExecType=F (Trade)
   - OrdStatus=1 (Partially Filled) or 2 (Filled)
   - LastQty=executeQty
   - LastPx=execPrice
   - CumQty updated
   - LeavesQty updated
   - Send to resting order's FIX session.

Both execution reports are generated atomically before either is sent.

---

## 6. Market Order Handling

Market orders (OrdType=1) match at the best available price.

If no resting orders exist on the opposite side: reject with reason "No liquidity" (configurable behaviour — UNVERIFIED for DSE).

---

## 7. Order Cancellation

On receipt of Order Cancel Request (F):

1. Locate the order in the order book by ClOrdID / OrderID.
2. If found and cancellable: remove from order book. Send Cancel Acknowledgement (ExecType=4, OrdStatus=4).
3. If not found: send Order Cancel Reject (MsgType=9) with CxlRejReason=1 (Unknown Order).
4. If order is already fully filled: send Order Cancel Reject with CxlRejReason=0 (Too Late to Cancel).

---

## 8. Order Modification (Replace)

On receipt of Order Cancel/Replace Request (G):

1. Locate the resting order.
2. Validate the replacement parameters.
3. If price changed: order loses time priority (re-inserted as new).
4. If quantity reduced only: order retains time priority.
5. Send Replace Acknowledgement (ExecType=5).
6. If cannot replace: send Order Cancel Reject (MsgType=9) with CxlRejReason=3.

UNVERIFIED: DSE's specific rules for replace priority treatment. Implement as configurable.

---

## 9. In-Memory Order Book vs. Persistence

The order book operates in-memory for performance.

Persistence strategy (Phase 3):
- Every order state change is written to the Orders table in MySQL.
- Every execution is written to the Executions table.
- On application restart: reload open orders from MySQL into the in-memory order book.

WARNING: The in-memory order book is NOT automatically durable. A crash without graceful shutdown may lose orders received after the last database write. Implement graceful shutdown order book flush.

---

## 10. Configurable Parameters

| Parameter | Default | Notes |
|---|---|---|
| matchingAlgorithm | PRICE_TIME_PRIORITY | Extensible for future algorithms |
| rejectMarketOrdersWithNoLiquidity | true | UNVERIFIED for DSE |
| allowSelfMatch | false | UNVERIFIED for DSE |
| maxOrderQty | configurable | UNVERIFIED for DSE |
| minOrderQty | configurable | UNVERIFIED for DSE |
| priceDecimalPlaces | 2 | UNVERIFIED for DSE |
| qtyDecimalPlaces | 0 | UNVERIFIED for DSE |
