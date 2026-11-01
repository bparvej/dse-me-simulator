# Document 00 — Project Overview

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Status: Architecture and Documentation Phase
Last Updated: 2026-11-01

---

## 1. Purpose

DSE-ME Simulator is an internal engineering tool developed by QFL Engineering to simulate the exchange-side FIX (Financial Information eXchange) interface and selected trading behaviours of the Dhaka Stock Exchange (DSE).

The primary goal is to provide a realistic simulation environment that enables QFL developers to:

- Connect and test their OMS FIX engines against a simulated exchange.
- Validate FIX session state management and protocol correctness.
- Test the full order lifecycle including acknowledgement, partial fills, full fills, cancellations, and replacements.
- Test error-handling paths including rejections, invalid sequences, and network interruptions.
- Verify that OMS applications correctly process execution reports and update internal state.
- Develop and test matching engine integration without requiring access to the DSE live or UAT environment.

---

## 2. Problem Statement

QFL currently does not have access to a DSE UAT or mock exchange environment.

This creates the following problems:

- Developers cannot test FIX session connectivity without connecting to the live DSE environment.
- Order lifecycle testing requires live market conditions.
- Protocol-level edge cases (invalid sequences, rejections, partial fills) cannot be reliably reproduced.
- Multiple developers cannot simultaneously test against a single shared exchange endpoint.
- Testing is risky in a live environment.

---

## 3. Scope

### In Scope (Phase 0 Architecture)

- FIX TCP acceptor implementing FIXT 1.1 session protocol.
- FIX 5.0 application-level message handling.
- FIX session management (Logon, Logout, Heartbeat, Test Request, Resend Request, Sequence Reset).
- FIX message archive (inbound and outbound, raw byte preservation).
- Protocol Mode: configurable scenario-based FIX response simulation.
- Exchange Mode: order book, price-time priority matching, execution reports.
- MySQL persistence for session metadata, orders, executions, and configuration.
- Web dashboard for operational monitoring and administration.
- Administration REST API for configuration and control.
- Automated test suite.
- Docker deployment.

### Out of Scope

- Actual DSE connectivity (this is a simulator, not a proxy).
- Market data feeds from DSE.
- Equity settlement or clearing simulation.
- Regulatory reporting.
- FIX 4.x protocol support (unless required by confirmed DSE profile).
- Any REST, JSON, or WebSocket substitution for FIX communication between the simulator and OMS.

---

## 4. Integration Architecture

The target integration architecture is:

```
+-----------+    FIX (FIXT 1.1 / FIX 5.0)    +-------------------+
|    OMS    |  =============================>  |                   |
| FIX       |         TCP Socket              |  DSE-ME Simulator |
| Initiator |  <=============================  |  (FIX Acceptor)   |
+-----------+                                  +-------------------+
                                                        |
                                               MySQL 8 Database
                                               Filesystem Archive
                                               Web Dashboard
```

Key constraints:
- Communication between OMS and simulator MUST use FIX over TCP.
- The simulator MUST act as the FIX acceptor (server).
- The OMS MUST act as the FIX initiator (client).
- No REST, JSON, or WebSocket substitution for FIX communication.

---

## 5. Operating Modes

### Mode A — Protocol Mode

Simulates FIX protocol responses using a configurable scenario engine.

No order matching occurs in this mode.

Use Protocol Mode for:
- FIX session state testing.
- Order lifecycle testing with controlled fill sequences.
- Error condition testing (rejections, timeouts, duplicate reports).
- New developer onboarding.
- Regression testing after OMS changes.

### Mode B — Exchange Mode

Simulates an actual exchange environment.

Use Exchange Mode for:
- Multi-counterparty testing.
- Order book behaviour testing.
- Matching algorithm testing.
- Market data testing.

### Mode Isolation

Protocol Mode and Exchange Mode must remain strictly isolated.

An incoming order must be processed by one mode only, based on the current system configuration.

