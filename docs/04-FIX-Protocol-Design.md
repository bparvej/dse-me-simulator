# Document 04 — FIX Protocol Design

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Protocol Version

| Parameter | Value | Status |
|---|---|---|
| Session protocol | FIXT.1.1 | Confirmed |
| Application protocol | FIX.5.0 | Confirmed |
| BeginString | FIXT.1.1 | Confirmed |
| DefaultApplVerID | 7 (FIX.5.0) | UNVERIFIED — confirm with DSE |
| Transport | TCP | Confirmed |

### FIXT 1.1 vs. FIX 4.x

FIX 5.0 introduced transport independence: the session layer (FIXT) is separated from the application layer (FIX 5.0).

This means:
- Session messages use `BeginString=FIXT.1.1`.
- Application messages use the `ApplVerID` field to specify the application version (FIX 5.0 = value `7`).
- The session layer and application layer have separate data dictionaries.

This is distinct from FIX 4.x where BeginString identifies both the session and application version.

---

## 2. FIX Message Structure

A FIX message consists of three sections:

```
8=FIXT.1.1|9=<BodyLength>|35=<MsgType>|<Header Fields>|<Body Fields>|10=<Checksum>|
```

(Pipe character represents SOH = 0x01)

### Standard Header Fields

| Tag | Name | Description |
|---|---|---|
| 8 | BeginString | Protocol version. Always first field. |
| 9 | BodyLength | Byte length from tag 35 to (not including) tag 10. Always second field. |
| 35 | MsgType | Message type identifier. Always third field. |
| 49 | SenderCompID | Sender identifier. |
| 56 | TargetCompID | Target identifier. |
| 34 | MsgSeqNum | Message sequence number. |
| 52 | SendingTime | UTC timestamp of message send. |
| 1128 | ApplVerID | Application version ID. Required for FIXT.1.1 application messages. |

### Standard Trailer Fields

| Tag | Name | Description |
|---|---|---|
| 10 | CheckSum | Modulo-256 checksum of all bytes up to (not including) tag 10. Always last field. |

### CheckSum Calculation

```
Sum of ASCII byte values of all bytes from BeginString to last SOH before CheckSum field.
Result = sum % 256.
Expressed as 3-digit zero-padded decimal string.
```

### BodyLength Calculation

```
Count of bytes from MsgType (tag 35) through the SOH immediately before CheckSum (tag 10).
```

---

## 3. Supported Message Types

### 3.1 Session Messages (FIXT 1.1)

| MsgType | Name | Direction | Phase |
|---|---|---|---|
| 0 | Heartbeat | Both | Phase 1 |
| 1 | Test Request | Both | Phase 1 |
| 2 | Resend Request | Both | Phase 1 |
| 3 | Reject | Outbound | Phase 1 |
| 4 | Sequence Reset | Both | Phase 1 |
| 5 | Logout | Both | Phase 1 |
| A | Logon | Both | Phase 1 |

### 3.2 Application Messages (FIX 5.0)

| MsgType | Name | Direction | Phase |
|---|---|---|---|
| D | New Order Single | Inbound | Phase 2 |
| F | Order Cancel Request | Inbound | Phase 2 |
| G | Order Cancel/Replace Request | Inbound | Phase 2 |
| 8 | Execution Report | Outbound | Phase 2 |
| 9 | Order Cancel Reject | Outbound | Phase 2 |

---

## 4. Message Specifications

### 4.1 Logon (MsgType = A)

**Purpose:** Establish a FIX session.

**Direction:** OMS sends Logon; simulator responds with Logon.

**Required Fields (Inbound):**

| Tag | Name | Value / Notes |
|---|---|---|
| 8 | BeginString | FIXT.1.1 |
| 9 | BodyLength | Calculated |
| 35 | MsgType | A |
| 49 | SenderCompID | OMS CompID |
| 56 | TargetCompID | Simulator CompID (must match configuration) |
| 34 | MsgSeqNum | 1 on new session; or current sequence on reconnect |
| 52 | SendingTime | UTC |
| 98 | EncryptMethod | 0 (None) |
| 108 | HeartBtInt | Heartbeat interval in seconds |
| 1137 | DefaultApplVerID | 7 (FIX.5.0) — UNVERIFIED |

**Optional Fields (Inbound):**

| Tag | Name | Notes |
|---|---|---|
| 553 | Username | May be present — do not log in plaintext |
| 554 | Password | May be present — do not log in plaintext |
| 141 | ResetSeqNumFlag | Y/N |

