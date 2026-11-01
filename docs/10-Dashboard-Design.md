# Document 10 — Dashboard Design

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Technology

- Templating: EJS
- Dynamic updates: HTMX
- Client interactions: Alpine.js
- Real-time push: Socket.IO
- Styling: Vanilla CSS

---

## 2. Pages

### 2.1 Overview (/)

Panels:
- TCP Server Status (listening/stopped, port, uptime).
- Operating Mode (PROTOCOL / EXCHANGE).
- Active Sessions count.
- Message counts (today: inbound, outbound).
- Order counts (today).
- Archive status (OK / ERROR).
- Database status (connected / disconnected).
- Recent errors list.

Real-time via Socket.IO: session count, message counts, error count.

---

### 2.2 Session Monitor (/sessions)

Table columns:
- Session ID.
- SenderCompID / TargetCompID.
- Status.
- Inbound seq / Outbound seq.
- Last received.
- Last sent.
- Heartbeat status.
- Actions: View, Logout.

Clicking a session opens the session detail page.

Real-time: status and sequence number updates via Socket.IO.

---

### 2.3 Message Monitor (/messages)

Table columns:
- Timestamp.
- Session.
- Direction (IN / OUT badge).
- MsgType + name.
- MsgSeqNum.
- Parse status.
- Processing status.
- Actions: View.

Filters:
- Date range.
- Session.
- Direction.
- MsgType.
- Parse status.

HTMX: filter form submits to HTMX endpoint, replaces table content.

Clicking a message opens the decoded message panel.

Message detail view:
- All metadata fields.
- Decoded tag=value table (tag number, field name, value, Password redacted).
- Raw FIX bytes displayed as escaped string.
- Download raw bytes button.

---

### 2.4 Order Monitor (/orders)

Table columns:
- ClOrdID.
- OrderID.
- Symbol.
- Side.
- Qty.
- Price.
- CumQty.
- LeavesQty.
- Status.
- Mode.
- Session.
- Timestamp.

Clicking an order shows execution history for that order.

---

### 2.5 Scenario Management (/scenarios) — Phase 2

- List scenarios with status (active / inactive).
- Create / Edit / Delete scenarios.
- Configure scenario steps (type, delay, fill quantity).
- View scenario execution history.

---

### 2.6 Configuration (/config)

Sub-pages:
- Session Configurations: CRUD for FIX session configs.
- System Configuration: key-value settings.
- Operating Mode: switch between PROTOCOL and EXCHANGE.
- Archive Settings.

---

## 3. Real-Time Updates

Socket.IO events pushed to dashboard:

| Event | Payload | Target |
|---|---|---|
| session:connected | session summary | Session monitor |
| session:disconnected | session ID, reason | Session monitor |
| session:stateChange | session ID, new state | Session monitor |
| message:inbound | message metadata | Message monitor |
| message:outbound | message metadata | Message monitor |
| archive:failure | error details | Overview panel |
| order:new | order summary | Order monitor |
| order:updated | order ID, new status | Order monitor |
| system:modeChange | new mode | Overview panel |

---

## 4. UI Conventions

- FIX direction: INBOUND shown with blue badge, OUTBOUND with green badge.
- Error states shown with red badge / red background.
- Active session shown with green indicator.
- UNVERIFIED items in configuration UI are labelled accordingly.
- Password fields never displayed; shown as [REDACTED].
- Raw FIX bytes: SOH (0x01) displayed as pipe (|) in the UI for readability.
