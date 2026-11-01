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
| Phase 0 | Architecture, documentation, project structure | In Progress |
| Phase 1 | FIX TCP acceptor, session management, heartbeat, archive, dashboard | Pending |
| Phase 2 | Protocol Mode -- scenario engine, order lifecycle | Pending |
| Phase 3 | Exchange Mode -- order books, matching engine | Pending |
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

---

## Important Notices

PROTOCOL CORRECTNESS: This simulator implements standard FIX protocol behaviour. DSE-specific session configurations, custom tags, or proprietary message profiles are marked as UNVERIFIED and must be confirmed before production use.

ARCHIVE INTEGRITY: Every inbound and outbound FIX message is archived to the filesystem. This is a mandatory system requirement. Never disable archiving in any environment.

SEQUENCE NUMBERS: FIX sequence numbers are never automatically reset. Sequence number management follows FIX specification rules.

---

## Licence

Internal use only. All rights reserved -- QFL Engineering.
