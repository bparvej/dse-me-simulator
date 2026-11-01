# Document 05 — FIX Session Management

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Overview

FIX session management governs the establishment, maintenance, and termination of a FIX session over TCP.

DSE-ME Simulator implements the FIXT 1.1 session protocol as the FIX acceptor.

The session layer is implemented independently in `src/fix/session/` to provide full control over session behaviour and DSE-specific configuration.

---

## 2. Session State Machine

```
                +-------------+
                | DISCONNECTED|
                +------+------+
                       |
                  TCP connect received
                       |
                +------v------+
                |  CONNECTED  |
                +------+------+
                       |
              Logon (A) received and validated
                       |
                +------v------+
                |    ACTIVE   |<---------+
                +------+------+          |
                       |                 |
             (normal message exchange)   |
                       |                 |
              Heartbeat/Test Request     |
                       +-----------------+
                       |
           Logout received or initiated
                       |
                +------v------+
                | LOGOUT_SENT |
                +------+------+
                       |
             Logout response received
             or timeout
                       |
                +------v------+
                | DISCONNECTED|
                +-------------+
```

### State Definitions

| State | Description |
|---|---|
| DISCONNECTED | No TCP connection. No active session. |
| CONNECTED | TCP connection established. Waiting for Logon. |
| ACTIVE | Logon completed. Normal message exchange in progress. |
| LOGOUT_SENT | Logout initiated (by either party). Waiting for response. |

---

## 3. Session Identification

A FIX session is uniquely identified by the combination of:

- BeginString (FIXT.1.1)
- SenderCompID (of the OMS — the initiator)
- TargetCompID (of the simulator — the acceptor)

The simulator maintains a configuration entry for each expected session.

If a Logon is received with CompIDs that do not match any configured session, the simulator sends a Logout with an explanatory Text message and closes the TCP connection.

---

## 4. Multiple Session Support

The simulator supports multiple concurrent FIX sessions.

Each TCP connection creates an independent FIX session instance with its own:
- State machine.
- Sequence number pair.
- Heartbeat timer.
- Archive file pair.
- Message buffer.

Sessions are isolated from each other. A failure in one session does not affect others.

---

## 5. Sequence Number Management

### 5.1 Rules

- Sequence numbers begin at 1 for a new session.
- Both inbound and outbound sequence numbers are maintained independently.
- The expected inbound sequence number must match the received MsgSeqNum.
- The outbound sequence number increments by 1 for every message sent.
- Sequence numbers persist across TCP disconnections.
- Sequence numbers are **never** automatically reset on reconnection.

### 5.2 Sequence Number Persistence

Sequence numbers are stored in:
- MySQL: `FixSessions.lastInboundSeqNum`, `FixSessions.lastOutboundSeqNum`.
- Written synchronously before confirming a message as processed.

On session startup, sequence numbers are loaded from MySQL.

### 5.3 Sequence Gap Handling

#### Inbound sequence too high (gap detected)

Scenario: Expected=10, received=15.

Action:
1. Detect the gap.
2. Send a Resend Request (2) for the missing range (BeginSeqNo=10, EndSeqNo=14).
3. Wait for the counterparty to resend or gap-fill.
4. Process retransmitted messages in sequence.

#### Inbound sequence too low (possible duplicate or incorrect reset)

Scenario: Expected=15, received=10.

Action:
1. If PossDupFlag=Y is set: check if the message was already processed. If yes, discard silently. If no, process.
2. If PossDupFlag is not set: this is an error. Send Logout with text "MsgSeqNum too low, expected N received M". Close TCP connection.
3. **Do not automatically accept and process messages with unexpected low sequence numbers without PossDupFlag=Y.**

#### Special case: Logon with ResetSeqNumFlag=Y

When a Logon is received with ResetSeqNumFlag=Y:
- Reset both inbound and outbound sequence numbers to 1.
- This is the only legitimate mechanism for sequence number reset.
- Document that DSE's policy on ResetSeqNumFlag is UNVERIFIED.
- Make this behaviour configurable (allow disabling acceptance of ResetSeqNumFlag=Y if DSE does not support it).

### 5.4 Resend Request Processing

When the simulator sends a Resend Request:
- Record the outstanding gap range.
- Process incoming retransmissions and gap fills.
- Track which sequence numbers in the gap have been resolved.
- Do not process application messages that arrive within the gap range as new messages until the gap is filled.

---

## 6. Heartbeat Management

### 6.1 Outbound Heartbeat

- After every `HeartBtInt` seconds in which no message was sent, send a Heartbeat (MsgType=0).
- The `HeartBtInt` value is agreed during Logon.

### 6.2 Inbound Heartbeat Monitoring

- If no message is received from the counterparty within `HeartBtInt + tolerance` seconds, send a Test Request (MsgType=1) with a unique TestReqID.
- If no Heartbeat response containing that TestReqID is received within another `HeartBtInt + tolerance` seconds, terminate the session.
- The tolerance value is configurable (default: 10 seconds).

