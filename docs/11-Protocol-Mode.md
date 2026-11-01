# Document 11 — Protocol Mode

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Overview

Protocol Mode (Mode A) simulates FIX exchange responses using a configurable scenario engine.

No actual order matching occurs in Protocol Mode.

Use Protocol Mode for:
- Testing OMS FIX session state management.
- Testing order lifecycle event handling.
- Testing execution report parsing.
- Testing cancel and replace workflows.
- Testing rejection handling.
- Testing timing and fill sequences.

---

## 2. Scenario Engine

A scenario is a named configuration that defines how the simulator responds to a matching order.

When an order is received in Protocol Mode:
1. The Scenario Engine evaluates the order against all active scenarios.
2. The first matching scenario is selected.
3. If no scenario matches, the default scenario is executed.
4. The scenario steps are executed sequentially with their configured delays.

---

## 3. Scenario Matching

Scenarios can be matched by:

| Criteria | Description |
|---|---|
| ANY | Matches all orders. Used for the default scenario. |
| SYMBOL | Matches orders for a specific symbol. |
| SYMBOL + SIDE | Matches orders for a specific symbol and side (1=Buy, 2=Sell). |

The first active matching scenario is selected. Scenario priority is determined by order in the database.

---

## 4. Scenario Step Types

| Step Type | Description |
|---|---|
| ACK | Send New Order Acknowledgement (ExecType=0, OrdStatus=0). |
| PARTIAL_FILL | Send Partial Fill Execution Report (ExecType=F, OrdStatus=1). |
| FULL_FILL | Send Full Fill Execution Report (ExecType=F, OrdStatus=2). |
| REJECT | Send Order Reject (ExecType=8, OrdStatus=8). |
| CANCEL_ACK | Send Cancel Acknowledgement (ExecType=4). |
| CANCEL_REJECT | Send Order Cancel Reject (MsgType=9). |

---

## 5. Example Scenario

Scenario: "Standard Partial Fill"

Steps:
1. ACK — delay: 0ms
2. PARTIAL_FILL — fillQtyPct=30%, delay: 2000ms
3. PARTIAL_FILL — fillQtyPct=20%, delay: 3000ms
4. FULL_FILL — fillQtyPct=50%, delay: 5000ms

Given: Buy 100 @ 225.50

Response sequence:
- t=0ms: Execution Report (ExecType=0, OrdStatus=0, CumQty=0, LeavesQty=100)
- t=2000ms: Execution Report (ExecType=F, OrdStatus=1, LastQty=30, LastPx=225.50, CumQty=30, LeavesQty=70)
- t=5000ms: Execution Report (ExecType=F, OrdStatus=1, LastQty=20, LastPx=225.50, CumQty=50, LeavesQty=50)
- t=10000ms: Execution Report (ExecType=F, OrdStatus=2, LastQty=50, LastPx=225.50, CumQty=100, LeavesQty=0)

---

## 6. Fill Price Calculation

Fill price in Protocol Mode is determined by:

1. If `fillPriceOffset` is 0: use the order's limit price.
2. If `fillPriceOffset` is set: use `limitPrice + fillPriceOffset`.
3. If the order is a market order: use a configurable default fill price (configurable per scenario).

---

## 7. CumQty and LeavesQty Tracking

Protocol Mode tracks CumQty and LeavesQty for each order throughout scenario execution.

Each PARTIAL_FILL step calculates the fill quantity as:
- `fillQtyFixed` if set, or
- `fillQtyPct / 100 * OrderQty` rounded to whole units.

LeavesQty = OrderQty - CumQty after each fill.

The final step must result in LeavesQty=0 for a FULL_FILL.

If scenario fill quantities do not sum to 100%, the last FULL_FILL step fills the remaining quantity.

---

## 8. Cancel and Replace in Protocol Mode

When a Cancel Request arrives:
- If the order has an associated RUNNING ScenarioExecution: cancel pending steps.
- Send Cancel Acknowledgement.

When a Replace Request arrives:
- If the order has RUNNING steps: cancel pending steps.
- Create a new order record for the replacement.
- Send Replace Acknowledgement.
- If scenario match applies: execute replacement scenario.

---

## 9. Isolation from Exchange Mode

Protocol Mode must never call any Exchange Mode components:
- No order book access.
- No matching engine calls.
- No market data interaction.

An order processed in Protocol Mode must never generate a matching-engine fill.

---

## 10. DSE Certification Test Suite Integration

Protocol Mode provides native, deterministic scenario execution for all 60 official DSE FIX Certification Test Cases (see [docs/20-DSE-Certification-Test-Cases.md](docs/20-DSE-Certification-Test-Cases.md)):

- **Session & Transport Scenarios (`S1` – `S12`):** First logon PositionReport sequences, gap triggers, ResendRequest simulations, forced SequenceReset gaps, and session rejects.
- **Market Order Scenarios (`M1` – `M12`):** Market At Best conversion, Private order custody and release, IOC/FOK expiration, and rejection with `37=NONE`.
- **Limit Order Scenarios (`L1` – `L19`):** Circuit breaker limits, MinQty validations, 3-stage amendments, and iceberg slice display.
- **Block Board Scenarios (`B1` – `B11`):** Block board rules, WholeOrNone enforcement, 500k BDT checks, and IOC expiration.
- **Misc Special Cases (`Z1` – `Z6`):** Buy-In board sell-only rules, SME Qualified Investor enforcement, and gateway failover emulation.

