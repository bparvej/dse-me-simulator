# Document 01 — System Architecture

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Status: Architecture Design
Last Updated: 2026-11-01

---

## 1. Overview

DSE-ME Simulator is a modular monolith. All components run within a single Node.js process. Clear module boundaries enable future extraction into microservices if required.

The application's primary interface is a TCP FIX acceptor.

A web dashboard and REST administration API are secondary interfaces.

---

## 2. High-Level Architecture Diagram

```
                     External OMS Application
                      (FIX Initiator)
                              |
                              | TCP Connection (FIXT 1.1 / FIX 5.0)
                              |
                    +---------v-----------+
                    |  TCP FIX Acceptor   |
                    |  (net.createServer) |
                    +----+----------------+
                         |
                    +----v-----------------+
                    |  FIX Session Manager |
                    |  - Session state     |
                    |  - Heartbeat         |
                    |  - Sequence numbers  |
                    |  - Logon/Logout      |
                    +----+-----------------+
                         |
              +----------v-----------+
              |  FIX Parser/Encoder  |
              |  - Frame extraction  |
              |  - Field parsing     |
              |  - Message encoding  |
              +----------+-----------+
                         |
              +----------v-----------+
              |  FIX Message Archive |
              |  - Raw bytes         |
              |  - Metadata index    |
              +----------+-----------+
                         |
              +----------v-----------+
              |  Message Dispatcher  |
              |  - Route by MsgType  |
              |  - Mode selection    |
              +-----+--------+-------+
                    |        |
          +---------v-+    +-v-----------+
          | Protocol  |    |  Exchange   |
          |   Mode    |    |   Mode      |
          |  Engine   |    |   Engine    |
          +---------+-+    +-+-----------+
                    |        |
          +---------v--------v-----------+
          |   FIX Response Engine        |
          |   - Build response messages  |
          |   - Execution reports        |
          +---------+--------------------+
                    |
          +---------v--------------------+
          |   Outbound FIX Queue         |
          |   - Ordered, async output    |
          +---------+--------------------+
                    |
                    | TCP write
                    v
              External OMS

                    |
          +---------v--------------------+
          |   MySQL Persistence Layer    |
          |   - Session metadata         |
          |   - Order records            |
          |   - Execution records        |
          |   - Scenario configs         |
          +------------------------------+

          +------------------------------+
          |   Web Dashboard              |
          |   (Express + EJS + HTMX)     |
          +------------------------------+

          +------------------------------+
          |   REST Admin API             |
          |   (Express.js)               |
          +------------------------------+

          +------------------------------+
          |   Real-time Push             |
          |   (Socket.IO)                |
          +------------------------------+
```

---

## 3. Module Inventory

### 3.1 TCP Server / FIX Acceptor

**Responsibility:** Accept TCP connections from FIX initiator clients.

**Key behaviours:**
- Listen on a configured TCP port.
- Accept multiple simultaneous client connections.
- Create a per-connection FIX session instance.
- Handle TCP-level events: `connect`, `data`, `close`, `error`, `timeout`.
- Implement TCP stream buffering to handle partial FIX frames and multi-message TCP packets.

**Files:** `src/fix/acceptor/TcpAcceptor.js`

---

### 3.2 FIX Session Manager

**Responsibility:** Manage the lifecycle of a single FIX session.

**Key behaviours:**
- Maintain session state machine: DISCONNECTED, CONNECTED, LOGON_SENT, ACTIVE, LOGOUT_SENT.
- Process session-level messages: Logon (A), Logout (5), Heartbeat (0), Test Request (1), Resend Request (2), Sequence Reset (4), Reject (3).
- Enforce incoming sequence number validation.
- Manage outgoing sequence numbers.
- Send Heartbeats on schedule.
- Send Test Requests on missed heartbeats.
- Detect and handle heartbeat timeout.
- Handle session recovery: detect gaps, issue Resend Requests.
- Maintain per-session configuration: SenderCompID, TargetCompID, heartbeat interval.
- Support multiple concurrent sessions (one instance per connection).

**Files:** `src/fix/session/FixSession.js`, `src/fix/session/SessionState.js`, `src/fix/session/HeartbeatManager.js`

---

### 3.3 Sequence Number Manager

**Responsibility:** Maintain persistent incoming and outgoing FIX sequence numbers per session.

**Key behaviours:**
- Load sequence numbers from persistent store on session startup.
- Save sequence numbers after every message send/receive.
- Never automatically reset sequence numbers unless a valid FIX ResetSeqNumFlag=Y Logon is received.
- Detect sequence number gaps.
- Support sequence reset on explicit administrator command.

**Files:** `src/fix/session/SequenceNumberManager.js`

**Storage:** MySQL `FixSessions` table (sequence number columns) + optional file-based backup.

---

### 3.4 FIX Parser and Encoder

**Responsibility:** Parse raw FIX byte frames into structured message objects; encode structured message objects into raw FIX byte frames.

