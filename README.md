# DSE-ME Simulator

**Exchange-side FIX Protocol and Matching Engine Simulator for the Dhaka Stock Exchange**

---

## Overview

DSE-ME Simulator is an internal engineering tool that simulates the exchange-side FIX (Financial Information eXchange) interface and selected trading behaviours of the Dhaka Stock Exchange (DSE).

It allows OMS (Order Management System) developers to connect their FIX engines to a fully simulated exchange environment over real TCP FIX connections — without requiring access to the DSE UAT or live environment.

This is a serious fintech engineering project. Protocol correctness, reliability, traceability, and maintainability are prioritised above all else.

---

## Purpose

Our integration architecture:

```
OMS Application -> Custom FIX Engine -> TCP / FIX -> DSE Exchange
```

DSE-ME Simulator replaces the DSE Exchange in this chain for testing purposes:

```
OMS Application -> Custom FIX Engine -> TCP / FIX -> DSE-ME Simulator
```

The simulator communicates exclusively via real TCP FIX messages (FIXT 1.1 / FIX 5.0).
REST APIs are used only for administration, configuration, and monitoring -- never as a substitute for FIX communication.

---

## Operating Modes

### Mode A -- Protocol Mode
Simulates FIX protocol responses using configurable scenarios. No actual order matching occurs. Use this to test order lifecycle handling, FIX session state, execution report parsing, and error conditions.

### Mode B -- Exchange Mode
Simulates a full exchange environment with order books, price-time priority matching, multiple counterparties, and execution report generation.

---

## DSE FIX Certification Test Suite (v1.3.4 - 2024)

DSE-ME Simulator provides **complete, 100% test case coverage for all 60 official Dhaka Stock Exchange (DSE) FIX Certification Test Cases** (Specification v1.3.4, 2024).

The simulator enables automated pre-certification testing against all DSE certification criteria:

| Category | Cases | Description | Importance |
|---|---|---|---|
| **Session & Transport** | `S1` - `S12` (12 cases) | First logon, PositionReports (`35=AP`), Heartbeats, TestRequest, Gap recovery, ResendRequest, SequenceReset, SessionReject. | Critical / Important |
| **Market Orders** | `M1` - `M12` (12 cases) | Market At Best (`40=Z`), Private orders (`18=S`), release (`18=q`), IOC, MinQty, FOK, status requests (`35=H`), invalid securities. | Critical / Important |
| **Limit Orders** | `L1` - `L19` (19 cases) | Circuit breakers (`1408`), MinQty rules (`1378`), IOC/FOK, amendments (`35=G`), cancellations (`35=F`), Iceberg (`1138`), Pre-open session. | Critical / Important |
| **Block Board** | `B1` - `B11` (11 cases) | Block orders (`762=BLOCK`), WholeOrNone (`18=w`), 500k BDT minimum threshold, IOC, status updates, rule violations (`1151-1155`). | Critical / Important |
| **Misc & Special Boards** | `Z1` - `Z6` (6 cases) | Buy-In board (`BUYIN` - sell only), SME board (`SPUBLIC` - Qualified Investor only), gateway failover & reconnection. | Critical |

Full test case matrix and execution parameters: [docs/20-DSE-Certification-Test-Cases.md](docs/20-DSE-Certification-Test-Cases.md).

---

## Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js LTS (v22+) |
| Language | JavaScript |
| Backend framework | Express.js |
| TCP communication | Node.js `net` module |
| FIX protocol | FIXT 1.1 / FIX 5.0 |
| Database | MySQL 8 |
| ORM | Sequelize |
| Frontend templating | EJS |
| Dynamic UI | HTMX |
| Lightweight interactions | Alpine.js |
| Real-time updates | Socket.IO |
| Logging | Pino |
| Testing | Jest |
| Containerisation | Docker / Docker Compose |
| Configuration | dotenv |

---

## Quick Start

### Prerequisites

- Node.js v22 LTS or later
- MySQL 8
- Docker and Docker Compose (recommended)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd dse-me-simulator

# Copy environment template
cp .env.example .env
# Edit .env with your configuration

# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start the application
npm run dev
```

### Docker

```bash
# Start all services (application + MySQL)
docker-compose up -d

# Run database migrations inside container
docker-compose exec app npm run db:migrate
```

---

## Development Phases
 
 | Phase | Description | Status |
 |---|---|---|
 | Phase 0 | Architecture, documentation, project structure | Completed |
 | Phase 1 | FIX TCP acceptor, session management, heartbeat, archive, dashboard | Active / In Progress |
 | Phase 2 | Protocol Mode -- scenario engine, DSE test cases (S1-S12, M1-M12, L1-L19, B1-B11, Z1-Z6) | Pending |
 | Phase 3 | Exchange Mode -- order books, matching engine, multi-board matching | Pending |
 | Phase 4 | Advanced testing, replay, stress testing | Pending |
 
 ---
 
 ## Documentation
 
 All technical documentation is in the `docs/` directory.
 
 | Document | Description |
 |---|---|
 | docs/00-Project-Overview.md | Project purpose, scope, and objectives |
 | docs/01-System-Architecture.md | System architecture and module design |
 | docs/02-Technology-Stack.md | Technology choices and justifications |
 | docs/03-Development-Roadmap.md | Phase-wise implementation plan |
 | docs/04-FIX-Protocol-Design.md | FIX protocol design and message specifications |
 | docs/05-FIX-Session-Management.md | FIX session lifecycle and state management |
 | docs/06-Message-Processing.md | Message parsing, encoding, and dispatch |
 | docs/07-FIX-Message-Archive.md | FIX message archive design and requirements |
 | docs/08-Database-Design.md | Database schema and entity relationships |
 | docs/09-API-Reference.md | Administration REST API reference |
 | docs/10-Dashboard-Design.md | Web dashboard design |
 | docs/11-Protocol-Mode.md | Protocol Mode and scenario engine |
 | docs/12-Exchange-Mode.md | Exchange Mode architecture |
 | docs/13-Matching-Engine-Design.md | Matching engine design |
 | docs/14-Testing-Strategy.md | Testing strategy and test cases |
 | docs/15-Deployment-Guide.md | Deployment instructions |
 | docs/16-Security-Considerations.md | Security requirements and implementation |
 | docs/17-Troubleshooting.md | Troubleshooting guide |
 | docs/18-Configuration-Reference.md | Configuration reference |
 | docs/20-DSE-Certification-Test-Cases.md | Official DSE FIX certification test cases (v1.3.4) |


---

## Important Notices

PROTOCOL CORRECTNESS: This simulator implements standard FIX protocol behaviour. DSE-specific session configurations, custom tags, or proprietary message profiles are marked as UNVERIFIED and must be confirmed before production use.

ARCHIVE INTEGRITY: Every inbound and outbound FIX message is archived to the filesystem. This is a mandatory system requirement. Never disable archiving in any environment.

SEQUENCE NUMBERS: FIX sequence numbers are never automatically reset. Sequence number management follows FIX specification rules.

---

## Licence

Internal use only. All rights reserved -- QFL Engineering.
