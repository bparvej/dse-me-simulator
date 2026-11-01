# Document 02 — Technology Stack

**DSE-ME Simulator**
Version: 0.1.0 (Phase 0)
Last Updated: 2026-11-01

---

## 1. Confirmed Technology Stack

| Component | Technology | Version | Justification |
|---|---|---|---|
| Runtime | Node.js | v22 LTS | Mandated. Confirmed present on development machine. Excellent async I/O for TCP servers. |
| Language | JavaScript (CommonJS/ESM) | ES2022+ | Mandated. Aligns with team capability. |
| Backend framework | Express.js | 4.x | Mandated. Lightweight, well-understood. Suitable for admin API and dashboard. |
| TCP communication | Node.js `net` module | Built-in | Mandated. Native Node.js TCP server for FIX acceptor. No additional library needed for TCP layer. |
| FIX protocol | FIXT 1.1 / FIX 5.0 | — | Mandated. Protocol version. |
| FIX parsing/encoding | `fixparser` (npm) | Latest stable | See Section 3 for evaluation. Free tier used for parsing/encoding. Session management implemented independently. |
| Database | MySQL 8 | 8.0+ | Mandated. |
| ORM | Sequelize | 6.x | Mandated. |
| Frontend templating | EJS | 3.x | Mandated. |
| Dynamic UI | HTMX | 1.x | Mandated. |
| Client-side interactions | Alpine.js | 3.x | Mandated. |
| Real-time push | Socket.IO | 4.x | Mandated. |
| Logging | Pino | 8.x | Mandated. Structured JSON logging. Excellent performance. |
| Testing | Jest | 29.x | Mandated. |
| Containerisation | Docker + Docker Compose | Latest stable | Mandated. |
| Configuration | dotenv | 16.x | Mandated. |

---

## 2. Additional Libraries

The following additional libraries are proposed to support the mandated stack.

| Library | Purpose | Justification |
|---|---|---|
| `sequelize-cli` | Database migration management | Required for Sequelize migrations workflow. |
| `mysql2` | MySQL driver for Sequelize | Required by Sequelize for MySQL 8 connectivity. |
| `pino-pretty` | Human-readable development logging | Development-only. Not included in production. |
| `dotenv` | Environment variable loading | Mandated. |
| `uuid` | UUID generation for archive IDs, ExecIDs, etc. | Lightweight. No external dependencies. |
| `jest` | Testing | Mandated. |
| `supertest` | HTTP API testing | Pairs with Jest for REST API integration tests. |
| `nodemon` | Development server restart | Development-only. Not included in production. |

---

## 3. FIX Library Evaluation and Decision

### 3.1 Requirement

The FIX library must support:
- FIX message parsing (tag=value extraction).
- FIX message encoding with correct BodyLength and CheckSum.
- FIXT 1.1 transport protocol.
- FIX 5.0 application protocol.
- Use within a Node.js TCP acceptor context.

### 3.2 Candidates Evaluated

#### Option A: `fixparser` (fixparser.dev)

- Pure TypeScript/JavaScript. No native C++ compilation required.
- Supports FIXT.1.1 and FIX 5.0.
- Available on npm.
- Free tier: message parsing, encoding, validation.
- Pro tier: TCP server/client session management.

**Decision on `fixparser`:**
Use the **free tier** for message parsing and encoding only.

Implement FIX session management (Logon, Logout, Heartbeat, Sequence Number management, Resend Request, Sequence Reset) independently in our own `FixSession` module.

Rationale: The session management requirements of this simulator are specific and well-defined. Implementing session management independently gives us full control, avoids Pro tier licensing costs, and allows us to implement the exact DSE session profile we require.

**Licensing concern:** The free tier of `fixparser` requires a registered license key (valid one year). This is acceptable for internal tooling. Document the renewal procedure.

#### Option B: `jspurefix` (TimelordUK/jspurefix)

- Pure TypeScript/Node.js.
- MIT licensed.
- Full session management including Logon, Heartbeat, Sequence management.
- TCP acceptor and initiator support.
- Dictionary-driven field validation.
- Pluggable persistent message stores.

**Decision on `jspurefix`:**
Hold as the preferred alternative if `fixparser` free tier proves insufficient for parsing or if a full session library becomes necessary.

`jspurefix` is more complex to configure but provides a more complete FIX engine out of the box.

If Phase 1 implementation of the custom session layer encounters significant correctness issues, migrate to `jspurefix`.

This decision must be revisited at the end of Phase 1.

#### Option C: `node-quickfix` (Trumid/node-quickfix)

- Node.js wrapper for the C++ QuickFIX library.
- Requires native compilation with `node-gyp`.
- Historically difficult to build on modern Node.js versions.
- Not recommended for this project due to build complexity and Node.js version compatibility risk.

**Decision on `node-quickfix`:** **Rejected.** Native compilation introduces unacceptable build and maintenance risk on Node.js v22+.

### 3.3 Selected Approach

**FIX Session Layer:** Custom implementation in `src/fix/session/`. Implements FIXT 1.1 session rules.

**FIX Parsing/Encoding:** `fixparser` free tier for tag=value parsing and FIX message construction.

**Fallback:** `jspurefix` if the above approach encounters correctness issues.

This decision is documented in ADR-003.

---

## 4. Module System

Use CommonJS (`require`/`module.exports`) for consistency with the Express.js and Sequelize ecosystem.

Do not mix ESM and CommonJS without explicit justification.

---

## 5. Node.js Version Policy

Minimum required: Node.js v22 LTS.

Document Node.js version in:
- `package.json` engines field.
- `.nvmrc` file.
- `Dockerfile`.
- `README.md`.

---

## 6. Package Manager

Use `npm`. Lock file: `package-lock.json`.

Do not use `yarn` or `pnpm` unless the team makes an explicit decision to switch.