**Key behaviours:**
- Extract individual FIX messages from a TCP stream buffer (frame by delimiter and BodyLength).
- Parse tag=value fields separated by SOH (0x01).
- Validate BodyLength and CheckSum.
- Detect and handle malformed messages.
- Encode structured message objects into FIX wire format with correct BodyLength and CheckSum.
- Preserve original SOH delimiters.
- Support FIXT 1.1 session messages and FIX 5.0 application messages.

**Files:** `src/fix/parser/FixParser.js`, `src/fix/encoder/FixEncoder.js`

**Library:** Uses `fixparser` npm library for message parsing and encoding assistance. Session management is implemented independently (see ADR-003).

---

### 3.5 FIX Message Archive

**Responsibility:** Append-only archive of every inbound and outbound FIX message to the filesystem.

**Key behaviours:**
- Archive raw FIX bytes (including SOH delimiters) to `inbound.fix` / `outbound.fix`.
- Write a JSON Lines metadata index to `inbound-index.jsonl` / `outbound-index.jsonl`.
- Archive is asynchronous and non-blocking.
- Archive write failures generate visible alerts and are never silently swallowed.
- Implement buffering and backpressure.
- Implement daily file rotation by session.
- Support archive search and download from dashboard.
- Sensitive fields (passwords) are redacted in decoded display but preserved in raw archive.

**Archive directory structure:**
```
storage/fix-archive/
  YYYY/
    MM/
      DD/
        session-{session-id}/
          inbound.fix
          outbound.fix
          inbound-index.jsonl
          outbound-index.jsonl
```

**Files:** `src/fix/archive/FixArchive.js`, `src/fix/archive/ArchiveIndex.js`

---

### 3.6 Message Dispatcher

**Responsibility:** Route parsed FIX application messages to the appropriate processing engine based on the current operating mode.

**Key behaviours:**
- Receive parsed application messages from the FIX Session Manager.
- Determine the active operating mode (Protocol or Exchange).
- Route to the appropriate mode engine.
- Handle unknown message types with a FIX Reject response.

**Files:** `src/fix/dispatcher/MessageDispatcher.js`

---

### 3.7 Protocol Scenario Engine (Mode A)

**Responsibility:** Respond to FIX application messages using configurable pre-defined scenarios.

**Key behaviours:**
- Match incoming orders to configured scenarios by symbol, side, quantity, or other criteria.
- Execute scenario steps: send acknowledgement, send fill reports, send rejections.
- Support configurable delays between scenario steps.
- Support configurable execution quantities.
- Execute scenario steps asynchronously.
- Record scenario execution history.

**Files:** `src/engine/protocol/ScenarioEngine.js`, `src/engine/protocol/ScenarioExecutor.js`, `src/engine/protocol/ScenarioMatcher.js`

---

### 3.8 Order Validation Engine (Mode B)

**Responsibility:** Validate incoming orders before submission to the order book.

**Key behaviours:**
- Validate required FIX fields.
- Validate symbol against security master.
- Validate order quantity and price.
- Validate order type.
- Apply configurable validation rules.
- Return a FIX Order Reject if validation fails.

**Files:** `src/engine/exchange/OrderValidator.js`

---

### 3.9 Order Book (Mode B)

**Responsibility:** Maintain in-memory buy and sell order queues per security, sorted by price-time priority.

**Key behaviours:**
- Accept resting orders.
- Cancel resting orders.
- Modify resting orders.
- Return the best bid and ask.
- Support multiple securities simultaneously.

**Files:** `src/engine/orderbook/OrderBook.js`, `src/engine/orderbook/PriceLevelQueue.js`

---

### 3.10 Matching Engine (Mode B)

**Responsibility:** Match incoming orders against resting orders in the order book using price-time priority.

**Key behaviours:**
- Match market and limit orders.
- Generate partial and full executions.
- Generate Execution Reports for all parties.
- Update CumQty and LeavesQty correctly.
- Prevent over-execution.
- Use price-time priority as the default algorithm.
- Support configurable matching algorithm selection.

**Files:** `src/engine/matching/MatchingEngine.js`, `src/engine/matching/PriceTimePriority.js`

---

### 3.11 Execution Report Generator

**Responsibility:** Construct and send FIX Execution Report (MsgType=8) messages.

**Key behaviours:**
- Generate New Order Acknowledgement (ExecType=0, OrdStatus=0).
- Generate Pending Acknowledge (ExecType=A, OrdStatus=A).
- Generate Partial Fill (ExecType=F, OrdStatus=1).
- Generate Full Fill (ExecType=F, OrdStatus=2).
- Generate Cancel Acknowledgement (ExecType=4, OrdStatus=4).
- Generate Replace Acknowledgement (ExecType=5, OrdStatus=0).
- Generate Rejection (ExecType=8, OrdStatus=8).
- Assign unique ExecID to every execution.
- Calculate correct CumQty and LeavesQty.

**Files:** `src/engine/ExecutionReportBuilder.js`

---

### 3.12 FIX Response Engine

**Responsibility:** Build and queue outbound FIX messages for transmission.

