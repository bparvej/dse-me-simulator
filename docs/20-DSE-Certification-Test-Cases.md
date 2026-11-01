# Document 20 — DSE FIX Certification Test Cases Suite (v1.3.4 - 2024)

**DSE-ME Simulator**  
Version: 0.1.0  
Last Updated: 2026-11-01  
Reference: Dhaka Stock Exchange FIX Certification Test Cases v1.3.4 (2024)

---

## 1. Executive Summary

DSE-ME Simulator provides first-class, end-to-end support for **all 60 official Dhaka Stock Exchange (DSE) FIX Certification Test Cases** as prescribed in specification version 1.3.4 (2024).

The simulator enables broker and OMS development teams to simulate the entire DSE certification workflow prior to entering formal certification with the exchange. Every test case can be executed either:
1. **Deterministically in Protocol Mode (Mode A):** The simulator follows the exact pre-scripted scenario steps, timing, and error responses specified by DSE.
2. **Dynamically in Exchange Mode (Mode B):** Orders are routed through realistic limit order books across DSE boards (`PUBLIC`, `BLOCK`, `BUYIN`, `SPUBLIC`, `ATBPUB`) with strict matching rules, board validations, circuit breaker rules, and order amendments.

---

## 2. Test Case Classification and Importance Levels

In accordance with DSE official certification procedures:

| Importance Level | Meaning | DSE Certification Impact | Simulator Implementation |
|---|---|---|---|
| **CRITICAL / STOP ON FAIL** | Fundamental protocol or regulatory requirements. | If a broker fails this test, certification stops immediately until resolved. | Automated gate in simulator; flag set in test runner. |
| **IMPORTANT / CONTINUE ON FAIL** | Mandatory workflow features. | Failure does not halt testing immediately, but must be passed before certification sign-off. | Tracked in test results; required for 100% pass mark. |
| **OPTIONAL / CONTINUE ON FAIL** | Optional features or edge cases (e.g., Private Orders, Inbound TestRequest). | Recommended by DSE but not mandatory if broker does not support the feature. | Fully supported in simulator; can be skipped if feature is disabled. |

---

## 3. Comprehensive Test Case Matrix

### 3.1 Category 1: Session & Transport Layer (`S1` – `S12`)

Total: 12 Test Cases

