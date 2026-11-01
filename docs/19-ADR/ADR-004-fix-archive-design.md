# ADR-004 — FIX Message Archive Design

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** QFL Engineering

---

## Context

Every FIX message must be archived for traceability, debugging, and potential replay.

The archive must preserve raw bytes (including SOH delimiters) and must be reliable.

---

## Decision

Use a filesystem-based archive: append-only `.fix` files for raw bytes and `.jsonl` files for metadata indexes.

Structured metadata is also stored in the `FixMessageMetadata` MySQL table.

---

## Rationale

### Why filesystem, not database-only?

- Raw FIX bytes (including SOH = 0x01) are binary data. Storing binary in MySQL BLOBs adds complexity and increases database size significantly.
- The filesystem is the natural and efficient store for append-only binary log files.
- Filesystem files are directly downloadable, inspectable, and replayable without database queries.
- The pattern follows industry practice (FIX gateways archive to log files).

### Why separate MySQL metadata?

- MySQL enables indexed search by MsgType, MsgSeqNum, direction, date range.
- Searching raw `.fix` files for specific fields is slow and complex.
- MySQL metadata provides the search index; the `.fix` file provides the authoritative raw record.

### Why JSON Lines (.jsonl) index files?

- Self-describing, human-readable.
- Can be read without database connectivity.
- Append-only, consistent with the `.fix` files.
- Provides a filesystem-level backup of message metadata independent of MySQL.

### Why not pipe-delimited text?

- Pipe-delimited display text loses the original byte values.
- Session replay in Phase 4 requires exact bytes.
- Forensic analysis of protocol errors requires exact bytes.

---

## Consequences

- Filesystem must be on persistent, durable storage. Do not use ephemeral container storage.
- Archive failure must be treated as a critical error, not a log warning.
- Archive file access must be controlled (security).
- Archive write must be asynchronous to avoid blocking the event loop.
- Rotating, managing, and searching archive files adds operational complexity.

---

## Alternative Considered

**Store all FIX bytes in MySQL BLOBs:**
- Simpler architecture (single data store).
- Performance degradation as the table grows.
- Backup complexity.
- Does not provide direct file download.
- **Rejected.**
