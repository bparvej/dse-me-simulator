# Document 03 — Development Roadmap

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## Phase 0 — Architecture and Documentation

**Goal:** Establish the architectural foundation. No production code is written until this phase is complete and approved.

**Deliverables:**

- [x] Project directory structure created.
- [x] README.md.
- [x] docs/00-Project-Overview.md.
- [x] docs/01-System-Architecture.md.
- [x] docs/02-Technology-Stack.md.
- [x] docs/03-Development-Roadmap.md (this document).
- [x] docs/04-FIX-Protocol-Design.md.
- [x] docs/05-FIX-Session-Management.md.
- [x] docs/06-Message-Processing.md.
- [x] docs/07-FIX-Message-Archive.md.
- [x] docs/08-Database-Design.md.
- [x] docs/09-API-Reference.md.
- [x] docs/10-Dashboard-Design.md.
- [x] docs/11-Protocol-Mode.md.
- [x] docs/12-Exchange-Mode.md.
- [x] docs/13-Matching-Engine-Design.md.
- [x] docs/14-Testing-Strategy.md.
- [x] docs/15-Deployment-Guide.md.
- [x] docs/16-Security-Considerations.md.
- [x] docs/17-Troubleshooting.md.
- [x] docs/18-Configuration-Reference.md.
- [x] docs/19-ADR/ADR-001 through ADR-007.
- [x] .env.example.
- [x] package.json (skeleton).
- [x] docker-compose.yml (skeleton).
- [x] Dockerfile (skeleton).
- [x] .gitignore.
- [x] .nvmrc.

**Approval Gate:** Phase 0 output is presented for review. Phase 1 begins only after explicit approval.

---

## Phase 1 — FIX Protocol Foundation

**Goal:** A working TCP FIX acceptor that an independent OMS FIX initiator can connect to, log on, exchange heartbeats, and log out.

**Scope:**

### 1.1 TCP Server
- TCP listener on configured port.
- Accept multiple concurrent connections.
- Per-connection FIX Session instance.
- TCP stream buffer for partial frames.

### 1.2 FIX Session Management
- Logon (A) — receive and respond.
- Logout (5) — receive and initiate.
- Heartbeat (0) — send and receive.
- Test Request (1) — send and respond.
- Sequence number management (inbound + outbound).
- Session state machine.
- Invalid CompID handling (send Reject + Logout).
- Invalid sequence number handling.
- Resend Request (2) — basic implementation.
- Sequence Reset (4) — receive and process.

### 1.3 FIX Message Archive
- Inbound archive (raw bytes + metadata index).
- Outbound archive (raw bytes + metadata index).
- Async writes.
- Archive failure alerting.
- Daily rotation.

### 1.4 MySQL Persistence
- FixSessions table.
- FixMessageMetadata table.
- Migrations for both tables.
- Sequence number persistence.

### 1.5 Web Dashboard (Phase 1 scope)
- Server status panel (TCP status, port, connected sessions).
- Session monitor (per-session CompID, state, sequence numbers, heartbeat status).
- FIX message monitor (inbound/outbound, MsgType, timestamp, direction).
- Socket.IO real-time updates.

### 1.6 Automated Tests
- FIX Logon success.
- FIX Logon with wrong CompID.
- FIX Heartbeat exchange.
- FIX Logout.
- Invalid sequence number handling.
- Partial TCP frame handling.
- Multiple messages in one TCP packet.
- Archive write on inbound message.
- Archive write on outbound message.
- SOH preservation in archive.

**Acceptance Criteria:**
1. Simulator starts on configured TCP port.
2. Independent OMS FIX initiator connects.
3. FIX Logon succeeds with correct CompIDs.
4. Simulator sends correct Logon response.
5. Heartbeats work in both directions.
6. Logout works cleanly.
7. Reconnection after disconnection succeeds.
8. Sequence numbers maintained correctly across reconnection.
9. Every inbound message archived with raw bytes.
10. Every outbound message archived with raw bytes.
11. Dashboard displays session and message activity.
12. All automated tests pass.

**Approval Gate:** Phase 1 acceptance criteria must be met before Phase 2 begins.

---

## Phase 2 — Protocol Mode and Scenario Engine

**Goal:** OMS can send orders and receive configurable FIX response sequences.

**Scope:**

### 2.1 Application Message Support
- New Order Single (D) — receive and process.
- Order Cancel Request (F) — receive and process.
- Order Cancel/Replace Request (G) — receive and process.

### 2.2 FIX Response Messages
- New Order Acknowledgement (Execution Report, ExecType=0).
- Order Pending New (Execution Report, ExecType=A).
- Partial Fill (Execution Report, ExecType=F, OrdStatus=1).
- Full Fill (Execution Report, ExecType=F, OrdStatus=2).
- Cancel Acknowledgement (Execution Report, ExecType=4).
- Cancel Reject (Order Cancel Reject, MsgType=9).
- Replace Acknowledgement (Execution Report, ExecType=5).
- Order Reject (Execution Report, ExecType=8).

### 2.3 Scenario Engine
- Scenario configuration (symbol, side, conditions).
- Scenario step sequencing.
- Configurable delays between steps.
- Default scenario for unmatched orders.
- Scenario activation/deactivation.
- Scenario execution history.

### 2.4 Dashboard Additions
- Order monitor.
- Scenario management UI.
- Scenario execution history.

### 2.5 Database Additions
- Orders table.
- Executions table.
- Scenarios table.
- ScenarioSteps table.
- ScenarioExecutions table.

**Acceptance Criteria:**
1. OMS sends New Order Single.
2. Simulator acknowledges the order.
3. Simulator executes scenario steps (configurable fill sequence).
4. OMS receives partial and full fill execution reports.
5. CumQty and LeavesQty are correct throughout.
6. Cancel and Replace workflows function correctly.
7. Dashboard displays order and scenario activity.

---

## Phase 3 — Exchange Mode

**Goal:** Simulate a real exchange with order books and price-time priority matching.

**Scope:**
- Security master (Securities table).
- Order validation engine.
- In-memory order books (buy + sell per security).
- Price-time priority matching.
- Partial and full execution generation.
- Multiple counterparty support.
- Order cancellation and modification.
- Execution report generation for all matched parties.
- Market data simulation (basic).
- Trading session management.

**Acceptance Criteria:**
1. Buy and sell orders match correctly at the best price.
2. Price priority is observed.
3. Time priority is observed at the same price.
4. Partial executions generate correct execution reports for both parties.
5. CumQty and LeavesQty are correct at all times.
6. No over-execution occurs.
7. Orders survive across multiple matches.
8. Cancel correctly removes a resting order.
9. All automated tests pass.

---

## Phase 4 — Advanced Testing and Replay

**Goal:** Production-readiness, stress testing, and session replay.

**Scope:**
- FIX session replay from archive.
- Scenario replay.
- Concurrent session stress testing.
- Network fault simulation.
- Archive integrity checks.
- Performance metrics dashboard.
- Test report generation.
- Regression test suite.

---

## Documentation Update Policy

After every meaningful implementation change:
- Update affected documentation.
- Add a new entry to the relevant changelog section.
- Update ADRs if an architectural decision changes.
- Never leave documentation that describes behaviour the code no longer implements.