### 6.3 Test Request Response

When a Test Request (MsgType=1) is received:
- Respond immediately with a Heartbeat (MsgType=0) containing the same TestReqID.

### 6.4 Heartbeat Timer Configuration

| Parameter | Default | Configurable |
|---|---|---|
| HeartBtInt | 30 seconds | Yes (per session) |
| Heartbeat tolerance | 10 seconds | Yes (global) |
| Test request timeout | 30 seconds | Yes (global) |

---

## 7. Session Establishment Sequence

```
OMS (Initiator)                    DSE-ME Simulator (Acceptor)
      |                                       |
      |--- TCP connect ---------------------->|
      |                                       |
      |--- Logon (A) ------------------------>|
      |    SenderCompID=OMS_ID               |
      |    TargetCompID=SIM_ID               |
      |    HeartBtInt=30                     |
      |    DefaultApplVerID=7                |
      |                                       |--- Validate CompIDs
      |                                       |--- Validate MsgSeqNum
      |                                       |--- Load session state
      |                                       |--- Start heartbeat timer
      |<-- Logon (A) -------------------------|
      |    SenderCompID=SIM_ID               |
      |    TargetCompID=OMS_ID               |
      |    HeartBtInt=30                     |
      |                                       |
      |        (Session ACTIVE)              |
```

---

## 8. Session Termination Sequence

### 8.1 OMS-Initiated Logout

```
OMS                           Simulator
  |--- Logout (5) ----------->|
  |                           |--- Process Logout
  |<-- Logout (5) ------------|
  |                           |--- Close TCP
```

### 8.2 Simulator-Initiated Logout

```
Simulator                     OMS
  |--- Logout (5) ----------->|
  |<-- Logout (5) ------------|
  |--- Close TCP connection---|
```

If no Logout response is received within `LogoutResponseTimeout`, close the TCP connection anyway.

### 8.3 Abnormal Disconnection

When TCP is closed without a Logout:
- Record the disconnection in the session log.
- Preserve all sequence numbers.
- Mark the session as DISCONNECTED.
- On reconnect: validate sequence numbers before resuming.

---

## 9. CompID Validation

On receipt of any message, validate:

1. `SenderCompID` (tag 49) of the incoming message must match the configured `TargetCompID` for this session.
2. `TargetCompID` (tag 56) of the incoming message must match the configured `SenderCompID` for this session.

On mismatch:
1. Send a Reject (MsgType=3) with SessionRejectReason=9 (CompID problem).
2. Send a Logout.
3. Close the TCP connection.

---

## 10. Session Configuration Parameters

| Parameter | Description | Default | Required |
|---|---|---|---|
| SenderCompID | Simulator CompID | — | Yes |
| TargetCompID | OMS CompID | — | Yes |
| BeginString | Protocol version | FIXT.1.1 | Yes |
| DefaultApplVerID | FIX application version | 7 (UNVERIFIED) | Yes |
| HeartBtInt | Heartbeat interval (seconds) | 30 | Yes |
| MaxLatency | SendingTime accuracy check (seconds) | 120 | Yes |
| ResetSeqNumOnLogon | Accept ResetSeqNumFlag=Y | true | Yes |
| LogoutResponseTimeout | Seconds to wait for Logout response | 10 | Yes |
| HeartbeatTolerance | Extra seconds before sending Test Request | 10 | Yes |
| SessionPort | TCP port for this session | 9876 | Yes |

---

## 11. SendingTime Validation

FIX requires that SendingTime (tag 52) be within a configurable latency window of the server time.

Validation rule:
- If `|serverTime - SendingTime| > MaxLatency`, send a Reject with SessionRejectReason=10.
- Default MaxLatency: 120 seconds.
- This is configurable per session.

---

## 12. PossDupFlag and PossResend

| Tag | Name | Handling |
|---|---|---|
| 43 | PossDupFlag | Y = this message may be a duplicate. Check if already processed. |
| 97 | PossResend | Y = this message is a possible resend of an unacknowledged message. |

Messages with PossDupFlag=Y and a sequence number lower than expected should be checked against the archive. If already processed, discard silently. If not found in archive, process normally.

---

## 13. Session Recovery on Reconnect

When the OMS reconnects after an abnormal disconnection:

1. OMS sends Logon.
2. Simulator validates CompIDs.
3. Simulator loads last known sequence numbers from persistence.
4. If received MsgSeqNum == expected: resume normally.
5. If received MsgSeqNum > expected: gap detected. Send Resend Request.
6. If received MsgSeqNum < expected (without ResetSeqNumFlag=Y): send Logout "MsgSeqNum too low".
7. If ResetSeqNumFlag=Y: reset sequence numbers and start fresh (if configured to accept).