| Case ID | Importance | Description | Key FIX Messages | DSE Specific Behaviour |
|---|---|---|---|---|
| **S1** | **CRITICAL** | First Logon of day and receipt of PositionReports | `35=A`, `35=2`, `35=AP`, `35=4`, `35=0` | Sequence starts at 1/1. DSE replies to Logon with `MsgSeqNum=4` (intentional gap). Broker sends `ResendRequest(35=2)`. DSE replies with 2 `PositionReport(35=AP)` messages (`707=LMT`, `708=100000000`) and `SequenceReset(35=4)` with `GapFillFlag(123)=Y`. |
| **S2** | **CRITICAL** | Session heartbeats | `35=0` | Continuous heartbeat exchange every `HeartBtInt(108)` (default 30s). Verify at least 5 consecutive heartbeats in both directions. |
| **S3** | **CRITICAL** | Logout | `35=5` | Broker initiates `Logout(35=5)`; DSE confirms with `Logout(35=5)` outbound; TCP socket gracefully terminates. |
| **S4** | OPTIONAL | Inbound Test Request | `35=1`, `35=0` | Broker sends `TestRequest(35=1)` with `TestReqID(112)`; DSE immediately echoes `TestReqID` in `Heartbeat(35=0)`. |
| **S5** | OPTIONAL | Outbound Test Request | `35=A`, `35=1`, `35=0` | DSE stops and restarts connector. Broker reconnects with higher `MsgSeqNum`. DSE sends `TestRequest(35=1)`; broker must reply with `Heartbeat(35=0)` containing matching `112=TestReqID`. |
| **S6** | IMPORTANT | Message recovery by Broker | `35=2`, `35=4`, `35=AP` | Broker resets expected sequence to lower value. DSE sends next message. Broker detects gap and sends `ResendRequest(35=2)`. DSE replays with `PossDupFlag(43)=Y`, `OrigSendingTime(122)`, and `GapFillFlag(123)=Y`. |
| **S7** | **CRITICAL** | Message recovery by DSE | `35=2`, `35=D`, `35=4` | DSE detects gap in broker sequence after disconnect. DSE sends `ResendRequest(35=2)`. Broker re-sends missing orders with `43=Y` or skips with `35=4` (`123=Y`). |
| **S8** | IMPORTANT | Broker processing SessionReject by DSE | `35=&`, `35=3` | Broker sends syntactically invalid FIX message (e.g., corrupt repeating group count `453`). DSE rejects with `Reject(35=3)`, `SessionRejectReason(373)=16`, `Text(58)`. |
| **S9** | IMPORTANT | DSE processing SessionReject by broker | `35=D`, `35=8`, `35=3` | Broker marks unsupported tag as required and sends `Reject(35=3)` in response to DSE's `ExecutionReport(35=8)`. DSE processes reject cleanly without dropping TCP session. |
| **S10** | IMPORTANT | Broker processing SequenceReset message | `35=2`, `35=8`, `35=4`, `35=0` | Broker requests resend over range including session messages. DSE replays application messages and skips transport messages with `SequenceReset(35=4, 123=Y, 36=NewSeqNo)`. |
| **S11** | IMPORTANT | DSE processing SequenceReset message | `35=A`, `35=2`, `35=4` | DSE stops connector during logon. On reconnect, DSE requests resend. Broker responds with `SequenceReset(35=4)`. DSE updates expected sequence number and continues. |
| **S12** | OPTIONAL | Unsupported application messages rejected | `35=Q`, `35=3` | Broker sends unsupported message (e.g. `DontKnowTrade 35=Q`). DSE replies with `Session Reject(35=3)`, `RefTagID(371)=35`, `SessionRejectReason(373)=5`, `Text="Unknown MsgType Q"`. |

---

### 3.2 Category 2: Market Orders (`M1` – `M12`)

Total: 12 Test Cases

| Case ID | Importance | Description | Key FIX Fields & Tags | Expected DSE Response / Rule |
|---|---|---|---|---|
| **M1** | **CRITICAL** | Market At Best rejected if no opposite order | `40=Z`, `54=1` (Buy) | DSE rejects with `39=8`, `150=8`, `103=99`, `37=NONE`, `58=(654): At best order cannot be entered if opposite order does not exist`. |
| **M2** | IMPORTANT | Place Private market order; release rejected | `18=S` (Suspend), `18=q` (Release) | Order accepted as private (`39=Z`, `150=0`). Release amendment rejected with `35=9` (`OrdStatus=Z`, `58=(1180): No order within permitted trading price range...`). |
| **M3** | **CRITICAL** | Market order fully executed | `40=1`, `54=1`, `38=500` | DSE sends `150=0/39=0` (New), then `150=F/39=2` (Trade/Filled) with `880=TrdMatchID`, `31=LastPx`, `32=LastQty`, `381=GrossTradeAmt`, `1057=Y` (AggressorIndicator). |
| **M4** | IMPORTANT | Private market order fully executed on release | `18=S`, `18=q`, `38=700` | Private order acknowledged (`39=Z`). Amendment to release (`18=q`) accepted (`150=5/39=0`, new OrderID assigned), followed by fill (`150=F/39=2`). |
| **M5** | **CRITICAL** | Market At Best partially filled, remainder converted to limit | `40=Z`, `38=900` vs 700 available | Acknowledged (`150=0/39=0`), partial fill (`150=F/39=1`, `CumQty=700`, `LeavesQty=200`), remainder converts to resting Limit order at match price. |
| **M6** | IMPORTANT | Market IOC partially filled, remainder expires | `40=1`, `59=3` (IOC) | Partial fill (`150=F/39=1`), followed immediately by expired report (`150=C/39=C`, `LeavesQty=0`). |
| **M7** | IMPORTANT | Market IOC + MinQty expired by DSE | `40=1`, `59=3`, `110=MinQty` | If market has insufficient volume to meet `MinQty`, DSE immediately expires the order (`150=C/39=C`). |
| **M8** | IMPORTANT | Market IOC + MinQty filled | `40=1`, `59=3`, `110=MinQty` | When opposite book meets or exceeds `MinQty`, full fill is reported (`150=F/39=2`). |
| **M9** | IMPORTANT | Market FOK expired by DSE | `40=1`, `59=4` (FOK) | If full quantity cannot be filled immediately, DSE expires order (`150=C/39=C`). |
| **M10** | IMPORTANT | Market FOK filled | `40=1`, `59=4` (FOK) | When entire quantity matches immediately, DSE executes full trade (`150=F/39=2`). |
| **M11** | IMPORTANT | Order Status of a rejected Market order | `35=H`, `790=OrdStatusReqID` | Broker sends `OrderStatusRequest(35=H)` for rejected order. DSE responds with `150=I/39=8` (`Reject`). |
| **M12** | **CRITICAL** | Order for invalid security | `55=INVALID` | DSE rejects with `150=8/39=8`, `103=99`, `37=NONE`, `58=(1402): Unknown Security or Symbol`. |

