# Document 07 — FIX Message Archive

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Purpose

The FIX Message Archive is a mandatory, first-class system requirement.

Every inbound and outbound FIX message must be archived with full fidelity before processing.

The archive provides:
- A complete audit trail of all FIX communication.
- Raw bytes for forensic analysis and message replay.
- Evidence of protocol correctness for debugging.
- Input for session replay in Phase 4.

The archive is NOT optional. It is NOT a logging enhancement. It is a core data store.

---

## 2. Archive Directory Structure

```
storage/
  fix-archive/
    YYYY/
      MM/
        DD/
          session-{session-id}/
            inbound.fix
            outbound.fix
            inbound-index.jsonl
            outbound-index.jsonl
```

- `inbound.fix`: Append-only raw FIX bytes (including SOH 0x01) for all inbound messages received in this session on this date.
- `outbound.fix`: Append-only raw FIX bytes (including SOH 0x01) for all outbound messages sent in this session on this date.
- `inbound-index.jsonl`: JSON Lines file with one metadata record per inbound message.
- `outbound-index.jsonl`: JSON Lines file with one metadata record per outbound message.

---

## 3. Archive Files

### 3.1 Raw FIX Archive (.fix files)

The `.fix` file contains concatenated raw FIX message bytes.

Requirements:
- Preserve original SOH delimiters (0x01).
- Write messages in arrival/send order.
- Append-only. Never overwrite.
- Never store only pipe-delimited or printable-character representations.
- Write the exact bytes received from / sent over TCP.

A message in the `.fix` file looks like (with SOH shown as |):

```
8=FIXT.1.1|9=117|35=A|49=OMSFIRM|56=DSESIM|34=1|52=20261101-06:22:17.000|98=0|108=30|1137=7|10=123|
```

### 3.2 Index File (.jsonl files)

The index file contains one JSON object per line, one per message. It allows searching without scanning raw byte files.

Each index entry:

```json
{
  "archiveId": "uuid-v4",
  "timestamp": "2026-11-01T06:22:17.123Z",
  "direction": "INBOUND",
  "sessionId": "session-abc123",
  "senderCompId": "OMSFIRM",
  "targetCompId": "DSESIM",
  "msgSeqNum": 1,
  "msgType": "A",
  "msgTypeName": "Logon",
  "beginString": "FIXT.1.1",
  "applVerId": "7",
  "checkSum": "123",
  "bodyLength": 117,
  "parseStatus": "OK",
  "processingStatus": "PROCESSED",
  "archiveFile": "storage/fix-archive/2026/11/01/session-abc123/inbound.fix",
  "fileOffset": 0,
  "messageLength": 148,
  "sha256": "optional-hash",
  "notes": ""
}
```

---

## 4. Archive Metadata Fields

| Field | Type | Required | Description |
|---|---|---|---|
| archiveId | UUID | Yes | Unique identifier for this archived message. |
| timestamp | ISO 8601 UTC | Yes | When the message was archived (not SendingTime). |
| direction | Enum | Yes | INBOUND or OUTBOUND. |
| sessionId | String | Yes | Session identifier. |
| senderCompId | String | Yes | FIX SenderCompID (tag 49). |
| targetCompId | String | Yes | FIX TargetCompID (tag 56). |
| msgSeqNum | Integer | Yes | FIX MsgSeqNum (tag 34). |
| msgType | String | Yes | FIX MsgType (tag 35). |
| msgTypeName | String | No | Human-readable MsgType name. |
| beginString | String | Yes | FIX BeginString (tag 8). |
| applVerId | String | No | FIX ApplVerID (tag 1128) if present. |
| checkSum | String | Yes | FIX CheckSum (tag 10). |
| bodyLength | Integer | Yes | FIX BodyLength (tag 9). |
| parseStatus | Enum | Yes | OK, INVALID_CHECKSUM, INVALID_BODYLENGTH, PARSE_ERROR, UNKNOWN. |
| processingStatus | Enum | Yes | PENDING, PROCESSED, ERROR, REJECTED. |
| archiveFile | String | Yes | Relative path to the .fix file. |
| fileOffset | Integer | Yes | Byte offset in the .fix file where this message starts. |
| messageLength | Integer | Yes | Length of this message in bytes in the .fix file. |
| sha256 | String | No | SHA-256 hash of raw message bytes. |
| notes | String | No | Any additional notes (e.g., parse error details). |

---

## 5. Archive Write Pipeline

### 5.1 Processing Stages

The following stages are tracked independently:

1. **TCP_RECEIVED** — bytes received from socket.
2. **ARCHIVED** — bytes written to .fix file and index entry written to .jsonl.
3. **PARSED** — message parsed into structured object.
4. **DISPATCHED** — message dispatched to session/application handler.
5. **PROCESSED** — handler completed processing.
6. **RESPONSE_QUEUED** — response message placed in outbound queue.
7. **RESPONSE_SENT** — response bytes written to socket.

