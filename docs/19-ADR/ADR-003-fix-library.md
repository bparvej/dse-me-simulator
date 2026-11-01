# ADR-003 — FIX Engine and Library Selection

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** QFL Engineering

---

## Context

The simulator requires FIX message parsing, encoding, and session management for FIXT 1.1 and FIX 5.0.

Building a complete FIX engine from scratch is high-risk and time-consuming.

The FIX session state machine (Logon, Logout, Heartbeat, Sequence management, Resend Request, Sequence Reset) is complex and must be implemented correctly.

---

## Decision

**FIX Parsing and Encoding:** Use the `fixparser` npm library (free tier).

**FIX Session Management:** Implement independently in `src/fix/session/`.

---

## Rationale

### Why `fixparser` for parsing/encoding?

- Pure TypeScript/JavaScript. No native compilation (unlike `node-quickfix`).
- Supports FIXT.1.1 and FIX 5.0.
- Free tier covers message parsing and encoding, which is our primary need.
- Actively maintained.
- No binary dependency issues with Node.js v22.

### Why implement session management independently?

- `fixparser` Pro tier is required for TCP session management. This incurs cost and creates a commercial dependency.
- `jspurefix` (open source) provides full session management but adds significant configuration complexity.
- DSE-ME Simulator's session requirements are well-defined and bounded.
- Implementing session management independently provides:
  - Full control over DSE-specific configuration.
  - No licensing constraints.
  - Simpler debugging and testing.
  - Ability to implement exactly the behaviour documented in docs/05-FIX-Session-Management.md.

---

## Alternatives Considered

### Option A: `fixparser` Pro (full TCP session management)
- Complete FIX engine with TCP acceptor.
- Requires paid commercial license.
- Creates ongoing vendor dependency.
- **Rejected:** Cost and vendor lock-in not justified for an internal tool.

### Option B: `jspurefix` (full open-source FIX engine)
- MIT licensed.
- Full session management.
- TCP acceptor and initiator.
- Pluggable persistence.
- More complex configuration (QuickFIX XML dictionaries).
- **Held as fallback.** If our custom session layer encounters significant correctness issues in Phase 1, migrate to `jspurefix`.

### Option C: `node-quickfix` (C++ QuickFIX wrapper)
- Industry-standard FIX engine.
- Requires `node-gyp` native compilation.
- Known build issues with Node.js 18+, risks with Node.js 22.
- **Rejected:** Native compilation risk is unacceptable.

### Option D: Build entirely from scratch
- No library dependency.
- Maximum control.
- FIX message parsing requires careful handling of BodyLength and CheckSum.
- Session management is well-understood.
- **Partially adopted:** Session management is our own. Parsing uses `fixparser` for robustness.

---

## Consequences

- `fixparser` free tier requires a license key (1-year validity). Document renewal procedure.
- Session management module must be tested thoroughly against FIX spec requirements.
- If `jspurefix` migration is needed in Phase 1, it will involve refactoring session and parser integration.

---

## Review Gate

This decision must be reviewed at the end of Phase 1.

If the custom session layer produces correctness issues or significant complexity, migrate to `jspurefix`.
