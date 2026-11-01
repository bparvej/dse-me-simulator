# Document 06 — Message Processing

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Overview

This document describes how FIX messages are parsed, dispatched, and responded to.

---

## 2. FIX Frame Extraction

### 2.1 Stream Buffer

Each TCP connection has a dedicated `Buffer` that accumulates incoming bytes.

On the `data` event from the TCP socket, bytes are appended to the buffer.

### 2.2 Frame Extraction Algorithm

```
function extractFrames(buffer):
  messages = []
  pos = 0

  while (pos < buffer.length):
    // Find BeginString
    beginIdx = findTag(buffer, pos, '8=')
    if not found: break

    // Find BodyLength
    bodyLengthIdx = findTag(buffer, beginIdx, '9=')
    if not found: break
    bodyLength = parseTagValue(buffer, bodyLengthIdx)
    if parse failed: discard bytes up to beginIdx, continue

    // Locate tag 35 (MsgType) start
    msgTypeIdx = bodyLengthIdx + length of '9=<value>\x01'

    // Calculate expected end of message
    // BodyLength = bytes from tag 35 to SOH before tag 10
    // Then tag 10 = '10=XXX\x01' = 7 bytes fixed
    expectedEnd = msgTypeIdx + bodyLength + 7

    if buffer.length < expectedEnd: break  // incomplete frame

    // Extract full message bytes
    msgBytes = buffer.slice(beginIdx, expectedEnd)
    messages.push(msgBytes)
    pos = expectedEnd

  // Remove consumed bytes from buffer
  buffer = buffer.slice(pos)

  return messages, buffer
```

### 2.3 Edge Cases

- **Partial frame:** Buffer contains the start of a message but not the end. Wait for more data.
- **Multiple messages in one TCP packet:** Extract all complete frames in a loop.
- **Garbage bytes before BeginString:** Skip to the next `8=FIXT` occurrence and log a warning.
- **Invalid BodyLength:** Cannot be parsed as integer → discard buffer up to next potential BeginString. Log error. Archive the invalid bytes if possible.

---

## 3. FIX Message Parsing

### 3.1 Parse Steps

Given a complete raw FIX message byte array:

1. Split on SOH delimiter (0x01).
2. For each segment, split on '=' to get tag and value.
3. Store as a Map of tag (integer) -> value (string).
4. Validate CheckSum.
5. Validate BodyLength.
6. Extract required header fields: BeginString, BodyLength, MsgType, SenderCompID, TargetCompID, MsgSeqNum, SendingTime.

### 3.2 CheckSum Validation

```
computed = sum of all bytes from index 0 up to (not including) '10=') % 256
stated = parseInt(messageFields.get(10))
valid = (computed == stated)
```

On failure: archive with parseStatus=INVALID_CHECKSUM. Send Reject (tag 373=9). Do NOT process the message content.

### 3.3 BodyLength Validation

```
startIdx = index of byte after SOH following '9=<value>' field
endIdx = index of byte of '1' in '10=...'
computed = endIdx - startIdx
stated = parseInt(messageFields.get(9))
valid = (computed == stated)
```

On failure: archive with parseStatus=INVALID_BODYLENGTH. Send Reject. Do NOT process.

---

## 4. Message Routing

### 4.1 Session vs. Application Messages

After parsing, determine whether the message is a session-layer or application-layer message.

Session messages (handled by FIX Session Manager):

| MsgType | Name |
|---|---|
| 0 | Heartbeat |
| 1 | Test Request |
| 2 | Resend Request |
| 3 | Reject |
| 4 | Sequence Reset |
| 5 | Logout |
| A | Logon |

All other MsgTypes are application messages and are passed to the Message Dispatcher.

### 4.2 Message Dispatcher

The dispatcher routes application messages based on the active operating mode:

```javascript
function dispatch(parsedMessage, session) {
  if (!session.isActive()) {
    // Reject application messages before Logon
    sendReject(session, parsedMessage, 'Session not active');
    return;
  }

  const mode = config.operatingMode; // 'PROTOCOL' or 'EXCHANGE'

  if (mode === 'PROTOCOL') {
    protocolEngine.handle(parsedMessage, session);
  } else if (mode === 'EXCHANGE') {
    exchangeEngine.handle(parsedMessage, session);
  } else {
    log.error('Unknown operating mode', { mode });
    sendReject(session, parsedMessage, 'Internal configuration error');
  }
}
```

### 4.3 Unknown Message Type Handling

If an application message with an unrecognised MsgType arrives:
1. Archive the message.
2. Send a FIX Reject (MsgType=3) with SessionRejectReason=11 (Invalid MsgType).
3. Log at WARN level.
4. Do NOT crash or close the session.

---

## 5. FIX Message Encoding

### 5.1 Encoding Steps

1. Build the field map (body fields specific to the message type).
2. Prepend standard header fields:
   - 35 (MsgType)
   - 49 (SenderCompID)
   - 56 (TargetCompID)
   - 34 (MsgSeqNum — from SequenceNumberManager)
   - 52 (SendingTime — current UTC time)
   - 1128 (ApplVerID — for application messages in FIXT.1.1)
3. Encode the body: serialize tag=value|SOH for all body fields.
4. Compute BodyLength.
5. Prepend `8=FIXT.1.1|9=<BodyLength>|`.
6. Compute and append `10=<CheckSum>|`.

### 5.2 SendingTime Format

FIX SendingTime format: `YYYYMMDD-HH:MM:SS.sss` (UTC).

Example: `20261101-06:22:17.123`

### 5.3 CheckSum Encoding

CheckSum is expressed as a 3-character zero-padded decimal string.

Example: `10=042|` (not `10=42|`).

---

## 6. Outbound Queue

All outbound FIX messages pass through an outbound queue before being written to the socket.

### 6.1 Queue Requirements

- Messages must be sent in sequence number order.
- Only one message written to socket at a time per session (avoid interleaving).
- Async socket write with backpressure handling.
- If socket write fails: log error, update session status, close session.

### 6.2 Queue Processing Loop

```javascript
async function processQueue(session) {
  while (queue.length > 0 && session.isConnected()) {
    const message = queue.shift();
    
    // Archive outbound message
    await archive.writeOutbound(session, message);
    
    // Write to socket
    const ok = session.socket.write(message.rawBytes);
    if (!ok) {
      await waitForDrain(session.socket);
    }
    
    // Increment outbound sequence number
    session.incrementOutboundSeq();
  }
}
```

---

## 7. Error Handling Summary

| Error Type | Action |
|---|---|
| Invalid CheckSum | Reject (373=9), archive as INVALID_CHECKSUM, continue |
| Invalid BodyLength | Reject (373=9), archive as INVALID_BODYLENGTH, continue |
| Invalid CompID | Reject, Logout, close TCP |
| Invalid MsgSeqNum (too low) | Logout "MsgSeqNum too low", close TCP |
| Invalid MsgSeqNum (too high) | Resend Request, continue processing |
| Unknown MsgType | Reject (373=11), archive, continue |
| Archive write failure | Alert, retry queue, configurable shutdown |
| Socket write failure | Log error, close session, mark DISCONNECTED |
| Unhandled exception in handler | Log error, send Reject if possible, do NOT crash process |