---

### 3.3 Category 3: Limit Orders (`L1` – `L19`)

Total: 19 Test Cases

| Case ID | Importance | Description | Key FIX Fields & Tags | Expected DSE Response / Rule |
|---|---|---|---|---|
| **L1** | **CRITICAL** | Limit order rejected due to price range trade rule | `40=2`, `44=99` (Price exceeds limit) | DSE rejects with `39=8`, `37=NONE`, `58=(1408): Trade Rule - Last Price limit exceeded. Price cannot be more than <MaxPrice>`. |
| **L2** | IMPORTANT | Limit order rejected due to MinQty != OrderQty without IOC | `40=2`, `110=500`, `38=1000`, `59=0` | DSE rejects with `39=8`, `37=NONE`, `58=(1378): Minimum fill orders must have duration of immediate and minimum fill quantity equal to the order quantity`. |
| **L3** | IMPORTANT | Limit IOC with MinQty fully executed | `40=2`, `59=3`, `110=OrderQty` | Order acknowledged (`150=0`) and immediately filled (`150=F/39=2`). |
| **L4** | IMPORTANT | Limit FOK fully executed | `40=2`, `59=4` | Entire order filled on entry (`150=0` then `150=F/39=2`). |
| **L5** | IMPORTANT | Limit IOC without MinQty expires | `40=2`, `59=3`, no match | Acknowledged (`150=0`), then expires (`150=C/39=C`, `LeavesQty=0`). |
| **L6** | IMPORTANT | Limit IOC partially executed, remainder expires | `40=2`, `59=3`, partial match | Partial trade (`150=F/39=1`), remainder expires (`150=C/39=C`). |
| **L7** | **CRITICAL** | Limit buy partially fills, amended to higher price, fully filled | `35=D`, `35=G` (`44=NewPrice`), `35=8` | Partial fill (`150=F/39=1`), amendment accepted (`150=5/39=1`, `LeavesQty=remainder`), final fill (`150=F/39=2`). |
| **L8** | **CRITICAL** | Limit sell order with 3 amendments (price & qty); one rejected | `35=G` (x3), `35=9` (Reject) | 1st amendment accepted (`150=5`); 2nd amendment rejected (`35=9`, circuit breaker `58=(1408)`); 3rd amendment accepted (`150=5`). |
| **L9** | **CRITICAL** | Limit buy partial fill, accepted amendment, accepted cancel | `35=D`, `35=G`, `35=F` | Partial fill (`150=F/39=1`), amendment accepted (`150=5/39=1`), cancel accepted (`150=4/39=4`, `LeavesQty=0`). |
| **L10** | IMPORTANT | Order type of limit buy amended to market order | `35=G`, `40=1` | Amendment accepted with new `OrdType=1` (`150=5/39=0`), followed by trade execution. |
| **L11** | IMPORTANT | Limit IOC partially executes and expires | `40=2`, `59=3` | Partial trade (`150=F/39=1`), followed by `150=C/39=C`. |
| **L12** | IMPORTANT | Limit FOK accepted then expires | `40=2`, `59=4`, no match | Acknowledged (`150=0/39=0`), then expired (`150=C/39=C`). |
| **L13** | IMPORTANT | Private limit FOK fully executes on release | `18=S`, `40=2`, `59=4`, `18=q` | Private acceptance (`39=Z`), release amendment accepted, full fill executed (`150=F/39=2`). |
| **L14** | IMPORTANT | Iceberg order (`DisplayQty`) multiple fills, then cancel | `1138=DisplayQty`, `38=TotalQty` | Multiple partial fills of displayed slice (`150=F/39=1`); cancel remainder (`35=F`, `150=4/39=4`). |
| **L15** | IMPORTANT | Request and update order status | `35=H`, `790=OrdStatusReqID` | DSE returns `150=I` (`OrderStatus`) containing current cumulative and leaves quantities. |
| **L16** | IMPORTANT | Day order amended to IOC, then expires | `59=0` -> `35=G` (`59=3`) | Amendment accepted (`150=5`), immediately followed by expiration (`150=C/39=C`). |
| **L17** | IMPORTANT | Iceberg order amendment in quantity & display quantity | `35=G`, `38=NewQty`, `1138=NewDisplay` | Amendment accepted (`150=5/39=0`) with refreshed book priority for newly displayed slice. |
| **L18** | IMPORTANT | GTC / GTD orders rejected as unsupported | `59=1` (GTC) or `59=6` (GTD) | DSE rejects with `39=8`, `37=NONE`, `58=(1150): Time In Force not supported on this board`. |
| **L19** | IMPORTANT | Pre-Open session order becomes Unplaced at market open | Pre-open queue -> Trading session | Order accepted in pre-open session (`150=0`); state transitions to Unplaced or enters continuous session book. |