**Processing:**
1. Validate BeginString.
2. Validate SenderCompID against configured TargetCompID.
3. Validate TargetCompID against configured SenderCompID.
4. Validate MsgSeqNum (see sequence rules in doc 05).
5. Record heartbeat interval.
6. If ResetSeqNumFlag=Y: reset sequence numbers to 1 (document this behaviour — UNVERIFIED for DSE).
7. Respond with Logon (A) using simulator's SenderCompID.
8. Start heartbeat timer.

**Reject conditions:**
- Invalid CompID: send Logout with text explaining reason.
- Invalid BeginString: send Logout.
- Sequence number too low (possible duplicate): send Logout.

**Outbound Logon Fields:**

| Tag | Name | Value |
|---|---|---|
| 49 | SenderCompID | Simulator CompID |
| 56 | TargetCompID | OMS CompID |
| 34 | MsgSeqNum | Next outgoing sequence |
| 98 | EncryptMethod | 0 |
| 108 | HeartBtInt | Echo the received HeartBtInt |
| 1137 | DefaultApplVerID | 7 |

---

### 4.2 Logout (MsgType = 5)

**Purpose:** Terminate a FIX session gracefully.

**Direction:** Both parties can initiate.

**Required Fields:**

| Tag | Name | Notes |
|---|---|---|
| 35 | MsgType | 5 |
| 49 | SenderCompID | — |
| 56 | TargetCompID | — |
| 34 | MsgSeqNum | Next sequence |
| 52 | SendingTime | UTC |

**Optional Fields:**

| Tag | Name | Notes |
|---|---|---|
| 58 | Text | Reason for logout |

**Processing (Inbound):**
1. Respond with Logout (5).
2. Close TCP connection after sending response.
3. Update session state to DISCONNECTED.
4. Preserve sequence numbers.

**Processing (Initiating outbound):**
1. Send Logout with optional Text reason.
2. Wait for response Logout.
3. If no response within timeout, close TCP connection anyway.

---

### 4.3 Heartbeat (MsgType = 0)

**Purpose:** Keep session alive and confirm sequence number synchronisation.

**Direction:** Both parties send periodically.

**Fields:**

| Tag | Name | Notes |
|---|---|---|
| 35 | MsgType | 0 |
| 112 | TestReqID | Only present if this Heartbeat is a response to a Test Request |

**Processing:**
- Inbound Heartbeat: update last-received timestamp. If responding to a Test Request, match TestReqID.
- Outbound Heartbeat: send every HeartBtInt seconds when no other message was sent.

---

### 4.4 Test Request (MsgType = 1)

**Purpose:** Verify that the counterparty is active.

**Direction:** Both parties can send.

**Fields:**

| Tag | Name | Notes |
|---|---|---|
| 35 | MsgType | 1 |
| 112 | TestReqID | Unique identifier for this test request |

**Processing:**
- Inbound Test Request: respond with Heartbeat (0) containing the same TestReqID.
- Outbound Test Request: sent when no Heartbeat received within HeartBtInt + tolerance. If no Heartbeat response received within another HeartBtInt, terminate session.

---

### 4.5 Resend Request (MsgType = 2)

**Purpose:** Request retransmission of messages with sequence numbers in a specific range.

**Direction:** Both parties can send.

**Fields:**

| Tag | Name | Notes |
|---|---|---|
| 7 | BeginSeqNo | First sequence number to resend |
| 16 | EndSeqNo | Last sequence number to resend (0 = infinity) |

**Processing (Inbound):**
1. Determine which messages in the requested range are available for resend.
2. Resend application messages with PossDupFlag=Y.
3. Fill gaps with Sequence Reset Gap Fill (GapFillFlag=Y).
4. Session-level messages (Logon, Logout, Heartbeat) are not resent; replace them with Gap Fill.

---

### 4.6 Sequence Reset (MsgType = 4)

**Purpose:** Reset or advance the sequence number.

**Direction:** Both parties can send.

**Fields:**

| Tag | Name | Notes |
|---|---|---|
| 36 | NewSeqNo | The new sequence number |
| 123 | GapFillFlag | Y = Gap Fill mode; N = Reset mode |

**Gap Fill (GapFillFlag=Y):**
- Sent in response to a Resend Request to skip administrative messages.
- NewSeqNo becomes the next expected incoming sequence number.

**Reset (GapFillFlag=N or absent):**
- Hard reset of sequence numbers.
- NewSeqNo becomes the next expected incoming sequence number.
- Use with extreme caution. Do not use to silently skip gaps.

---

### 4.7 Reject (MsgType = 3)

**Purpose:** Indicate that a received message could not be processed at the session level.

**Direction:** Outbound from simulator.

**Fields:**