**Key behaviours:**
- Assign outgoing MsgSeqNum.
- Add standard header fields.
- Compute BodyLength and CheckSum.
- Queue message for transmission.
- Handle queue backpressure.

**Files:** `src/fix/response/FixResponseEngine.js`, `src/fix/response/OutboundQueue.js`

---

### 3.13 MySQL Persistence Layer

**Responsibility:** Store structured operational data in MySQL 8.

**Key behaviours:**
- Use Sequelize ORM.
- Use database migrations for schema management.
- Store session metadata, sequence numbers, orders, executions, scenarios, and configuration.
- Support transactions for related operations.

**Files:** `src/db/models/`, `src/db/migrations/`, `src/db/seeders/`

---

### 3.14 Administration API

**Responsibility:** Provide a REST API for dashboard and administration operations.

**Key behaviours:**
- Session management endpoints (list, detail, terminate).
- Message archive search and download endpoints.
- Order and execution query endpoints.
- Scenario management endpoints (CRUD, activate, execute).
- Configuration endpoints.
- System status endpoints.

**Files:** `src/api/routes/`

---

### 3.15 Web Dashboard

**Responsibility:** Provide a real-time operational dashboard for monitoring and administration.

**Key behaviours:**
- Display TCP server status, active sessions, message counts.
- Display session details (sequence numbers, heartbeat state).
- Display decoded and raw FIX messages.
- Display orders and executions.
- Provide scenario management UI.
- Provide configuration screens.
- Use Socket.IO for real-time updates.
- Use HTMX for dynamic partial page updates.
- Use Alpine.js for lightweight client-side interactions.

**Files:** `src/web/views/`, `src/web/public/`

---

## 4. Data Flow

### 4.1 Inbound Message Flow

```
TCP data event
    -> Stream buffer (accumulate bytes)
    -> Frame extractor (extract by BodyLength/delimiter)
    -> FIX Parser (parse tag=value fields)
    -> Archive writer (async: raw bytes + metadata)
    -> Session layer check (is this a session message?)
        -> YES: FIX Session Manager handles it
        -> NO: Message Dispatcher
            -> Mode A: Protocol Scenario Engine
            -> Mode B: Order Validator -> Order Book/Matching Engine
    -> Execution Report / Response Builder
    -> Outbound Queue
    -> TCP write
    -> Archive writer (outbound)
```

### 4.2 Heartbeat Flow

```
Heartbeat timer fires
    -> FIX Session Manager checks last received time
    -> If no message received within heartbeat interval:
        -> Send Test Request (35=1)
    -> If no response to Test Request within heartbeat interval:
        -> Terminate session (send Logout, close socket)
    -> Otherwise: send Heartbeat (35=0)
```

---

## 5. Process Architecture

The application runs as a single Node.js process.

Key considerations:
- Node.js event loop handles all I/O asynchronously.
- CPU-bound operations (matching engine on large order books) must be monitored for event loop blocking.
- If matching engine causes event loop blocking in Phase 3, migrate to a Worker Thread.
- All archive writes are asynchronous to avoid blocking the TCP processing loop.

---

## 6. Deployment Architecture

```
+-------------------------------------------------------------+
|  Linux VPS / Docker Host                                    |
|                                                             |
|  +---------------------------+  +---------------------+    |
|  |  DSE-ME Simulator         |  |  MySQL 8            |    |
|  |  (Node.js)                |  |                     |    |
|  |  Port: 9876 (FIX TCP)     |  |  Port: 3306         |    |
|  |  Port: 3000 (HTTP API)    |  |  (internal only)    |    |
|  |                           |  |                     |    |
|  |  Volumes:                 |  |  Volume:            |    |
|  |  - storage/fix-archive    |  |  - mysql-data       |    |
|  |  - logs/                  |  |                     |    |
|  +---------------------------+  +---------------------+    |
|                                                             |
+-------------------------------------------------------------+

External OMS (FIX Initiator) connects to Port 9876 (FIX TCP)
Administrators connect to Port 3000 (HTTP Dashboard) -- restrict access
```

---

## 7. Module Dependencies

```
TcpAcceptor
  -> FixSession (one per connection)
       -> SequenceNumberManager
       -> HeartbeatManager
       -> FixParser (inbound)
       -> FixArchive (inbound)
       -> MessageDispatcher
            -> ScenarioEngine (Protocol Mode)
            -> OrderValidator + MatchingEngine (Exchange Mode)
       -> ExecutionReportBuilder
       -> FixResponseEngine
            -> OutboundQueue
            -> FixEncoder (outbound)
            -> FixArchive (outbound)
            -> socket.write()

PersistenceLayer (used by multiple modules)
  -> FixSessions
  -> FixMessageMetadata
  -> Orders
  -> Executions
  -> Scenarios

AdminAPI
  -> PersistenceLayer
  -> FixArchive (search, download)
  -> TcpAcceptor (status)
  -> SessionManager (list, detail, terminate)

WebDashboard
  -> AdminAPI
  -> Socket.IO (real-time updates)
```