---

### 3.4 Category 4: Block Board Orders (`B1` – `B11`)

Total: 11 Test Cases (`762=BLOCK`)

| Case ID | Importance | Description | Key FIX Fields & Tags | Expected DSE Response / Rule |
|---|---|---|---|---|
| **B1** | **CRITICAL** | Block order executed on acceptance | `762=BLOCK`, `18=w`, `38=40000` | Accepted (`150=0/39=0`), followed by full trade (`150=F/39=2`, `381=GrossTradeAmt`). |
| **B2** | IMPORTANT | Block order with IOC expires | `762=BLOCK`, `18=w`, `59=3` | Acknowledged (`150=0/39=0`), then expires (`150=C/39=C`, `LeavesQty=0`). |
| **B3** | IMPORTANT | Block order with FOK rejected | `762=BLOCK`, `18=w`, `59=4` | DSE rejects with `39=8`, `37=NONE`, `58=(1151): Order with minimum fill restriction may not also have minimum execution restriction`. |
| **B4** | IMPORTANT | Market order on block board rejected | `762=BLOCK`, `40=1` or `Z` | DSE rejects with `39=8`, `37=NONE`, `58=(1152): Market orders are not permitted on BLOCK board`. |
| **B5** | IMPORTANT | Order with MinQty rejected on BLOCK board | `762=BLOCK`, `110=MinQty` | DSE rejects with `39=8`, `37=NONE`, `58=(1151): MinQty not permitted on BLOCK board`. |
| **B6** | IMPORTANT | Iceberg order (`DisplayQty`) rejected on BLOCK board | `762=BLOCK`, `1138=DisplayQty` | DSE rejects with `39=8`, `37=NONE`, `58=(1153): Iceberg orders not allowed on BLOCK board`. |
| **B7** | IMPORTANT | Order without `ExecInst=WholeOrNone` rejected | `762=BLOCK`, without `18=w` | DSE rejects with `39=8`, `37=NONE`, `58=(1154): BLOCK orders must specify ExecInst=WholeOrNone (18=w)`. |
| **B8** | IMPORTANT | Private block order amended and cancelled | `762=BLOCK`, `18=S`, `35=G`, `35=F` | Accepted as private (`39=Z`), amended (`150=5/39=Z`), cancelled (`150=4/39=4`). |
| **B9** | IMPORTANT | Private block order below min market value rejected on release | `762=BLOCK`, `18=S`, `18=q` (< 500k value) | Acceptance as private succeeds; release amendment rejected with `35=9` (`58=(1155): Block order total value below minimum required 500,000 BDT`). |
| **B10** | IMPORTANT | Block order executes on amendment of quantity | `762=BLOCK`, `35=G` (`38=45000`) | Quantity amended to match opposite resting block order; full execution reported immediately (`150=F/39=2`). |
| **B11** | IMPORTANT | Request and update order status on BLOCK board | `762=BLOCK`, `35=H` | DSE returns `150=I` (`OrderStatus`) confirming active resting block order. |