| Tag | Name | Notes |
|---|---|---|
| 45 | RefSeqNum | Sequence number of rejected message |
| 371 | RefTagID | Tag number that caused the rejection (if applicable) |
| 372 | RefMsgType | MsgType of rejected message |
| 373 | SessionRejectReason | Reason code |
| 58 | Text | Human-readable reason |

**SessionRejectReason values:**

| Code | Description |
|---|---|
| 0 | Invalid tag number |
| 1 | Required tag missing |
| 2 | Tag not defined for this message type |
| 5 | Value is incorrect |
| 6 | Incorrect data format for value |
| 9 | CompID problem |
| 10 | SendingTime accuracy problem |
| 11 | Invalid MsgType |
| 14 | Tag appears more than once |
| 99 | Other |

---

### 4.8 New Order Single (MsgType = D)

**Purpose:** Submit a new order to the exchange.

**Direction:** Inbound from OMS.

**Required Fields:**

| Tag | Name | Notes |
|---|---|---|
| 11 | ClOrdID | Client order ID. Must be unique per session. |
| 55 | Symbol | Instrument identifier |
| 54 | Side | 1=Buy, 2=Sell |
| 38 | OrderQty | Total order quantity |
| 40 | OrdType | 1=Market, 2=Limit |
| 60 | TransactTime | Transaction time |

**Fields for Limit Orders (OrdType=2):**

| Tag | Name | Notes |
|---|---|---|
| 44 | Price | Limit price. Required for limit orders. |

**Optional Fields:**

| Tag | Name | Notes |
|---|---|---|
| 59 | TimeInForce | 0=Day (default), 1=GTC, 3=IOC, 4=FOK |
| 1 | Account | UNVERIFIED — DSE account identifier |
| 207 | SecurityExchange | UNVERIFIED — DSE exchange identifier |

**UNVERIFIED DSE fields:** Additional fields required by DSE for order submission are not known. Mark as UNVERIFIED until DSE FIX specification is available.

---

### 4.9 Execution Report (MsgType = 8)

**Purpose:** Report order status changes to the OMS.

**Direction:** Outbound from simulator.

**Required Fields:**

| Tag | Name | Notes |
|---|---|---|
| 37 | OrderID | Exchange-assigned order identifier |
| 11 | ClOrdID | Echo from order |
| 17 | ExecID | Unique execution identifier |
| 150 | ExecType | See below |
| 39 | OrdStatus | See below |
| 55 | Symbol | Echo from order |
| 54 | Side | Echo from order |
| 38 | OrderQty | Echo from order |
| 14 | CumQty | Cumulative quantity executed |
| 151 | LeavesQty | Remaining quantity |
| 32 | LastQty | Quantity of this execution (fills only) |
| 31 | LastPx | Price of this execution (fills only) |
| 60 | TransactTime | Time of this execution |

**ExecType values:**

| Value | Description |
|---|---|
| 0 | New (accepted) |
| 4 | Canceled |
| 5 | Replaced |
| 8 | Rejected |
| A | Pending New |
| F | Trade (partial or full fill) |

**OrdStatus values:**

| Value | Description |
|---|---|
| 0 | New |
| 1 | Partially Filled |
| 2 | Filled |
| 4 | Canceled |
| 5 | Replaced |
| 8 | Rejected |
| A | Pending New |

---

### 4.10 Order Cancel Reject (MsgType = 9)

**Purpose:** Inform the OMS that a cancel or cancel/replace request was rejected.

**Direction:** Outbound from simulator.

**Required Fields:**

| Tag | Name | Notes |
|---|---|---|
| 37 | OrderID | Exchange order ID |
| 11 | ClOrdID | ClOrdID from cancel request |
| 41 | OrigClOrdID | Original ClOrdID being cancelled |
| 39 | OrdStatus | Current order status |
| 102 | CxlRejReason | Reason code |
| 434 | CxlRejResponseTo | 1=Cancel Request, 2=Cancel/Replace Request |

**CxlRejReason values:**

| Value | Description |
|---|---|
| 0 | Too late to cancel |
| 1 | Unknown order |
| 2 | Broker / Exchange option |
| 3 | Order already in pending cancel or pending replace status |

---

## 5. FIX Message Framing

### 5.1 TCP Stream Framing Problem

FIX messages arrive over a continuous TCP byte stream. Multiple messages may arrive in one TCP packet. A single message may arrive split across multiple TCP packets.

The framing algorithm:

