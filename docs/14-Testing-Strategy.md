# Document 14 — Testing Strategy

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Testing Framework

Framework: Jest 29.x

Test types:
- Unit tests: test individual modules in isolation.
- Integration tests: test interactions between modules (e.g., parser + session).
- End-to-end tests: a real FIX initiator connects over TCP and exercises the full flow.

Never claim a test passed unless it was actually executed and Jest reported pass.

---

## 2. Test Directory Structure

```
tests/
  unit/
    fix/
      parser.test.js
      encoder.test.js
      framing.test.js
      session.test.js
      sequence.test.js
      heartbeat.test.js
      archive.test.js
    engine/
      scenarioEngine.test.js
      orderValidator.test.js
      orderBook.test.js
      matchingEngine.test.js
      executionReport.test.js
  integration/
    tcpSession.test.js
    orderLifecycle.test.js
    archiveIntegrity.test.js
    databasePersistence.test.js
  e2e/
    fullSessionFlow.test.js
    protocolModeFlow.test.js
    exchangeModeFlow.test.js
```

---

## 3. FIX Session Tests (Phase 1)

| Test | Description | Expected |
|---|---|---|
| Logon success | Valid CompIDs, correct sequence | Logon response sent |
| Logon wrong SenderCompID | Invalid initiator ID | Logout sent, TCP closed |
| Logon wrong TargetCompID | Invalid target ID | Logout sent, TCP closed |
| Logon duplicate | Reconnect with correct seq | Session resumed |
| Heartbeat exchange | Both parties exchange heartbeats | Heartbeat received and sent correctly |
| Test Request response | Simulator sends Test Request, OMS responds | Heartbeat with TestReqID received |
| Heartbeat timeout | OMS stops sending heartbeats | Simulator sends Test Request, then Logout |
| Logout from OMS | OMS sends Logout | Simulator sends Logout response, closes TCP |
| Logout from simulator | Simulator initiates Logout | OMS receives Logout, simulator closes TCP |
| Seq num too high (gap) | OMS sends seq=15 when expected=10 | Resend Request sent for range 10-14 |
| Seq num too low | OMS sends seq=5 when expected=10 (no PossDupFlag) | Logout with "MsgSeqNum too low" |
| PossDupFlag message | OMS resends with PossDupFlag=Y | Processed correctly (deduplicated if seen) |
| Invalid CheckSum | Message with wrong checksum | Reject (373=9), session continues |
| Invalid BodyLength | Message with wrong BodyLength | Reject (373=9), session continues |
| Sequence Reset Gap Fill | OMS sends Sequence Reset GapFill=Y | Sequence advanced, no error |
| Invalid CompID mid-session | CompID changes | Session Reject + Logout |
| SendingTime out of range | SendingTime differs by > MaxLatency | Reject (373=10) |

---

## 4. TCP Stream Tests

| Test | Description | Expected |
|---|---|---|
| Partial frame | Message split across two TCP packets | Reassembled correctly |
| Multiple messages one packet | Two FIX messages in single TCP write | Both extracted and processed |
| Garbage before BeginString | Junk bytes before 8=FIXT | Skipped, message processed |
| Empty TCP packet | Zero-length data event | Buffer unchanged, no error |
| Large message | Message larger than typical socket buffer | Correctly handled |
| Concurrent sessions | Two OMS clients connect simultaneously | Both sessions operate independently |
| Session disconnect during message | TCP closes mid-message | Partial message discarded, reconnect succeeds |

---

## 5. Archive Tests

| Test | Description | Expected |
|---|---|---|
| Inbound archive | Receive a FIX message | Raw bytes in inbound.fix, entry in inbound-index.jsonl |
| Outbound archive | Send a FIX message | Raw bytes in outbound.fix, entry in outbound-index.jsonl |
| SOH preservation | Archive file contains 0x01 | Buffer.indexOf(0x01) finds SOH in archived bytes |
| Invalid message archive | Invalid checksum message | Archived with parseStatus=INVALID_CHECKSUM |
| Multiple sessions | Two sessions archiving simultaneously | Files isolated per session ID |
| Application restart | Archive files persist across restart | Files readable after process restart |
| File offset accuracy | Index fileOffset matches actual file position | Seek to offset produces correct message bytes |
| Archive failure | Simulate disk write failure | Alert raised, message not silently lost |
| Archive rotation | Run session past midnight | New dated directory created |

---

## 6. Order Lifecycle Tests (Phase 2)

| Test | Description | Expected |
|---|---|---|
| New Order acknowledged | Send New Order Single | ExecType=0 Execution Report received |
| New Order rejected | Send order with invalid fields | ExecType=8 Execution Report received |
| Partial fill | Scenario: 50% fill | ExecType=F, OrdStatus=1, correct CumQty/LeavesQty |
| Full fill | Scenario: 100% fill | ExecType=F, OrdStatus=2, LeavesQty=0 |
| Cancel accepted | Send Cancel Request | ExecType=4 Execution Report |
| Cancel rejected | Cancel of filled order | Order Cancel Reject (MsgType=9) |
| Replace accepted | Send Replace Request | ExecType=5 Execution Report |
| Duplicate ClOrdID | Same ClOrdID in two orders | Second order rejected |
| Missing required field | ClOrdID missing | Order rejected with reason |
| Invalid price | Price <= 0 | Order rejected |
| Invalid quantity | Qty <= 0 | Order rejected |

---

## 7. Exchange Mode Tests (Phase 3)

| Test | Description | Expected |
|---|---|---|
| Buy with no sell | Buy order, empty sell book | Order rests on buy side |
| Sell with no buy | Sell order, empty buy side | Order rests on sell side |
| Full match | Buy 100 @ 225 + Sell 100 @ 225 | Both filled, LeavesQty=0 |
| Partial match | Buy 100 @ 225 + Sell 60 @ 225 | Buy partially filled, sell fully filled |
| Price priority | Sell @ 224 and Sell @ 225, Buy arrives | Matches against 224 first |
| Time priority | Two sells @ 224, Buy arrives | Matches against earlier order first |
| No over-execution | Buy 100 + Sell 60 + Sell 60 | CumQty never exceeds OrderQty |
| Cancel resting | Add buy, then cancel | Order removed from book |
| Multiple counterparties | OMS-A buy, OMS-B sell | Both receive execution reports |
| Market order | Market buy, sell book has orders | Matches at best available price |
| CumQty correctness | Series of partial fills | CumQty = sum of all fills |
| LeavesQty correctness | Partial fill | LeavesQty = OrderQty - CumQty |

---

## 8. Test Configuration

Tests use a separate database (configured via `.env.test` or test-specific DATABASE_URL).

Tests should not require an external network connection for unit and integration tests.

End-to-end tests start the full simulator on a test port and connect a real FIX initiator socket.

Use Jest's `beforeAll`/`afterAll` to start/stop the simulator for e2e tests.

---

## 9. Test Execution

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# End-to-end tests
npm run test:e2e

# With coverage
npm run test:coverage
```

Minimum coverage targets (Phase 1):
- FIX parser: 90%
- FIX encoder: 90%
- FIX session manager: 85%
- Archive writer: 80%