Scenario-generated fills must never be mixed with matching-engine-generated fills.

---

## 6. Non-Functional Requirements

| Requirement | Description |
|---|---|
| Reliability | The application must handle unexpected disconnections, invalid messages, and filesystem errors without crashing. |
| Traceability | Every FIX message (inbound and outbound) must be archived with full metadata. |
| Protocol correctness | FIX session behaviour must comply with the relevant FIX specification. Deviations must be documented and configurable. |
| Maintainability | Code must be modular, clearly documented, and accompanied by automated tests. |
| Security | Credentials must not be hardcoded. Archive access must be restricted. Sensitive FIX fields must not appear in ordinary logs. |
| Testability | All important modules must have unit and integration tests. |
| Deployability | The application must be deployable via Docker on a Linux VPS. |
| Configurability | All session parameters, exchange rules, and scenario behaviour must be externally configurable. |

---

## 7. DSE-Specific Constraints and Unresolved Questions

The following items are UNVERIFIED and require confirmation against DSE specifications or sample messages before implementation.

| Item | Status | Notes |
|---|---|---|
| DefaultApplVerID value | UNVERIFIED | Proposed value: 7 (FIX.5.0). Requires confirmation from DSE counterparty profile. |
| DSE SenderCompID / TargetCompID values | UNVERIFIED | Must be obtained from DSE technical documentation or connectivity guide. |
| DSE-specific custom FIX tags | UNVERIFIED | Unknown. Do not invent. Obtain from DSE FIX specification. |
| DSE heartbeat interval | UNVERIFIED | Standard values are 30 or 60 seconds. Confirm with DSE. |
| DSE session reset policy | UNVERIFIED | When, if ever, does DSE reset sequence numbers? |
| DSE order validation rules | UNVERIFIED | Minimum/maximum order quantity, price band rules, etc. |
| DSE TradingSessionID values | UNVERIFIED | Session identifiers used by DSE. |
| DSE market data feed format | UNVERIFIED | Not in scope for Phase 1. |
| DSE FIX dictionary / data dictionary | UNVERIFIED | Official XML data dictionary from DSE is required for strict validation. |

All configuration items marked UNVERIFIED will be implemented as configurable parameters with documented defaults.

Do not implement any behaviour as DSE-specific unless supported by verified DSE documentation.

---

## 8. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| DSE-specific FIX deviations are unknown | High | Medium | Make all session and application parameters configurable. Mark all assumptions as UNVERIFIED. |
| FIX session recovery is complex | Medium | High | Use proven library for session layer. Implement incrementally with tests. |
| Archive write failures could lose messages | Medium | High | Implement fail-closed policy. Alert immediately on archive failure. Buffer writes. |
| In-memory order book lost on restart | High | Medium | Document recovery strategy. Implement persistence alongside in-memory book. |
| Matching engine incorrectly simulates DSE | High | Medium | Document all assumptions. Do not claim DSE exact parity. Make configurable. |
| Multiple concurrent sessions cause race conditions | Low | High | Use per-session state isolation. Test concurrency explicitly. |

---

## 9. Glossary

| Term | Definition |
|---|---|
| FIX | Financial Information eXchange — a standardised protocol for financial market communication. |
| FIXT | FIX Transport — the session-layer protocol introduced in FIX 5.0. |
| Acceptor | The FIX server that listens for incoming connections. |
| Initiator | The FIX client that initiates a connection. |
| OMS | Order Management System. |
| DSE | Dhaka Stock Exchange. |
| CompID | Company identifier used in FIX session identification. |
| MsgSeqNum | FIX message sequence number. |
| SOH | Start of Heading character (0x01) — the FIX field delimiter. |
| ClOrdID | Client Order ID — unique identifier assigned by the OMS. |
| ExecReport | Execution Report — the FIX message type 8, used to report order state changes. |
| UNVERIFIED | A configuration value or behaviour that has not been confirmed against official DSE documentation. |