A successful socket.write() means bytes were handed to the OS TCP stack. It does NOT mean the remote OMS received or processed the message.

### 5.2 Inbound Archive Sequence

```
TCP data event
  -> Buffer accumulation
  -> Frame extraction (complete FIX message identified)
  -> [ARCHIVE IMMEDIATELY - raw bytes]
     -> Async write to inbound.fix
     -> Async write to inbound-index.jsonl
  -> [PARSE]
     -> Update index: parseStatus
  -> [DISPATCH + PROCESS]
     -> Update index: processingStatus
```

### 5.3 Outbound Archive Sequence

```
Response constructed
  -> Assign MsgSeqNum
  -> Encode to raw FIX bytes
  -> [ARCHIVE]
     -> Async write to outbound.fix
     -> Async write to outbound-index.jsonl
  -> socket.write()
```

---

## 6. Technical Implementation Requirements

### 6.1 Asynchronous Writes

All archive writes must be asynchronous.

Do not block the TCP processing event loop with synchronous `fs.writeSync()` calls.

Use:
- `fs.createWriteStream()` with append flag for `.fix` files.
- Buffered async write queue for `.jsonl` index files.

### 6.2 Backpressure

Monitor `WriteStream.write()` return value for backpressure.

If the write stream signals backpressure, pause processing and wait for the `drain` event before writing more data.

### 6.3 Archive Failure Policy

Archive write failures are critical errors.

Policy:
1. Log the failure at ERROR level.
2. Raise a system alert (Socket.IO push to dashboard).
3. Increment the archive failure counter in system status.
4. **Do not silently discard the FIX message.**
5. Attempt to write the message to a fallback in-memory queue.
6. Retry archive write on the fallback queue.
7. If archive failure persists beyond a configurable threshold, initiate a controlled simulator shutdown.

This is a **fail-controlled** policy: the simulator is designed to fail rather than silently lose message records.

The fail threshold is configurable.

### 6.4 File Handle Management

- Keep archive file handles open for the duration of a session day.
- Rotate to new files at midnight UTC (or local configurable).
- Close old file handles cleanly.
- Flush all pending writes before closing handles.

### 6.5 Directory Creation

Create the required directory structure on startup and at each daily rotation.

Use `fs.mkdir({ recursive: true })` to create nested directories atomically.

---

## 7. Security

### 7.1 Sensitive Fields

FIX Logon messages may contain:
- Tag 553: Username
- Tag 554: Password

Archive policy for sensitive fields:
- The raw `.fix` file preserves the original bytes including credentials. This is required for full fidelity.
- Restrict access to archive files on the filesystem (file system permissions).
- In decoded display (dashboard, API response): redact Password (tag 554). Display `[REDACTED]`.
- In application logs (Pino): never log Username or Password values.

### 7.2 Archive Access Control

- Archive directory must not be publicly accessible.
- Dashboard archive download API must require authentication.
- Implement file access checks before serving archive files.

### 7.3 Archive Encryption (Future Phase)

Encryption of archive files at rest is a future phase requirement.

Document the intended encryption mechanism when implementing.

---

## 8. Dashboard Integration

The web dashboard must support:

### 8.1 Message Search

Search fields:
- Date range.
- Session ID.
- Direction (INBOUND / OUTBOUND).
- MsgType.
- MsgSeqNum.
- SenderCompID / TargetCompID.
- Parse status.
- Processing status.

### 8.2 Message Detail View

For each message, display:
- All metadata fields.
- Decoded message (tag=value, human-readable field names, values).
- Password field redacted.
- Link to download raw bytes.

### 8.3 Archive Download

Allow downloading:
- Individual message raw bytes.
- Session archive files.

### 8.4 Archive Status

Display on dashboard:
- Archive write status (OK / ERROR).
- Last archive write timestamp.
- Archive failure count.
- Total messages archived (inbound/outbound per session).

---

## 9. Archive Integrity

### 9.1 Append-Only Guarantee

Archive files are append-only. No message may be modified or deleted after writing.

Implement file locking where concurrent write access could occur.

### 9.2 Optional SHA-256 Hashing

If configured, compute and store SHA-256 hash of each message's raw bytes in the index.

This enables archive integrity checks in Phase 4.

### 9.3 Integrity Check Command

Provide a CLI or dashboard command (Phase 4) to:
- Verify file offsets in the index match actual bytes in the .fix file.
- Verify SHA-256 hashes where recorded.
- Report any discrepancies.

---

## 10. Archive Rotation

### 10.1 Daily Rotation

At midnight UTC (configurable), start new archive files:
- Close current file handles.
- Create new dated directory.
- Open new .fix and .jsonl files.
- Update active file path references.

### 10.2 Session Rotation

If a session reconnects after a date boundary, start a new archive day for the session on the new date.

---

## 11. Retention Policy

Retention policy is configurable.

Default: no automatic deletion.

When retention is configured:
- Delete archive directories older than the configured retention period.
- Log all deletions.
- Never delete archive files while they are actively being written.

Document retention policy in deployment guide.