```
Maintain a byte buffer per TCP connection.

On each TCP data event:
1. Append received bytes to buffer.
2. Loop:
   a. Look for BeginString at current position.
   b. If not found: wait for more data.
   c. Parse BodyLength from tag 9.
   d. Calculate expected message end: position of tag 9 value end + BodyLength + length of "10=XXX|"
   e. If buffer does not contain the full message: wait for more data.
   f. Extract the complete message bytes.
   g. Validate BodyLength and CheckSum.
   h. Pass the message to the parser.
   i. Remove the message from the buffer.
   j. Repeat for remaining buffer content.
```

### 5.2 Malformed Frame Handling

- Invalid BodyLength: send Reject, log error, discard message.
- Invalid CheckSum: send Reject, log error, discard message.
- In both cases: preserve the raw bytes in the archive with parse status = INVALID.
- Never crash or close the connection solely because of a malformed message (unless session state is unrecoverable).

---

## 6. Field Delimiter

The FIX field delimiter is SOH = ASCII 0x01.

- The raw archive must preserve SOH bytes.
- The display representation may use pipe (|) or similar for readability.
- Do not store only pipe-delimited text in the raw archive.

---

## 7. Verified DSE Specific FIX Profile (v1.3.4 Certification Suite)

The following parameters and custom values have been verified from the official DSE FIX Certification Test Cases v1.3.4 (2024):

### 7.1 Protocol Version and Handshake
- **BeginString (8):** `FIXT.1.1`
- **DefaultApplVerID (1137):** `8` (FIX50SP2)
- **First Logon Position Reports:** Upon first logon of the day (Test S1), DSE initiates sequence gap recovery by replying with `MsgSeqNum=4` and sending two `PositionReport (35=AP)` messages (`707=LMT`, `708=100000000`) followed by `SequenceReset (35=4, 123=Y)`.

### 7.2 Custom Order Types and Execution Instructions
- **Tag 40 (OrdType):**
  - `1`: Market
  - `2`: Limit
  - `Z`: **Market At Best** (DSE specific). Converts unmatched remainder into a Limit order at execution price. Rejects with error `(654)` if no opposite order exists in book.
- **Tag 18 (ExecInst):**
  - `S`: **Suspend / Private Order**. Order is accepted into exchange custody but kept off the public order book. Reported with `OrdStatus(39)=Z`.
  - `q`: **Release Private Order**. Sent via `OrderCancelReplaceRequest (35=G)` with `18=q` to release resting private order into the market. Assigns a new `OrderID(37)`.
  - `w`: **WholeOrNone**. Mandatory for all orders on the `BLOCK` board (`762=BLOCK`). Orders without `18=w` on BLOCK board are rejected with error `(1154)`.
- **Tag 39 (OrdStatus) & Tag 150 (ExecType):**
  - `39=Z`: **Private / Suspended**. Acknowledged order not yet released to book.
  - `150=I`: **OrderStatus**. Response to `OrderStatusRequest (35=H)`.
  - `150=C / 39=C`: **Expired**. Emitted when IOC (`59=3`) or FOK (`59=4`) expire unmatched.

### 7.3 DSE Boards (Tag 762 SecuritySubType)
| Value | Board Name | Trading Rules & Constraints |
|---|---|---|
| `PUBLIC` | Main Continuous Board | Normal equity trading; Market, Limit, Market At Best allowed. |
| `BLOCK` | Block Order Board | Minimum value 500k BDT; requires `18=w`; Limit only (`40=2`); IOC allowed; FOK, MinQty, and Iceberg (`1138`) strictly rejected. |
| `BUYIN` | Buy-In Auction Board | **Sell orders only (`54=2`)**. Buy orders rejected with `(1401): You may not enter buy orders.` |
| `SPUBLIC` | SME / Qualified Investor Board | Buy orders restricted to Qualified Investor (`QI`) BOIDs (validated against Tag 1 Account). Non-QI buy rejected with `(1412)`. Sell orders allowed for all accounts. |
| `ATBPUB` | Alternative Trading Board | ATB instruments with price band check `(1408)`. |

### 7.4 Standard DSE Repeating Party ID Block (Tag 453)
Every order and execution report contains the 5-party nested group:
1. `448=<Client BOID>` | `447=C` | `452=5` (Investor ID)
2. `448=<FIX Connector ID>` | `447=C` | `452=11` (Order Origination Trader)
3. `448=<Trader ID>` | `447=C` | `452=36` (Entering Trader)
4. `448=<Trader ID>` | `447=C` | `452=12` (Executing Trader)
5. `448=<Broker Firm Code>` | `447=C` | `452=1` (Executing Firm)

### 7.5 DSE Order Rejection Norm
- When DSE rejects an order (`39=8, 150=8`), Tag 37 (OrderID) is **always set to `NONE`**.
- Error details are conveyed in Tag 58 (Text) prefixed with standard DSE code `(XXXX): Message`.