---

### 3.5 Category 5: Miscellaneous & Special Board Cases (`Z1` – `Z6`)

Total: 6 Test Cases

| Case ID | Importance | Description | Board / Special Rule | Expected DSE Response / Rule |
|---|---|---|---|---|
| **Z1** | **CRITICAL** | BUY order on BUYIN board rejected | `762=BUYIN`, `54=1` (Buy) | DSE rejects with `39=8`, `37=NONE`, `58=(1401): You may not enter buy orders.` |
| **Z2** | **CRITICAL** | SELL order on BUYIN board accepted | `762=BUYIN`, `54=2` (Sell) | Accepted with `150=0/39=0`, `762=BUYIN`, rests in Buy-In order book. |
| **Z3** | **CRITICAL** | Buy order by non-QI account rejected on SPUBLIC board | `762=SPUBLIC`, Non-QI BOID in Tag 1 | DSE rejects with `39=8`, `37=NONE`, `58=(1412): Invalid BOID <BOID>`. Only Qualified Investors (QI) can buy on SME board. |
| **Z4** | **CRITICAL** | Buy order by QI account accepted on SPUBLIC board | `762=SPUBLIC`, Valid QI BOID in Tag 1 | Accepted with `150=0/39=0`, `762=SPUBLIC`. |
| **Z5** | **CRITICAL** | Sell order by non-QI account accepted on SPUBLIC board | `762=SPUBLIC`, `54=2` (Sell) | Accepted with `150=0/39=0`. Selling on SME board is permitted for all accounts to allow liquidating positions. |
| **Z6** | **CRITICAL** | Broker reconnection after DSE gateway failover | High Availability Failover | DSE primary stops. Broker connects to backup port/host. Seamless logon without sequence desynchronization. Broker queries order status with `35=H` and gets `150=I`. |

---

## 4. DSE Party Role Structure (Tag 453 Repeating Group)

In DSE execution reports and inbound orders, party identification follows a strict 5-party nested block:

```text
453=5 (NoPartyIDs)
  ├── 448=<Client BOID>      | 447=C | 452=5  (Investor ID)
  ├── 448=<FIX Connector ID> | 447=C | 452=11 (Order Origination Trader / Connector)
  ├── 448=<Trader ID>        | 447=C | 452=36 (Entering Trader)
  ├── 448=<Trader ID>        | 447=C | 452=12 (Executing Trader)
  └── 448=<Broker Code>      | 447=C | 452=1  (Executing Firm)
```

The simulator automatically generates and parses this structure across all test cases.

---

## 5. Certification Verification and Test Runner Integration

The simulator provides:
1. **Interactive Certification Dashboard:** Web UI displaying real-time pass/fail status for all 60 test cases.
2. **Automated CLI Runner:** Run individual cases or complete categories:
   ```bash
   npm run cert -- --category SessionTransport
   npm run cert -- --case S1
   npm run cert -- --all
   ```
3. **Audit Pack Export:** Produces formatted log files and raw FIX capture files formatted for official DSE review.
